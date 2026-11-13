import { useTeamIdentity } from "../auth/TeamContext";
import { canPublish } from "../../shared/team";
import { contentTypeLabel } from "../../shared/content-types";
import Select from "../components/Select";
import PostContentsControl from "./PostContentsControl";
import { useState, type ReactNode } from "react";
import PostRecommendations from "./PostRecommendations";
import PostSharingImage from "./PostSharingImage";
import PublishedShare from "./PublishedShare";
import ArticleAuditPanel from "./ArticleAuditPanel";
import AuthorUpdateEditor from "./AuthorUpdateEditor";
import PollAdminPanel from "./PollAdminPanel";
import PostSEOFields from "./PostSEOFields";
import "./post-details.css";
import { Check } from "lucide-react";
import { type Post } from "../../shared/types";
import CoverPicker from "../CoverPicker";
import { slugify } from "../admin/post-utils";
import type { AdminController } from "./useAdminController";
import { visibilityChange } from "../editor/visibility-change";
type Props = {
  published?: boolean;
  startInSEO?: boolean;
  state: Pick<
    AdminController,
    | "post"
    | "setModal"
    | "change"
    | "theme"
    | "save"
    | "busy"
    | "dirty"
    | "setVisibility"
    | "conflicts"
    | "articleAudit"
  >;
};
export default function PostDetails({ state, published, startInSEO }: Props) {
  const { post, setModal, change, theme } = state;
  const { role } = useTeamIdentity();
  const label = contentTypeLabel(post.contentType, theme.publicationType);
  const visibility = detailsVisibility(state, label);
  const [section, setSection] = useState<Section>(
    startInSEO ? "seo" : "details",
  );
  const special = specialSection(section, state);

  async function finish() {
    if (!visibility) setModal(null);
    else if ((await state.save()) && post.status !== "published")
      setModal(null);
  }
  return (
    <>
      <DetailsHeader
        label={label}
        published={published}
        section={section}
        setSection={setSection}
      />
      <div className="dialog-body">
        {special ?? (
          <>
            <label>
              URL slug
              <input
                value={post.slug}
                onChange={(e) => change({ slug: slugify(e.target.value) })}
              />
            </label>
            <label>
              Excerpt
              <textarea
                value={post.excerpt}
                aria-describedby="post-excerpt-help"
                placeholder="A short summary to introduce your post…"
                onChange={(e) => change({ excerpt: e.target.value })}
                rows={3}
              />
              <small id="post-excerpt-help" className="muted">
                A short summary shown on post cards and, depending on your
                design, below the title.
              </small>
            </label>
            <label>
              Tags, separated by commas
              <input
                defaultValue={post.tags.join(", ")}
                onChange={(e) =>
                  change({
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <CoverPicker
              key={post.id}
              content={post.content || ""}
              value={post.cover}
              mode={post.coverMode}
              onModeChange={(coverMode) => change({ coverMode })}
              onChange={(cover) => change({ cover })}
            />
            <PostContentsControl post={post} change={change} />
            <label>
              Visibility
              <Select
                disabled={!canPublish(role) || !!post.baseRevision}
                value={post.status}
                onChange={(e) =>
                  change({ status: e.target.value as Post["status"] })
                }
              >
                <option value="draft">Draft — publication team</option>
                <option value="published">Published — everyone</option>
                <option value="archived">Archived — private</option>
              </Select>
            </label>
            <PublishedVisibility state={state} />
            {visibility && (
              <p className="muted" role="status">
                {visibility.detail}
              </p>
            )}
            <label className="featured-post-control">
              <input
                type="checkbox"
                checked={post.featured ?? false}
                onChange={(event) => change({ featured: event.target.checked })}
              />
              <span>
                Feature on homepage
                <small>
                  Keep this {label.toLowerCase()} above the regular list on
                  every page once published.
                </small>
              </span>
            </label>
          </>
        )}
      </div>
      <footer className="dialog-footer">
        <button
          className="button primary full"
          disabled={state.busy}
          onClick={finish}
        >
          {state.busy ? "Saving…" : (visibility?.action ?? "Done")}
          <Check size={15} />
        </button>
      </footer>
    </>
  );
}

function SEOSection({ state }: Props) {
  const saved = state.conflicts.baseline.current;
  return (
    <>
      {saved?.status === "published" && (
        <PublishedShare key={saved.revision} post={saved} />
      )}
      <PostSharingImage post={state.post} change={state.change} generate={() => state.setModal("sharing-image")} />
      <ArticleAuditPanel post={state.post} audit={state.articleAudit} />
      <PostSEOFields
        post={state.post}
        blogName={state.theme.name}
        change={state.change}
      />
    </>
  );
}
type Section = "details" | "seo" | "recommendations" | "update" | "polls";
function specialSection(section: Section, state: Props["state"]): ReactNode {
  if (section === "seo") return <SEOSection state={state} />;
  if (section === "polls") return <PollAdminPanel post={state.conflicts.baseline.current || state.post} />;
  if (section === "update") return <AuthorUpdateEditor postId={state.post.id} published={state.conflicts.baseline.current?.status === "published"} />;
  if (section === "recommendations") return <PostRecommendations post={state.post} change={state.change} />;
  return null;
}
function DetailsHeader({
  label,
  published,
  section,
  setSection,
}: {
  label: string;
  published?: boolean;
  section: Section;
  setSection: (section: Section) => void;
}) {
  const { role } = useTeamIdentity();
  return (
    <header className="dialog-header">
      <span className="eyebrow">
        {published ? "PUBLISHED" : "YOUR STORY, READY TO SHARE"}
      </span>
      <h2>{label} details</h2>
      <p>
        {published
          ? "Your changes are live."
          : "Shape how your story appears to readers."}
      </p>
      <div
        className="settings-tabs"
        role="group"
        aria-label={`${label} settings`}
      >
        <button
          type="button"
          aria-pressed={section === "details"}
          onClick={() => setSection("details")}
        >
          Details
        </button>
        <button
          type="button"
          aria-pressed={section === "seo"}
          onClick={() => setSection("seo")}
        >
          SEO & sharing
        </button>
        <button
          type="button"
          aria-pressed={section === "recommendations"}
          onClick={() => setSection("recommendations")}
        >
          Related content
        </button>
        {canPublish(role) && <button type="button" aria-pressed={section === "update"} onClick={() => setSection("update")}>Author update</button>}
        {canPublish(role) && <button type="button" aria-pressed={section === "polls"} onClick={() => setSection("polls")}>Polls</button>}
      </div>
    </header>
  );
}

function detailsVisibility(state: Props["state"], label: string) {
  return visibilityChange(
    state.conflicts.baseline.current?.status,
    state.post.status,
    label.toLowerCase(),
  );
}

function PublishedVisibility({ state }: Props) {
 const { role } = useTeamIdentity();
 if (!canPublish(role) || !state.post.baseRevision) return null;
 return <div><p>The published version stays live while this draft is reviewed.</p><button className="button" disabled={state.busy || state.dirty} onClick={() => void state.setVisibility("draft")}>Unpublish article</button> <button className="button" disabled={state.busy || state.dirty} onClick={() => void state.setVisibility("archived")}>Archive article</button>{state.dirty && <p>Save your draft before changing publication visibility.</p>}</div>;
}
