import type {
  AnalyticsMediaRow,
  AnalyticsReport,
} from "../../shared/analytics";
import { AnalyticsDisclosure, AnalyticsPagination } from "./AnalyticsControls";
import { duration, number } from "./AnalyticsDetails";
import AnalyticsMediaReplay from "./AnalyticsMediaReplay";

const providerNames: Record<string, string> = {
  direct: "Direct file",
  youtube: "YouTube",
  vimeo: "Vimeo",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  descript: "Descript",
  riverside: "Riverside",
  veed: "VEED",
  mux: "Mux",
  cloudinary: "Cloudinary",
};

export default function AnalyticsMedia({ data }: { data: AnalyticsReport }) {
  return (
    <AnalyticsDisclosure
      section="media"
      title="Audio & video"
      description="Listening and viewing on your homepage and articles, ranked by visits with playback, then playback time."
    >
      <p className="analytics-inline-note">
        Visits with playback count once per recording per page visit. Playback
        time measures actual listening or viewing; seeking ahead does not count
        as watched. These figures cover playback in Margin, not the host’s
        entire audience.
      </p>
      <div className="analytics-table-wrap analytics-media-table-wrap">
        <table className="analytics-media-summary-table">
          <colgroup>
            <col className="analytics-media-recording" />
            <col span={5} />
            <col className="analytics-media-coverage" />
          </colgroup>
          <thead>
            <tr>
              <th>Recording / page</th>
              <th>Player visits</th>
              <th>Playback visits</th>
              <th>Playback time</th>
              <th>Avg. played</th>
              <th>Completed</th>
              <th>Measurement</th>
            </tr>
          </thead>
          <tbody>
            {data.media.map((item) => (
              <MediaRow key={`${item.post_id}:${item.media_id}`} item={item} />
            ))}
            {!data.media.length && (
              <tr>
                <td colSpan={7}>
                  Audio and video activity will appear after readers visit a
                  homepage hero or a published article containing media.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="analytics-inline-note">
        A dash means playback data is unavailable. Some hosts do not expose
        player events, and blocked or unloaded players cannot be measured.
        Collections show playback visits and playback time, but have no
        whole-collection progress or completion measurement. Average played
        counts unique portions among visits that started playback; completed
        means at least 90% played and the end reached. Your signed-in visits and
        visitors’ privacy opt-outs are excluded.
      </p>
      <AnalyticsPagination section="media" />
    </AnalyticsDisclosure>
  );
}

function MediaRow({ item }: { item: AnalyticsMediaRow }) {
  const measured = item.measurable_views > 0;
  const timeline = hasTimeline(item);
  return (
    <>
      <tr>
        <td>
          <strong>
            {item.media_title ||
              `${item.media_type === "audio" ? "Audio" : "Video"} recording`}
          </strong>
          <small className="analytics-subtitle">
            {item.title} · {providerNames[item.provider] || item.provider}
          </small>
        </td>
        <td>{number(item.views)}</td>
        <td>{measured ? number(item.starts) : "—"}</td>
        <td>{measured ? duration(item.played_ms) : "—"}</td>
        <td>
          {timeline && item.starts ? `${Math.round(item.progress)}%` : "—"}
        </td>
        <td>{timeline ? number(item.completed) : "—"}</td>
        <td>
          {measured
            ? `${number(item.measurable_views)} of ${number(item.views)} visits`
            : "Unavailable"}
        </td>
      </tr>
      <tr className="analytics-replay-row">
        <td colSpan={7}>
          <AnalyticsMediaReplay item={item} />
        </td>
      </tr>
    </>
  );
}

function hasTimeline(item: AnalyticsMediaRow) {
  return item.measurable_views > 0 && item.timeline_available === 1;
}
