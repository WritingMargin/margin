import type { ContentType } from "../shared/content-types";
import { resolveContentType } from "../shared/content-types";
import { sitePath, unmountPath } from "./base-path";
import { useEffect, useRef, useState } from "react";

export type AdminView =
  | "editor"
  | "posts"
  | "connections"
  | "reviews"
  | "designer"
  | "media"
  | "comments"
  | "readers"
  | "analytics"
  | "profile"
  | "settings"
  | "pricing"
  | "not-found";
export type DesignSection = "homepage" | ContentType | "comments" | "footer";
export type EditorMode = "split" | "write" | "preview";
export type MediaTab = "uploads" | "link" | "library" | "defaults";
export type SettingsTab = "general" | "seo" | "pwa" | "integrations" | "team";
export type ReadersTab =
  "conversations" | "flags" | "guides" | "subscribers" | "campaigns" | "settings";
export interface AdminRoute {
  view: AdminView;
  postId?: string;
  contentType?: ContentType;
  section?: DesignSection;
  mode?: EditorMode;
  filter?: "pending" | "all";
  mediaTab?: MediaTab;
  settingsTab?: SettingsTab;
  seoProvider?: "google";
  readersTab?: ReadersTab;
}

const entryRoutes: Record<string, (query: URLSearchParams) => AdminRoute> = {
  "/admin": () => ({ view: "posts" }),
  "/admin/posts": () => ({ view: "posts" }),
  "/admin/connections": () => ({ view: "connections" }),
  "/admin/reviews": () => ({ view: "reviews" }),
  "/admin/analytics": () => ({ view: "analytics" }),
  "/admin/profile": () => ({ view: "profile" }),
  "/admin/pricing": () => ({ view: "pricing" }),
  "/admin/readers": (query) => ({
    view: "readers",
    readersTab: readersTab(query.get("tab")),
    filter: query.get("filter") === "all" ? "all" : "pending",
  }),
  "/admin/settings": (query) => ({
    view: "settings",
    ...(query.get("tab") === "seo" && query.get("provider") === "google" ? {seoProvider: "google" as const} : {}),
    settingsTab:
      query.get("tab") === "team" ? "team" : query.get("tab") === "seo"
        ? "seo"
        : query.get("tab") === "integrations"
          ? "integrations"
          : query.get("tab") === "pwa"
            ? "pwa"
            : "general",
  }),
  "/admin/media": (query) => ({
    view: "media",
    mediaTab: mediaTab(query.get("tab")),
  }),
  "/admin/comments": (query) => ({
    view: "comments",
    filter: query.get("filter") === "all" ? "all" : "pending",
  }),
};
function readersTab(value: string | null): ReadersTab {
  return value === "flags" || value === "guides" || value === "subscribers" ||
    value === "settings" ||
    value === "campaigns"
    ? value
    : "conversations";
}
function mediaTab(value: string | null): MediaTab {
  return value === "link" || value === "library" || value === "defaults"
    ? value
    : "uploads";
}
function editorRoute(id: string, query: URLSearchParams): AdminRoute {
  return {
    view: "editor",
    postId: id === "new" ? "" : id,
    ...(id === "new" && query.get("type") === "guide"
      ? { contentType: resolveContentType(query.get("type")) }
      : {}),
    mode:
      query.get("mode") === "write"
        ? "write"
        : query.get("mode") === "preview"
          ? "preview"
          : "split",
  };
}
export function parseAdminRoute(pathname: string, search = ""): AdminRoute {
  const path = unmountPath(pathname).replace(/\/+$/, "");
  const query = new URLSearchParams(search);
  const entry = entryRoutes[path];
  if (entry) return entry(query);
  const designer = path.match(
    /^\/admin\/designer\/(homepage|article|guide|comments|footer)$/,
  );
  if (designer)
    return {
      view: "designer",
      section: designer[1] as DesignSection,
    };
  const editor = path.match(/^\/admin\/posts\/([a-zA-Z0-9_-]+)$/);
  if (editor) return editorRoute(editor[1], query);
  return { view: "not-found" };
}
const routeUrls: Partial<Record<AdminView, (route: AdminRoute) => string>> = {
  readers: (route) => {
    const query = new URLSearchParams();
    if (route.readersTab && route.readersTab !== "conversations")
      query.set("tab", route.readersTab);
    if (route.filter === "all") query.set("filter", "all");
    return `/admin/readers${query.size ? `?${query}` : ""}`;
  },
  settings: (route) => {
    const query = new URLSearchParams();
    if (route.settingsTab && route.settingsTab !== "general") query.set("tab", route.settingsTab);
    if (route.settingsTab === "seo" && route.seoProvider) query.set("provider", route.seoProvider);
    return `/admin/settings${query.size ? `?${query}` : ""}`;
  },
  editor: (route) => {
    const query = new URLSearchParams();
    if (!route.postId && route.contentType && route.contentType !== "article")
      query.set("type", route.contentType);
    if (route.mode && route.mode !== "split") query.set("mode", route.mode);
    return `/admin/posts/${encodeURIComponent(route.postId || "new")}${query.size ? `?${query}` : ""}`;
  },
  designer: (route) => `/admin/designer/${route.section || "homepage"}`,
  comments: (route) =>
    `/admin/comments${route.filter === "all" ? "?filter=all" : ""}`,
  media: (route) =>
    `/admin/media${route.mediaTab && route.mediaTab !== "uploads" ? `?tab=${route.mediaTab}` : ""}`,
};
export function adminUrl(route: AdminRoute): string {
  return sitePath(routeUrls[route.view]?.(route) ?? `/admin/${route.view}`);
}

