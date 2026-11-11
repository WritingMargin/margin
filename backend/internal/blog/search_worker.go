package blog

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// RunSearchNotifications drains the durable outbox without delaying post saves.
func (a *App) RunSearchNotifications(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		a.processSearchNotifications(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
func (a *App) processSearchNotifications(ctx context.Context) {
	defer func() {
		if err := recover(); err != nil && ctx.Err() == nil {
			log.Printf("[search submission] %v", err)
		}
	}()
	origin := a.indexNowTarget(ctx)
	if origin == "" {
		return
	}
	now := time.Now().Unix()
	// Claim a bounded, ordered batch in one statement. The lease permits recovery
	// if the process stops during a submission.
	claimed := a.DB.Must(ctx, `UPDATE search_notifications SET next_attempt=$3
		WHERE url IN (SELECT url FROM search_notifications WHERE origin=$1 AND status IN ('queued','retrying')
			AND next_attempt<=$2 ORDER BY next_attempt,url LIMIT 100)
		AND origin=$1 AND status IN ('queued','retrying') AND next_attempt<=$2
		RETURNING *`, origin, now, now+60)
	if len(claimed) == 0 {
		return
	}
	settings := a.searchEngineSettings(ctx)
	status, retryAfter := a.sendIndexNow(ctx, origin, settings.str("key"), claimed)
	a.finishSearchNotifications(ctx, claimed, status, retryAfter)
}
func (a *App) sendIndexNow(ctx context.Context, origin, key string, rows []Row) (int, time.Duration) {
	u, _ := url.Parse(origin)
	urls := []string{}
	for _, row := range rows {
		urls = append(urls, row.str("url"))
	}
	payload := Row{"host": u.Hostname(), "key": key, "keyLocation": origin + "/indexnow.txt", "urlList": urls}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.indexnow.org/indexnow", bytes.NewBufferString(encode(payload)))
	must(err)
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	client := *a.Client
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(req)
	if err != nil {
		return 0, 0
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	return response.StatusCode, indexNowRetryAfter(response.Header.Get("Retry-After"))
}
func indexNowRetryAfter(value string) time.Duration {
	if seconds, err := strconv.Atoi(value); err == nil && seconds > 0 {
		return min(time.Duration(seconds)*time.Second, 24*time.Hour)
	}
	if date, err := http.ParseTime(value); err == nil {
		return max(0, min(time.Until(date), 24*time.Hour))
	}
	return 0
}
func indexNowResult(status int, attempts int) (string, string) {
	switch status {
	case 200:
		return "submitted", "Bing and other IndexNow search engines received the URLs."
	case 202:
		return "verification_pending", "URLs received; IndexNow is checking the verification key."
	case 400, 422:
		return "failed", "IndexNow rejected the URLs. Check your public blog URL, then submit again."
	}
	if attempts >= 8 {
		return "failed", "Submission failed after 8 attempts. Check your configuration and submit again."
	}
	if status == 403 {
		return "retrying", "IndexNow could not verify ownership. Make sure the public verification file is reachable. Retrying automatically."
	}
	if status == 429 {
		return "retrying", "IndexNow is rate limiting requests. Retrying automatically."
	}
	return "retrying", "Search submission is temporarily unavailable. Retrying automatically."
}
func (a *App) finishSearchNotifications(ctx context.Context, rows []Row, status int, retryAfter time.Duration) {
	now := time.Now()
	for _, row := range rows {
		attempts := int(row["attempts"].(int64)) + 1
		state, message := indexNowResult(status, attempts)
		delay := max(min(time.Minute*time.Duration(1<<min(attempts-1, 6)), time.Hour), retryAfter)
		submitted := row["submitted_at"]
		if status == 200 || status == 202 {
			submitted = now.UTC().Format(time.RFC3339Nano)
		}
		if status != 0 {
			message += fmt.Sprintf(" (HTTP %d)", status)
		}
		a.DB.Must(ctx, "UPDATE search_notifications SET status=$1,attempts=$2,next_attempt=$3,message=$4,attempted_at=$5,submitted_at=$6 WHERE url=$7 AND revision=$8", state, attempts, now.Add(delay).Unix(), message, now.UTC().Format(time.RFC3339Nano), submitted, row["url"], row["revision"])
	}
}
