package blog

import (
	"context"
	"database/sql"
	"net/http"
	"net/url"
	"strconv"
)

func (a *App) readerAlertsHTML(w http.ResponseWriter, r *http.Request) {
	theme := a.publicTheme(r)
	page := publicPage{Theme: theme, Title: "Reader alerts — " + theme.str("name"), Action: "alerts", Status: 200, Robots: "noindex, nofollow"}
	page.Data = publicJSON(Row{"theme": theme, "readerAlerts": true})
	w.Header().Set("Cache-Control", "no-store")
	a.renderPublic(w, r, page)
}

func (a *App) insertReaderAlertTx(ctx context.Context, tx *sql.Tx, readerID, kind, postID, targetID, eventKey, message string) {
	id := uuid()
	row := a.queryPostTransaction(ctx, tx, `INSERT INTO reader_alerts(id,reader_id,event_key,kind,post_id,target_id,body)
		VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_key) DO NOTHING RETURNING id`, id, readerID, eventKey, kind, postID, targetID, message)
	if row != nil {
		a.queueReaderAlertTx(ctx, tx, readerID, id)
	}
}

func (a *App) insertReaderAlert(ctx context.Context, readerID, kind, postID, targetID, eventKey, message string) {
	tx, err := a.DB.SQL.BeginTx(ctx, nil)
	must(err)
	defer tx.Rollback()
	a.insertReaderAlertTx(ctx, tx, readerID, kind, postID, targetID, eventKey, message)
	must(tx.Commit())
}

func (a *App) queueReaderAlertTx(ctx context.Context, tx *sql.Tx, readerID, alertID string) {
	row := a.queryPostTransaction(ctx, tx, `SELECT u.email FROM reader_alert_settings s JOIN comment_readers u ON u.id=s.reader_id
		WHERE s.reader_id=$1 AND s.email_enabled=TRUE`, readerID)
	if row != nil {
		a.execInteraction(ctx, tx, "INSERT INTO reader_alert_deliveries(alert_id,reader_id,email) VALUES($1,$2,$3)", alertID, readerID, row["email"])
	}
}

func (a *App) readerAlerts(w http.ResponseWriter, r *http.Request) {
	reader := a.requireCommentReader(r)
	offset := 0
	if raw := r.URL.Query().Get("offset"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 0 {
			fail(400, "Invalid alert offset.")
		}
		offset = value
	}
	rows := a.DB.Must(r.Context(), `SELECT a.*,p.slug,p.status AS post_status FROM reader_alerts a
		LEFT JOIN posts p ON p.id=a.post_id WHERE a.reader_id=$1
		AND NOT EXISTS (SELECT 1 FROM public_notes n WHERE n.comment_id=a.target_id)
		ORDER BY a.created_at DESC,a.id DESC LIMIT 21 OFFSET $2`, reader["id"], offset)
	hasMore := len(rows) > 20
	if hasMore {
		rows = rows[:20]
	}
	alerts := make([]Row, 0, len(rows))
	for _, row := range rows {
		path := ""
		if row.str("post_status") == "published" {
			path = "/post/" + url.PathEscape(row.str("slug"))
			if row.str("kind") == "section_updated" {
				path += "#contribution-" + url.PathEscape(row.str("target_id"))
			} else {
				path += "?thread=" + url.QueryEscape(row.str("target_id"))
			}
		}
		alerts = append(alerts, Row{"id": row["id"], "kind": row["kind"], "text": row["body"],
			"url": path, "read": row["read_at"] != nil, "createdAt": row["created_at"]})
	}
	unread := first(a.DB.Must(r.Context(), "SELECT COUNT(*) AS count FROM reader_alerts a WHERE reader_id=$1 AND read_at IS NULL AND NOT EXISTS (SELECT 1 FROM public_notes n WHERE n.comment_id=a.target_id)", reader["id"]))
	send(w, 200, Row{"alerts": alerts, "hasMore": hasMore, "unreadCount": unread["count"]})
}

func (a *App) markReaderAlert(w http.ResponseWriter, r *http.Request) {
	reader := a.requireCommentReader(r)
	input := body(w, r)
	strict(input, "read")
	if !booleanField(input, "read") {
		fail(400, "Only marking an alert as read is supported.")
	}
	row := first(a.DB.Must(r.Context(), "UPDATE reader_alerts SET read_at=NOW() WHERE id=$1 AND reader_id=$2 RETURNING id", r.PathValue("id"), reader["id"]))
	if row == nil {
		fail(404, "Alert not found.")
	}
	send(w, 200, Row{"ok": true})
}

func (a *App) readerAlertSettings(w http.ResponseWriter, r *http.Request) {
	reader := a.requireCommentReader(r)
	row := first(a.DB.Must(r.Context(), "SELECT email_enabled FROM reader_alert_settings WHERE reader_id=$1", reader["id"]))
	send(w, 200, Row{"emailEnabled": row != nil && row.yes("email_enabled")})
}

func (a *App) saveReaderAlertSettings(w http.ResponseWriter, r *http.Request) {
	reader := a.requireCommentReader(r)
	input := body(w, r)
	strict(input, "emailEnabled")
	enabled := booleanField(input, "emailEnabled")
	if enabled {
		a.ownerEmailDelivery(r.Context())
	}
	a.DB.Must(r.Context(), `INSERT INTO reader_alert_settings(reader_id,email_enabled) VALUES($1,$2)
		ON CONFLICT(reader_id) DO UPDATE SET email_enabled=EXCLUDED.email_enabled`, reader["id"], enabled)
	send(w, 200, Row{"emailEnabled": enabled})
}
