import type { WriterEditor } from "../editor/editor-handle";
import { contentTypeLabel, resolveContentType, type ContentType } from "../../shared/content-types";
import { useArticleAudit } from "./useArticleAudit";
import { useLivePost } from "./useLivePost";
import { usePostPage } from "./usePostPage";
import { postSavedMessage } from "../editor/save-state";
import { visibilityChange } from "../editor/visibility-change";
import { useConfirmation } from "./useConfirmation";
import { usePostConflicts } from "./usePostConflicts";
import { usePostSearch } from "./usePostSearch";
import { useLocalDraft } from "./useLocalDraft";
import { useNavigationSidebar } from "./useNavigationSidebar";
import { useWritingCompanion } from "../ai/useWritingCompanion";
import { sitePath } from "../base-path";
import { FileText, Image, Users, Paintbrush, ChartNoAxesCombined } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { defaultTheme, type Post, type Theme } from "../../shared/types";
import { useAdminRoute, type AdminView, type EditorMode } from "../admin-route";
import { draft, emptyDraft } from "../admin/post-utils";
import { APIError, api, json } from "../api";
import { cacheSavedPost, recoverOfflinePost } from "../../shared/local-drafts";

export function useAdminController({
  cloudManaged,
  storageConfigured,
  offline,
  logout,
}: {
  cloudManaged?: boolean;
  storageConfigured: boolean;
  offline: boolean;
  logout: () => Promise<void>;
}) {
  const { route, navigate, guard } = useAdminRoute();
  const confirmation = useConfirmation();
  const articleAudit = useArticleAudit();
  const confirmDiscard = () => confirmation.ask({
    title: "Discard your changes?",
    description: "Unsaved edits and the local backup will be removed. Your saved post won’t change.",
  });
  const view = route.view;
  const [postsVersion, setPostsVersion] = useState(0);
  const refreshPosts = () => setPostsVersion(value => value + 1);
  const postFeed = usePostPage("", 3, postsVersion);
  const posts = postFeed.posts;
  const [post, setPost] = useState<Post>(() =>
    route.view === "editor" && !route.postId ? emptyDraft(route.contentType) : draft(),
  );
  const writing = useWritingCompanion(post.id, resolveContentType(post.contentType));
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeVersion, setNoticeVersion] = useState(0);
  const [publishedNoticeId, setPublishedNoticeId] = useState<string | null>(
    null,
  );
  const editor = useRef<WriterEditor>(null);
  const search = usePostSearch(route, post.id, navigate, editor);
  const { query, update: setQuery } = search;
  const mode = route.mode || "split";
  const setMode = (mode: EditorMode) =>
    navigate({ view: "editor", postId: post.id, contentType: post.contentType, mode });
  const setView = (view: AdminView) =>
    navigate(view === "editor" ? { view, postId: post.id, contentType: post.contentType, mode } : { view });
  const [postError, setPostError] = useState("");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [designDirty, setDesignDirty] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [readersDirty, setReadersDirty] = useState(false);
  const shareOnArrival = useRef<string | null>(null);
  const [modal, setModal] = useState<
    | "media"
    | "details"
    | "published-details"
    | "seo-details"
    | "sharing-image"
    | "help"
    | "blocks"
    | "tabs"
    | "ai"
    | "citation"
    | "history"
    | "conflict"
    | null
  >(null);
  const [aiTab, setAiTab] = useState<"social" | "images">("images");
  const openAI = (tab: "social" | "images") => {
    setAiTab(tab);
    setModal("ai");
  };
  const navigationSidebar = useNavigationSidebar(view === "editor" && writing.open);
  const { mobile, setMobile } = navigationSidebar;
  const latestPost = useRef(post);
  latestPost.current = post;
  const savingRef = useRef(false);
  const openedPost = useRef<string | null>(null);
  guard.current = async (next) => {
    if (!(await allowReaderNavigation(next))) return false;
    if (settingsDirty && next.view !== route.view && !(await confirmation.ask({
      title: "Discard your settings?", description: "Your unsaved profile or publication settings will be lost. Keep editing to review and save them.",
    }))) return false;
    if (designDirty && next.view !== "designer" && !(await confirmation.ask({
      title: "Discard your design changes?", description: "Your unsaved design changes will be lost. Your last saved blog design will stay unchanged.",
    }))) return false;
    return allowPostNavigation(next);
  };
  function allowReaderNavigation(next: typeof route) {
    if (!readersDirty || (next.view === "readers" && next.readersTab === "settings")) return true;
    return confirmation.ask({ title: "Discard reader settings?", description: "Your unsaved reader and email settings will be lost." });
  }
  async function allowPostNavigation(next: typeof route) {
    if (next.view !== "editor") return true;
    if ((next.postId || "") === post.id && (post.id || resolveContentType(next.contentType) === resolveContentType(post.contentType))) return true;
    if (savingRef.current) return false;
    if (!dirty) return true;
    if (!(await confirmDiscard())) return false;
    localDraft.discard(post.id);
    return true;
  }
  const notify = (s: string) => {
    setPublishedNoticeId(null);
    setNoticeVersion(version => version + 1);
    setNotice(s);
  };
  const conflicts = usePostConflicts({
    latestPost,
    setPost,
    setDirty,
    notify,
    open: () => setModal("conflict"),
    close: () => setModal(null),
  });
  const localDraft = useLocalDraft(post, dirty, conflicts.baseline, notify);
  const livePost = useLivePost({
    post,
    enabled: route.view === "editor" && route.postId === post.id,
    dirty,
    busy,
    blocked: modal !== null || !!confirmation.prompt,
    refreshPosts,
    apply: saved => {
      if (savingRef.current || latestPost.current !== post) return false;
      conflicts.saved(saved);
      latestPost.current = saved;
      setPost(saved);
      setDirty(false);
      return true;
    },
  });
  function openPost(saved: Post, cache = false) {
    if (cache) {
      try { cacheSavedPost(localStorage, sitePath("/admin"), saved); }
      catch { /* The editor's local backup reports storage failures. */ }
    }
    const recovered = localDraft.recover(saved);
    const baseline = recovered ? recovered.baseline : saved;
    if (baseline) conflicts.saved(baseline);
    else conflicts.reset();
    openedPost.current = saved.id;
    setPost(recovered ? recovered.post : saved);
    setDirty(!!recovered);
  }
  useEffect(() => {
    let active = true;
    api<Theme>("/settings")
      .then((t) => {
        if (!active) return;
        setTheme(t);
        setThemeLoaded(true);
      })
      .catch((e) => {
        if (offline && e instanceof TypeError) return;
        notify(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    setModal(arrivalDialog(route.postId, shareOnArrival.current));
    shareOnArrival.current = null;
    if (!query || route.view !== "posts") setMobile(false);
    setPostError("");
    if (
      route.view !== "editor" ||
      ((route.postId || "") === openedPost.current &&
        openedPost.current === latestPost.current.id &&
        (!!route.postId || resolveContentType(route.contentType) === resolveContentType(latestPost.current.contentType)))
    )
      return;
    let active = true;
    if (!route.postId) {
      openPost(emptyDraft(route.contentType));
      return;
    }
    api<Post>(`/posts/${encodeURIComponent(route.postId)}`)
      .then((saved) => {
        if (active) {
          openPost(saved, true);
        }
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof TypeError) {
          try {
            const workspace = sitePath("/admin");
            const cached = recoverOfflinePost(localStorage, workspace, route.postId!);
            if (cached) { openPost(cached); return; }
          } catch { /* Show the original connection error. */ }
        }
        setPostError(error.message);
      });
    return () => {
      active = false;
    };
  }, [route.view, route.postId, route.contentType]);
  useEffect(() => {
    if (!dirty && !designDirty && !settingsDirty && !readersDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      const backedUp = localDraft.flush();
      if (!designDirty && !settingsDirty && !readersDirty && backedUp) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, designDirty, settingsDirty, readersDirty]);
  const change = (p: Partial<Post>) => {
    const next = { ...latestPost.current, ...p };
    latestPost.current = next;
    setPost(next);
    setDirty(true);
  };
  const load = (p: Post) => navigate({ view: "editor", postId: p.id, contentType: p.contentType });
  const newPost = async (contentType: ContentType = "article") => {
    if (savingRef.current || confirmation.prompt) return;
    if (
      needsNewDraftConfirmation(post, dirty, contentType) &&
      !(await confirmDiscard())
    )
      return;
    if (!(await navigate({ view: "editor", postId: "", contentType }, false))) return;
    writing.newDraft(contentType);
    if (!post.id && dirty) localDraft.discard("");
    openPost(emptyDraft(contentType));
  };
  function finishSaveRoute(snapshot: Post, next: Post) {
    const live = next.status === "published";
    if (!snapshot.id && location.pathname === sitePath("/admin/posts/new")) {
      shareOnArrival.current = live ? next.id : null;
      void navigate({ view: "editor", postId: next.id, mode }, true);
    } else if (live && modal !== "ai") {
      setModal("published-details");
    }
  }
  function saveOnDevice() {
    if (!localDraft.saveLocally()) {
      notify("This device could not save your draft. Keep the editor open and copy your text before leaving.");
      return false;
    }
    setDirty(true);
    notify(post.status === "draft"
      ? "Saved on this device. Your draft will sync after you reconnect."
      : "Saved on this device. Reconnect and save these changes when ready.");
    return false;
  }
  const save = async (publish = false) => {
    if (savingRef.current || modal === "conflict") return;
    savingRef.current = true;
    const snapshot = post;
    const previousPost = conflicts.baseline.current;
    setBusy(true);
    try {
      if (offline || !navigator.onLine) return saveOnDevice();
      await articleAudit.beforeSave(post, publish);
      const next = await persistPost(post, publish);
      writing.saved(next.id);
      conflicts.saved(next);
      localDraft.discard(snapshot.id, snapshot.contentType);
      openedPost.current = next.id;
      await applySavedPost(
        latestPost,
        snapshot,
        setPost,
        next,
        setDirty,
        refreshPosts,
      );
      finishSaveRoute(snapshot, next);
      const label = contentTypeLabel(snapshot.contentType, theme.publicationType);
      notify(savedPostMessage(previousPost, next, publish, label));
      articleAudit.afterSave(next);
      if (publish && next.status === "published") setPublishedNoticeId(next.id);
      return true;
    } catch (e) {
      if (e instanceof TypeError) return saveOnDevice();
      handleSaveFailure(e, conflicts.review, notify);
      return false;
    } finally {
      setBusy(false);
      savingRef.current = false;
    }
  };
  useEffect(() => {
    if (offline) return;
    const sync = () => {
      if (localDraft.pendingSync.current && dirty && post.status === "draft" && !savingRef.current)
        void save();
    };
    const timer = window.setTimeout(sync, 500);
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
    };
  }, [offline, post.id, route.view, dirty]);
  const insert = (before: string, after = "") => {
    const el = editor.current;
    const text = post.content || "";
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    change({
      content:
        text.slice(0, start) +
        before +
        text.slice(start, end) +
        after +
        text.slice(end),
    });
    setModal(null);
    setView("editor");
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + before.length, end + before.length);
    });
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (confirmation.prompt) return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "s") {
          e.preventDefault();
          void save();
        }
        if (e.key === "k") {
          e.preventDefault();
          navigationSidebar.search();
        }
        if (e.key === "n") {
          e.preventDefault();
          newPost();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const nav = [
    { id: "posts", icon: FileText, label: "All content" },
    { id: "designer", icon: Paintbrush, label: "Publication designer" },
    { id: "media", icon: Image, label: "Media library" },
    { id: "readers", icon: Users, label: "Readers" },
    { id: "analytics", icon: ChartNoAxesCombined, label: "Analytics" },
  ] as const;
  const words = (post.content || "").trim().split(/\s+/).filter(Boolean).length;
  return {
    confirmation,
    livePost,
    localDraft,
    search,
    conflicts,
    navigationSidebar,
    writing,
    setSettingsDirty,
    setReadersDirty,
    cloudManaged,
    storageConfigured,
    offline,
    logout: async () => {
      if (!localDraft.flush())
        throw new Error(
          "Local backup failed. Save your draft before signing out.",
        );
      await logout();
    },
    route,
    navigate,
    view,
    posts,
    refreshPosts,
    postsVersion,
    postFeed,
    post,
    setPost,
    theme,
    setTheme,
    dirty,
    setDirty,
    busy,
    notice,
    noticeVersion,
    setNotice,
    publishedNoticeId,
    articleAudit,
    query,
    setQuery,
    mode,
    setMode,
    setView,
    postError,
    themeLoaded,
    setDesignDirty,
    modal,
    setModal,
    aiTab,
    openAI,
    mobile,
    setMobile,
    editor,
    notify,
    change,
    load,
    newPost,
    save,
    insert,
    nav,
    words,
  };
}
export type AdminController = ReturnType<typeof useAdminController>;

