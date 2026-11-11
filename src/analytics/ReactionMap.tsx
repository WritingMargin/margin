import { useEffect, useState } from "react";
import type { AnalyticsReport } from "../../shared/analytics";
import { api } from "../api";
import Select from "../components/Select";

type Segment = {
  start: number;
  end: number;
  text: string;
  highlights: number;
  questions: number;
  votes: number;
  reactions: number;
  scroll: number;
  score: number;
};
type MapData = {
  postId: string;
  title: string;
  revision: string;
  views: number;
  segments: Segment[];
};

export default function ReactionMap({
  data,
  page,
  range,
  version,
}: {
  data: AnalyticsReport;
  page: string;
  range: { from: string; to: string };
  version: number;
}) {
  const [chosen, setChosen] = useState("");
  const postId = page && page !== "home" ? page : chosen;
  const { map, loading, error } = useReactionMap(postId, range, version);
  return (
    <section className="analytics-reaction-map" aria-label="Article reaction map">
      <div className="analytics-reaction-map-heading">
        <div>
          <h2>Article reaction map</h2>
          <p>Reader activity over the article text. Deeper colour means more activity in that passage.</p>
        </div>
        {!page || page === "home" ? (
          <label>
            Article
            <Select value={chosen} onChange={(event) => setChosen(event.target.value)}>
              <option value="">Choose an article</option>
              {data.pageOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.title}</option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>
      {loading && <p role="status">Loading reaction map…</p>}
      {error && <p role="alert">{error}</p>}
      {map && !error && <ReactionMapContent map={map} />}
      {!postId && <p className="analytics-no-data">Choose an article to see its reaction map.</p>}
    </section>
  );
}

function useReactionMap(postId: string, range: { from: string; to: string }, version: number) {
  const [map, setMap] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!postId) {
      setMap(null);
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({ postId, from: range.from, to: range.to });
    setLoading(true);
    setError("");
    api<MapData>(`/analytics/reaction-map?${query}`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setMap(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError((cause as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [postId, range.from, range.to, version]);
  return { map, loading, error };
}

function ReactionMapContent({ map }: { map: MapData }) {
  const maxScore = Math.max(1, ...map.segments.map((segment) => segment.score));
  return (
    <>
          <p className="analytics-inline-note">
            {map.title} · {map.views.toLocaleString()} measured visits · current revision {map.revision.slice(0, 8)}
          </p>
          <div className="analytics-reaction-key" aria-label="Reaction map legend">
            <span>Quiet</span><span>Active</span>
          </div>
          <div className="analytics-reaction-text" aria-label="Article text with reaction heat overlay">
            {map.segments.map((segment) => (
              <span
                key={segment.start}
                title={`${segment.highlights} highlights, ${segment.questions} questions, ${segment.votes} votes, ${segment.reactions} emoji reactions, ${segment.scroll} readers reached this part`}
                style={{ backgroundColor: `rgba(185, 79, 47, ${0.05 + 0.55 * segment.score / maxScore})` }}
              >
                {segment.text}
              </span>
            ))}
          </div>
          <p className="analytics-inline-note">
            Heat combines highlights, approved passage questions, votes, emoji reactions, and how far readers scrolled. Hover a passage for counts.
          </p>
    </>
  );
}