export function adminEntryDestination(search: string): string {
  const fallback = sitePath("/admin");
  const next = new URLSearchParams(search).get("next");
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\"))
    return fallback;
  const target = new URL(next, "https://margin.invalid");
  if (target.origin !== "https://margin.invalid" || target.hash) return fallback;
  if (/^\/review\/[a-zA-Z0-9_-]+$/.test(unmountPath(target.pathname)) && !target.search) return target.pathname;
  const route = parseAdminRoute(target.pathname, target.search);
  return route.view === "not-found" ? fallback : adminUrl(route);
}

export function useAdminRoute() {
  const [route, setRoute] = useState(() =>
    parseAdminRoute(location.pathname, location.search),
  );
  const guard = useRef<(next: AdminRoute) => boolean | Promise<boolean>>(
    () => true,
  );
  const current = useRef({
    url: location.pathname + location.search,
    index: Number(history.state?.marginIndex) || 0,
  });
  const moving = useRef<(() => void) | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    const initial = parseAdminRoute(location.pathname, location.search);
    const url =
      initial.view === "not-found"
        ? location.pathname + location.search
        : adminUrl(initial);
    history.replaceState(
      { ...history.state, marginIndex: current.current.index },
      "",
      url,
    );
    current.current.url = url;
    const commit = (next: AdminRoute, url: string, index: number) => {
      current.current = { url, index };
      setRoute(next);
    };
    const restore = () => moveTo(current.current.index);
    function moveTo(index: number): Promise<void> {
      const delta = index - (Number(history.state?.marginIndex) || 0);
      if (!delta) return Promise.resolve();
      return new Promise((resolve) => {
        moving.current = resolve;
        history.go(delta);
      });
    }
    async function confirmPop(
      decision: Promise<boolean>,
      next: AdminRoute,
      url: string,
      index: number,
    ) {
      pending.current = true;
      // Put the address/history back while the dialog is open. On acceptance,
      // replay the original traversal without prompting for a second time.
      const [accepted] = await Promise.all([decision, restore()]);
      if (accepted) {
        await moveTo(index);
        commit(next, url, index);
      }
      pending.current = false;
    }
    const pop = () => {
      if (moving.current) {
        const done = moving.current;
        moving.current = null;
        done();
        return;
      }
      if (pending.current) {
        void restore();
        return;
      }
      const next = parseAdminRoute(location.pathname, location.search);
      const url = location.pathname + location.search;
      const index = Number(history.state?.marginIndex) || 0;
      const decision = guard.current(next);
      if (decision instanceof Promise)
        void confirmPop(decision, next, url, index);
      else if (decision) commit(next, url, index);
      else void restore();
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  async function navigate(next: AdminRoute, replace = false) {
    if (pending.current) return false;
    const url = adminUrl(next);
    if (url === current.current.url) return true;
    if (!replace) {
      pending.current = true;
      const accepted = await guard.current(next);
      pending.current = false;
      if (!accepted) return false;
    }
    const index = current.current.index + (replace ? 0 : 1);
    history[replace ? "replaceState" : "pushState"](
      { marginIndex: index },
      "",
      url,
    );
    current.current = { url, index };
    setRoute(next);
    return true;
  }
  return { route, navigate, guard };
}