function arrivalDialog(postId: string | undefined, publishedId: string | null) {
  return publishedId && postId === publishedId ? "published-details" : null;
}

async function applySavedPost(
  latestPost: React.RefObject<Post>,
  snapshot: Post,
  setPost: React.Dispatch<React.SetStateAction<Post>>,
  next: Post,
  setDirty: React.Dispatch<React.SetStateAction<boolean>>,
  refreshPosts: () => void,
) {
  if (latestPost.current === snapshot) {
    setPost(next);
    setDirty(false);
  } else if (latestPost.current.id === snapshot.id) {
    setPost((current) => ({
      ...current,
      id: next.id,
      revision: next.revision,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt,
      status: next.status,
    }));
  }
  refreshPosts();
}

function savedPostMessage(previous: Post | null, next: Post, publish: boolean, label: string) {
  const visibility = visibilityChange(previous?.status, next.status, label.toLowerCase());
  if (visibility) return visibility.success;
  if (next.status === "archived") return `${label} archived. It is not publicly visible.`;
  return postSavedMessage(next.status === "published" && previous?.status === "published", publish, label);
}

function persistPost(post: Post, publish: boolean) {
  return api<Post>(
    post.id ? `/posts/${post.id}` : "/posts",
    json(post.id ? "PUT" : "POST", {
      ...post,
      status: publish ? "published" : post.status,
    }),
  );
}

function handleSaveFailure(
  error: unknown,
  review: () => void,
  notify: (message: string) => void,
) {
  if (error instanceof APIError && error.code === "REVISION_CONFLICT") review();
  else notify((error as Error).message);
}

function needsNewDraftConfirmation(post: Post, dirty: boolean, type: ContentType) {
  return !post.id && dirty && resolveContentType(post.contentType) === type;
}
