import Select from "../components/Select";
import { useRecommendationPosts } from "./useRecommendationPosts";
import PostPageNavigation from "./PostPageNavigation";
import BillingLink from "../auth/BillingLink";
import { api } from "../api";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Post, RecommendationSettings } from "../../shared/types";

type RecommendationConfig = {
  available: boolean;
  connected: boolean;
  cost?: number;
};

type Props = {
  post: Post;
  change: (value: Partial<Post>) => void;
};

export default function PostRecommendations({ post, change }: Props) {
  const [config, setConfig] = useState<RecommendationConfig | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<RecommendationConfig>("/recommendations")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  const [query, setQuery] = useState("");
  const settings = post.recommendations!;
  const { feed, visible, selected, empty } = useRecommendationPosts(post, query);
  const update = (value: RecommendationSettings) =>
    change({ recommendations: value });
  const remove = (id: string) =>
    update({
      ...settings,
      postIds: settings.postIds.filter((value) => value !== id),
    });
  return (
    <div className="recommendation-settings">
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <p className="muted">
        Give readers somewhere to go next. Related stories appear at the end of
        this article.
      </p>
      <label>
        Recommended stories
        <Select
          value={settings.mode}
          onChange={(event) =>
            update({
              mode: event.target.value as RecommendationSettings["mode"],
              postIds: [],
            })
          }
        >
          <option value="automatic">Latest posts</option>
          <option value="smart" disabled={!config?.available}>
            Find related posts with AI
          </option>
          <option value="manual">Choose my own posts</option>
        </Select>
      </label>
      {config && !config.available && (
        <p className="small-text">
          AI recommendations need an active Margin plan and availability.{" "}
          <BillingLink />
        </p>
      )}
      {settings.mode !== "manual" ? (
        <p className="small-text">
          {settings.mode === "smart"
            ? recommendationHelp(config)
            : "Shows your two latest published posts. No AI or account is needed."}
        </p>
      ) : (
        <>
          <p className="small-text">
            Choose up to two published posts. Leave both empty to hide related
            stories.
          </p>
          <div className="recommendation-selection">
            {settings.postIds.map((id, index) => (
              <div key={id}>
                <span>
                  {index + 1}.{" "}
                  {selected.find((item) => item.id === id)?.title ||
                    "Unavailable post"}
                </span>
                <button
                  type="button"
                  aria-label={`Remove recommendation ${index + 1}`}
                  onClick={() => remove(id)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <label>
            Find a story
            <input
              type="search"
              placeholder="Search titles, tags or content…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="recommendation-options">
            {visible.map((item) => (
              <RecommendationOption
                key={item.id}
                item={item}
                settings={settings}
                update={update}
              />
            ))}
          </div>
          <PostPageNavigation feed={feed} label="Related posts pagination" />
          {empty && (
            <p className="small-text">
              No published stories match. Publish another post to recommend it
              here.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function RecommendationOption({
  item,
  settings,
  update,
}: {
  item: Post;
  settings: RecommendationSettings;
  update: (value: RecommendationSettings) => void;
}) {
  const selected = settings.postIds.includes(item.id);
  return (
    <label className="recommendation-option">
      <input
        type="checkbox"
        checked={selected}
        disabled={!selected && settings.postIds.length === 2}
        onChange={() =>
          update({
            ...settings,
            postIds: selected
              ? settings.postIds.filter((id) => id !== item.id)
              : [...settings.postIds, item.id],
          })
        }
      />
      <span>
        <strong>{item.title}</strong>
        <small>{item.excerpt}</small>
      </span>
    </label>
  );
}

function recommendationHelp(config: RecommendationConfig | null) {
  if (!config) return "Checking AI recommendations…";
  return `Margin selects up to two related posts when you publish or save a published article. The first 6,000 characters of your article and published post metadata are sent for AI ranking. ${config.cost ?? "—"} credits per selection.`;
}
