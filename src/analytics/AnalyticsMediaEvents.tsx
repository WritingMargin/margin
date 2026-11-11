import type {
  AnalyticsMediaEvent,
  AnalyticsReport,
} from "../../shared/analytics";
import { AnalyticsDisclosure, AnalyticsPagination } from "./AnalyticsControls";
import { mediaPosition, playbackDuration } from "./media-format";

const actions: Record<AnalyticsMediaEvent["kind"], string> = {
  play: "Played",
  pause: "Paused",
  resume: "Resumed",
  seek: "Seeked",
  ended: "Reached end",
  exit: "Left page",
};
const timestamp = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export default function AnalyticsMediaEvents({
  data,
}: {
  data: AnalyticsReport;
}) {
  return (
    <AnalyticsDisclosure
      section="mediaEvents"
      title="Player activity"
      description="Actions inside players on Margin, newest first. Times are UTC."
    >
      <div className="analytics-table-wrap">
        <table className="analytics-media-events-table">
          <colgroup>
            <col className="analytics-event-time" />
            <col className="analytics-event-action" />
            <col className="analytics-event-recording" />
            <col className="analytics-event-position" />
            <col className="analytics-event-duration" />
          </colgroup>
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>Action</th>
              <th>Recording / page</th>
              <th>Position</th>
              <th>Played before stop</th>
            </tr>
          </thead>
          <tbody>
            {data.mediaEvents.map((event) => (
              <tr key={event.id}>
                <td>
                  <time dateTime={event.occurred_at}>
                    {timestamp.format(new Date(event.occurred_at))}
                  </time>
                </td>
                <td>{actions[event.kind]}</td>
                <td>
                  <strong>{event.media_title}</strong>
                  <small className="analytics-subtitle">
                    {event.title} · {event.provider}
                  </small>
                </td>
                <td>{mediaPosition(event.position_ms)}</td>
                <td>
                  {["pause", "ended", "exit"].includes(event.kind) &&
                  event.played_ms != null
                    ? playbackDuration(event.played_ms)
                    : "—"}
                </td>
              </tr>
            ))}
            {!data.mediaEvents.length && (
              <tr>
                <td colSpan={5}>
                  Player actions will appear when readers use a supported player
                  in the homepage hero or a published article.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="analytics-inline-note">
        Player actions include play, pause, resume, seek, and reaching the end.
        Played before stop measures actual listening or viewing since the last
        play or resume, excluding buffering, pauses, and skipped time. A dash
        means this duration was not measured or does not apply to the action.
        Left page records leaving during playback; delivery is best effort.
        Hiding a tab alone does not end a playback session. Buffering is not a
        pause. Seeking shows the destination position. Available actions vary by
        provider; players without callbacks cannot supply this history. Earlier
        activity is not reconstructed from totals.
      </p>
      <AnalyticsPagination section="mediaEvents" />
    </AnalyticsDisclosure>
  );
}
