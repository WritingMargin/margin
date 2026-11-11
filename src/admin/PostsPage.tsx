import SearchHighlight from "../SearchHighlight";
import { ArrowLeft, ArrowRight, FileText, Trash2 } from "lucide-react";
import { date, draft } from "../admin/post-utils";
import { api, json } from "../api";
import Empty from "../components/Empty";
import ReadPostLink from "./ReadPostLink";
import NewContentMenu from "./NewContentMenu";
import { contentTypeLabel } from "../../shared/content-types";
import { listPendingDrafts } from "../../shared/local-drafts";
import { sitePath } from "../base-path";
import type { AdminController } from "./useAdminController";
import PostsPagination, { PostsPageSize } from "./PostsPagination";
import { usePostsPagination } from "./usePostsPagination";
type Props = {
  state: Pick<
    AdminController,
    | "refreshPosts"
    | "postsVersion"
    | "post"
    | "setPost"
    | "setDirty"
    | "query"
    | "setView"
    | "editor"
    | "notify"
    | "load"
    | "theme"
    | "newPost"
    | "save"
    | "words"
    | "search"
    | "dirty"
  >;
};
export default function PostsPage({ state }: Props) {
  const {
    refreshPosts,
    postsVersion,
    post,
    setPost,
    setDirty,
    query,
    setView,
    notify,
    load,
    newPost,
    search,
    dirty,
  } = state;
  const pagination = usePostsPagination(query, postsVersion);
  const searchState = pagination;
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORDS, IN ONE PLACE</span>
          <h1>
            {query ? "Search results" : "All content"}
            <span className="heading-count">{pagination.total}</span>
          </h1>
          <p>A collection of things worth putting into words.</p>
        </div>
        <NewContentMenu onCreate={newPost} publicationType={state.theme.publicationType} />
      </div>
      {search.canResume && (
        <div className="search-return">
          <button className="button" onClick={search.close}>
            <ArrowLeft size={15} /> Back to editing
          </button>
          <span>
            <strong>{post.title || "Untitled"}</strong>
            {dirty ? " · Unsaved edits kept" : " · Ready to continue"}
          </span>
        </div>
      )}
      <PendingDraftList onOpen={load} />
      {searchState.loading && <p role="status">Loading posts…</p>}
      {searchState.error && <div className="error-box" role="alert">{searchState.error} <button className="button" onClick={searchState.retry}>Try again</button></div>}
      <PostsPageSize state={pagination} query={query} onSearch={search.filter} />
      <div className="post-table">
        <div className="table-head">
          <span>CONTENT</span>
          <span>STATUS</span>
          <span>LAST EDITED</span>
          <span />
        </div>
        {pagination.visible.map((p) => (
          <div className="table-row" key={p.id}>
            <button className="table-title" onClick={() => load(p)}>
              <FileText size={18} />
              <span>
                <strong><SearchHighlight text={p.title} matches={p.searchMatches} /></strong>
                <small>{contentTypeLabel(p.contentType, state.theme.publicationType)} · /<SearchHighlight text={p.slug} matches={p.searchMatches} /></small>
                {p.searchSnippet && <small className="post-search-snippet"><SearchHighlight text={p.searchSnippet} matches={p.searchMatches} /></small>}
              </span>
            </button>
            <span className="status-pill">
              <i
                className={
                  p.status === "published" ? "published-dot" : "draft-dot"
                }
              />
              {p.status}
            </span>
            <span className="muted">{date(p.updatedAt)}</span>
            <div className="post-row-actions">
            <ReadPostLink post={p} />
            <button
              className="icon-button"
              title="Delete post"
              onClick={async () => {
                if (!confirm(`Delete “${p.title}”?`)) return;
                try {
                  await api(
                    `/posts/${p.id}`,
                    json("DELETE", { revision: p.revision }),
                  );
                  refreshPosts();
                  if (post.id === p.id) {
                    setPost(draft());
                    setDirty(false);
                  }
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <Trash2 size={15} />
            </button>
            </div>
          </div>
        ))}
        {isSearchEmpty(query, searchState) && (
          <p className="search-empty">
            No posts match “{query}”. Try another search or clear it.
          </p>
        )}
        {isLibraryEmpty(query, pagination) && (
          <Empty
            icon={<FileText />}
            title="Every blog starts with a thought."
            text="Start with an idea. Save a draft and make it your own."
            action={
              <button className="button" onClick={() => setView("editor")}>
                Open your first draft
                <ArrowRight size={15} />
              </button>
            }
          />
        )}
      </div>
      <PostsPagination state={pagination} />
    </section>
  );
}

function PendingDraftList({ onOpen }: { onOpen: (post: import("../../shared/types").Post) => void }) {
  let drafts: ReturnType<typeof listPendingDrafts> = [];
  try { drafts = listPendingDrafts(localStorage, sitePath("/admin")); }
  catch { /* Browser storage may be disabled. */ }
  if (!drafts.length) return null;
  return <section className="notice" aria-label="Drafts saved on this device">
    <strong>Saved on this device</strong>
    <p>Open a local draft to continue editing. Private drafts sync when connected; published and archived posts need a manual save.</p>
    {drafts.map(saved => <button className="button" key={`${saved.post.id}:${saved.post.contentType || "article"}`} onClick={() => onOpen(saved.post)}>
      Continue {saved.post.title || "Untitled"}
    </button>)}
  </section>;
}

function isSearchEmpty(query: string, state: ReturnType<typeof usePostsPagination>) {
  return !!query.trim() && !state.loading && !state.error && !state.total;
}

function isLibraryEmpty(query: string, state: ReturnType<typeof usePostsPagination>) {
  return !query && !state.loading && !state.error && !state.total;
}
