package blog

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"margin/backend/internal/writing"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// @Summary Stream a writing assistant response
// @ID writingAssistantStream
// @Description Streams progress, optional reasoning summaries and visible reply deltas, then the validated writing result. Research and URL reading may provide progress and a final result without token deltas.
// @Tags AI
// @Accept json
// @Produce text/event-stream
// @Security BearerAuth
// @Success 200 {string} string "SSE stream"
// @Failure 400 {object} APIError "Invalid writing request"
// @Failure 401 {object} APIError "Missing or invalid authentication"
// @Router /api/ai/writing/stream [post]
func (a *App) writingAssistantStream(w http.ResponseWriter, r *http.Request) {
	a.limit(r, "ai-writing", 15, 15*time.Minute, true)
	input, err := writing.ParseInput(body(w, r))
	if err != nil {
		fail(400, err.Error())
	}
	id := a.writingRequestKey(r, input)
	payload, contextRow := writingStreamInput(input)
	ctx, cancel := context.WithTimeout(r.Context(), 300*time.Second)
	defer cancel()
	upstream := a.openWritingStream(ctx, payload, id)
	defer upstream.Body.Close()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	defer recoverWritingStream(w)
	a.forwardWritingStream(w, r, upstream.Body, input, contextRow, id)
}

func writingStreamInput(input writing.Input) (Row, Row) {
	instructions, schema := writing.Instructions, writing.Schema()
	if input.ConversationMode {
		instructions, schema = writing.ConversationInstructions, writing.ConversationSchema()
	}
	contextRow := writingInputRow(input)
	prepareWritingFormatting(input, contextRow)
	return Row{"instructions": instructions, "input": contextRow, "schemaName": "writing_plan", "schema": schema}, contextRow
}

func (a *App) openWritingStream(ctx context.Context, payload Row, id string) *http.Response {
	if a.accountToken(ctx) == "" {
		coded(503, "Create a Margin account to use this feature.", "ACCOUNT_REQUIRED")
	}
	base, err := serviceURL()
	if err != nil {
		coded(503, "AI_SERVICE_URL must use HTTPS in production.", "AI_CONFIGURATION")
	}
	address := base.ResolveReference(&url.URL{Path: "/v1/generations/writing/stream"}).String()
	request, err := http.NewRequestWithContext(ctx, "POST", address, strings.NewReader(encode(payload)))
	if err != nil {
		coded(503, "The AI service could not be reached.", "AI_UNAVAILABLE")
	}
	for key, value := range a.serviceHeaders(ctx) {
		request.Header.Set(key, value)
	}
	request.Header.Set("Idempotency-Key", id)
	request.Header.Set("Accept", "text/event-stream")
	client := *a.Client
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return errors.New("redirect refused") }
	upstream, err := client.Do(request)
	if err != nil {
		serviceResult(nil, 0, err)
	}
	if upstream.StatusCode < 200 || upstream.StatusCode >= 300 {
		defer upstream.Body.Close()
		writingStreamUpstreamError(upstream)
	}
	if !strings.HasPrefix(upstream.Header.Get("Content-Type"), "text/event-stream") {
		upstream.Body.Close()
		coded(502, "The AI service returned an unreadable stream.", "AI_INVALID_RESPONSE")
	}
	return upstream
}

func writingStreamUpstreamError(upstream *http.Response) {
	var failure Row
	if json.NewDecoder(io.LimitReader(upstream.Body, 1<<20)).Decode(&failure) != nil {
		coded(503, "The AI service could not complete the request.", "AI_UNAVAILABLE")
	}
	serviceResult(failure, upstream.StatusCode, nil)
}

func recoverWritingStream(w http.ResponseWriter) {
	if recovered := recover(); recovered != nil {
		failure := responseError(recovered)
		writeWritingEvent(w, "error", Row{"error": failure.Message, "code": failure.Code})
	}
}

func (a *App) forwardWritingStream(w http.ResponseWriter, r *http.Request, body io.Reader, input writing.Input, contextRow Row, id string) {
	reader := bufio.NewScanner(io.LimitReader(body, 48_000_001))
	reader.Buffer(make([]byte, 64*1024), 2*1024*1024)
	var frame writingStreamFrame
	for reader.Scan() {
		event, value, ready := frame.readLine(w, reader.Text())
		if !ready {
			continue
		}
		if a.forwardWritingEvent(w, r, input, contextRow, id, event, value) {
			return
		}
	}
	if reader.Err() != nil && !errors.Is(reader.Err(), context.Canceled) {
		coded(503, "The AI service stream was interrupted.", "AI_UNAVAILABLE")
	}
	if r.Context().Err() == nil {
		coded(503, "The AI service stream ended before completion.", "AI_UNAVAILABLE")
	}
}

type writingStreamFrame struct {
	event string
	data  strings.Builder
}

func (frame *writingStreamFrame) readLine(w http.ResponseWriter, line string) (string, Row, bool) {
	if line == "" {
		if frame.event == "" {
			return "", nil, false
		}
		var value Row
		if json.Unmarshal([]byte(frame.data.String()), &value) != nil {
			coded(502, "The AI service returned an unreadable stream.", "AI_INVALID_RESPONSE")
		}
		event := frame.event
		frame.event = ""
		frame.data.Reset()
		return event, value, true
	}
	if strings.HasPrefix(line, "event:") {
		frame.event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
	} else if strings.HasPrefix(line, "data:") {
		if frame.data.Len() > 0 {
			frame.data.WriteByte('\n')
		}
		frame.data.WriteString(strings.TrimSpace(strings.TrimPrefix(line, "data:")))
	} else if strings.HasPrefix(line, ":") {
		fmt.Fprint(w, line+"\n\n")
		http.NewResponseController(w).Flush()
	}
	return "", nil, false
}

func (a *App) forwardWritingEvent(w http.ResponseWriter, r *http.Request, input writing.Input, contextRow Row, id, event string, value Row) bool {
	switch event {
	case "progress", "delta", "thinking":
		return !writeWritingEvent(w, event, value)
	case "complete":
		result := a.writingResult(r.Context(), input, contextRow, id, value)
		writeWritingEvent(w, "complete", result)
		return true
	case "error":
		writeWritingEvent(w, "error", value)
		return true
	}
	return false
}

func writeWritingEvent(w http.ResponseWriter, event string, value Row) bool {
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, encode(value)); err != nil {
		return false
	}
	return http.NewResponseController(w).Flush() == nil
}
