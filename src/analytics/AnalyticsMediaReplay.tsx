import type { AnalyticsMediaRow } from "../../shared/analytics";
import { mediaPosition, playbackDuration } from "./media-format";

export default function AnalyticsMediaReplay({
  item,
}: {
  item: AnalyticsMediaRow;
}) {
  const bins = item.replay_ms;
  if (!item.timeline_available)
    return (
      <p className="analytics-replay-unavailable">
        Replay timeline unavailable for this player or collection.
      </p>
    );
  if (!item.replay_measured_views || !bins || bins.length !== 20)
    return (
      <p className="analytics-replay-unavailable">
        Replay measurement unavailable for these visits.
      </p>
    );
  const peak = Math.max(...bins);
  const best = bins.indexOf(peak);
  const tied = bins.filter((value) => value === peak).length > 1;
  const range = (index: number) => `${index * 5}–${(index + 1) * 5}%`;
  const clock = (index: number) =>
    item.duration_ms
      ? `${mediaPosition((item.duration_ms * index) / 20)}–${mediaPosition((item.duration_ms * (index + 1)) / 20)}`
      : "";
  const summary =
    peak > 0
      ? `Most replayed: ${range(best)}${clock(best) ? ` (${clock(best)})` : ""} · ${playbackDuration(peak)}${tied ? " (joint highest)" : ""}`
      : "No replays recorded";
  return (
    <details className="analytics-replay">
      <summary>{summary}</summary>
      <p>
        Replay time measures portions played again within the same page visit,
        summed across {item.replay_measured_views.toLocaleString()} measured{" "}
        {item.replay_measured_views === 1 ? "visit" : "visits"}. Each segment covers 5% of the recording.
      </p>
      <div
        className="analytics-replay-heatmap"
        role="img"
        aria-label={`Replay timeline. ${summary}. Segment values are listed below.`}
      >
        {bins.map((value, index) => (
          <span
            key={index}
            title={`${range(index)}${clock(index) ? ` (${clock(index)})` : ""}: ${playbackDuration(value)} replayed`}
            style={{
              backgroundColor: `rgba(65, 101, 48, ${value > 0 ? 0.2 + (0.8 * value) / peak : 0.06})`,
            }}
          />
        ))}
      </div>
      <div className="analytics-replay-axis" aria-hidden="true">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      <p>
        Darker segments have more replay time. Seeking and buffering do not add
        replay time. Earlier visits without replay measurement are excluded.
      </p>
      <details className="analytics-replay-values">
        <summary>View all segment values</summary>
        <table>
          <caption>Replay time by recording segment</caption>
          <thead>
            <tr>
              <th scope="col">Segment</th>
              <th scope="col">Position</th>
              <th scope="col">Replay time</th>
            </tr>
          </thead>
          <tbody>
            {bins.map((value, index) => (
              <tr key={index}>
                <th scope="row">{range(index)}</th>
                <td>{clock(index) || "—"}</td>
                <td>{playbackDuration(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </details>
  );
}
