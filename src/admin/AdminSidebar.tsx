import ProfileAvatar from "../profile/ProfileAvatar";
import { useAuthorProfile } from "../profile/AuthorProfileContext";
import type { PostPageController } from "./usePostPage";
import { useRef } from "react";
import { useOverlayFocus } from "../useOverlayFocus";
import { sitePath } from "../base-path";
import BrandMark from "../BrandMark";
import {
  PanelLeftClose,
  CreditCard,
  FileText,
  LogOut,
  Search,
  Settings,
  X,
} from "lucide-react";
import NewContentMenu from "./NewContentMenu";
import { contentTypeLabel } from "../../shared/content-types";
import type { AdminController } from "./useAdminController";
type Props = {
  state: Pick<
    AdminController,
    | "navigationSidebar"
    | "logout"
    | "view"
    | "posts"
    | "postFeed"
    | "post"
    | "dirty"
    | "query"
    | "setQuery"
    | "search"
    | "setView"
    | "setMobile"
    | "editor"
    | "notify"
    | "load"
    | "theme"
    | "newPost"
    | "nav"
  >;
};
export default function AdminSidebar({ state }: Props) {
  const {
    navigationSidebar,
    logout,
    view,
    posts,
    postFeed,
    post,
    dirty,
    query,
    setQuery,
    search,
    setView,
    setMobile,
    notify,
    load,
    newPost,
    nav,
  } = state;
  const panel = useRef<HTMLElement>(null);
  useOverlayFocus(
    panel,
    navigationSidebar.narrow && navigationSidebar.open,
    () => {
      if (query) search.close();
      navigationSidebar.close();
    },
  );
  return (
    <aside
      ref={panel}
      id="workspace-navigation"
      className="sidebar"
      hidden={!navigationSidebar.open}
      aria-label="Main navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape") navigationSidebar.close();
      }}
    >
      <div className="sidebar-content">
        <div className="sidebar-heading">
          <a href={sitePath("/admin")} className="brand">
            <BrandMark />
            margin
            <span className="brand-period">®</span>
          </a>
          <button
            className="sidebar-close"
            title="Close navigation"
            aria-label="Close navigation"
            onClick={navigationSidebar.close}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <NewContentMenu onCreate={newPost} publicationType={state.theme.publicationType} sidebar />
        <div className="search-box">
          <Search size={15} />
          <input
            ref={navigationSidebar.searchRef}
            aria-label="Search content"
            placeholder="Find content…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                search.close();
              }
            }}
          />
          {query ? (
            <button aria-label="Clear search" onClick={search.close}>
              <X size={14} />
            </button>
          ) : (
            <kbd>⌘ K</kbd>
          )}
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id || (view === "comments" && n.id === "readers") || (view === "editor" && n.id === "posts") ? "active" : ""}`}
              onClick={() => {
                setView(n.id);
                setMobile(false);
              }}
            >
              <n.icon size={17} />
              {n.label}
              {n.id === "posts" && (
                <span className="nav-count">{postFeed.total}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label posts-label">
          RECENT CONTENT
        </div>
        <div
          className="sidebar-posts"
          role="region"
          aria-label="Your content"
          tabIndex={0}
        >
          {posts.length ? (
            posts.map((p) => (
              <button
                key={p.id}
                className={`post-link ${post.id === p.id && view === "editor" ? "selected" : ""}`}
                onClick={() => load(p)}
              >
                <FileText size={14} />
                <span>{p.title}<small> · {contentTypeLabel(p.contentType, state.theme.publicationType)}</small></span>
                <i
                  className={
                    p.status === "published" ? "published-dot" : "draft-dot"
                  }
                />
              </button>
            ))
          ) : postFeed.loading || postFeed.error ? null : (
            <button
              className="post-link selected"
              onClick={() => setView("editor")}
            >
              <FileText size={14} />
              <span>{post.title}</span>
              <i className="draft-dot" />
            </button>
          )}
        </div>
        <SidebarPostStatus feed={postFeed} />
      </div>
      <div className="sidebar-bottom">
        <button
          className={`nav-item ${view === "pricing" ? "active" : ""}`}
          onClick={() => {
            setView("pricing");
            setMobile(false);
          }}
        >
          <CreditCard size={16} />
          Plans & credits
        </button>
        <button
          className={`nav-item ${view === "settings" ? "active" : ""}`}
          onClick={() => setView("settings")}
        >
          <Settings size={16} />
          Settings & integrations
        </button>
        <div className="profile">
          <SidebarProfileIdentity active={view === "profile"} onOpen={() => {
            setView("profile");
            setMobile(false);
          }} />
          <button
            className="profile-signout"
            title="Sign out"
            onClick={() => {
              if (
                dirty &&
                !confirm(
                  "Sign out? Your local draft will stay on this browser.",
                )
              )
                return;
              void logout().catch((e) => notify(e.message));
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarPostStatus({ feed }: { feed: PostPageController }) {
  if (feed.loading) return <p className="small-text" role="status">Loading recent posts…</p>;
  if (feed.error) return <p className="small-text" role="alert">{feed.error} <button className="button" onClick={feed.retry}>Try again</button></p>;
  return null;
}

function SidebarProfileIdentity({ active, onOpen }: { active: boolean; onOpen: () => void }) {
  const profile = useAuthorProfile()?.profile;
  const ownerName = profile?.name.trim() || "Blog Owner";
  return (
    <button
      className="profile-identity"
      aria-label={`Open profile for ${ownerName}`}
      aria-current={active ? "page" : undefined}
      title="Open profile"
      onClick={onOpen}
    >
      <ProfileAvatar profile={profile} />
      <span className="profile-copy">
        <strong>{ownerName}</strong>
        <small>Personal workspace</small>
      </span>
    </button>
  );
}
