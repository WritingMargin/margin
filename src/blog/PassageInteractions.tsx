import { availableInteractions, canAnnotate } from "../../shared/interactions";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Bell, Flag, MessageCircle, Quote, Smile, StickyNote, X } from "lucide-react";
import type { PublicTheme } from "../../shared/frontend";
import type { Post } from "../../shared/types";
import type {
  InteractionData,
  PassageQuestion,
  PassageReaction,
} from "../../shared/interactions";
import { api, json } from "../api";
import { passagePosition, passageRange, passageText } from "./passage-anchors";
import { sitePath } from "../base-path";
import { citationText, citationURL, createPassageCitation } from "./passage-citation";
import PassageCitationDialog, { type CitationPreview } from "./PassageCitationDialog";
import CitedPassage from "./CitedPassage";
import QuestionComposer from "./QuestionComposer";
import type { PassageAnchor } from "./PassagePopover";
import PassageNotes from "./PassageNotes";
import PassageFlagComposer from "./PassageFlagComposer";
import ReaderAlerts from "./ReaderAlerts";
import ReaderAuth from "./ReaderAuth";
import ReaderDialog from "./ReaderDialog";
import { useCommentAuth } from "./useCommentAuth";
import PassageConversation from "./PassageConversation";
import { usePassageSelection } from "./usePassageSelection";
import "./passage-interactions.css";
import { ConversationTools, useConversationRefresh } from "./ConversationTools";
type Mark = {
  quote: string;
  occurrence: number;
  chipLeft: number;
  chipTop: number;
  rects: { left: number; top: number; width: number; height: number }[];
  questions: PassageQuestion[];
  reactions: PassageReaction[];
};
type Panel = "questions" | "ask" | "notes" | "activity" | "reaction-auth" | "flag" | "alerts" | null;
const reactionEmoji = ["❤️", "👏", "💡", "🤔", "🔥"];
const emptyInteractions: InteractionData = {
  enabled: false,
  questionMode: "hidden",
  notesEnabled: false,
  subscriber: false,
  questions: [],
  reactionsEnabled: false,
  reactions: [],
};
export default function PassageInteractions({
  post,
  theme,
  children,
  initialData,
}: {
  post: Post;
  theme: PublicTheme;
  children: ReactNode;
  initialData?: InteractionData;
}) {
  const { revision: conversationRevision } = useConversationRefresh();
  const auth = useCommentAuth();
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const selectionAnchor = useRef<Range | null>(null);
  const highlightClick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loadedData, setData] = useState<InteractionData>(initialInteractionData(initialData));
  const data = useMemo(
    () => availableInteractions(loadedData, theme),
    [loadedData, theme],
  );
  const [quote, setQuote] = useState("");
  const [occurrence, setOccurrence] = useState(0);
  const [selected, setSelected] = useState("");
  const [selectedOccurrence, setSelectedOccurrence] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [anchor, setAnchor] = useState<PassageAnchor | null>(null);
  const [menuTop, setMenuTop] = useState(0);
  const [menuLeft, setMenuLeft] = useState(0);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [error, setError] = useState("");
  const [citation, setCitation] = useState<CitationPreview | null>(null);
  const [localRevision, refresh] = useState(0);
  useEffect(() => {
    if (initialData) return;
    let active = true;
    if (post.status === "published")
      api<InteractionData>(`/public/posts/${post.id}/interactions`)
        .then((value) => {
          if (active) setData(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [post.id, post.revision, post.status, conversationRevision, localRevision, initialData, auth.reader]);
  const measure = useCallback(() => {
    if (content.current && root.current)
      setMarks(measureMarks(content.current, root.current, data.questions, data.reactions || []));
  }, [data.questions, data.reactions]);
  useEffect(() => {
    const node = content.current;
    if (!node) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    resize.observe(node);
    mutations.observe(node, { subtree: true, childList: true, characterData: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [measure]);
  useEffect(() => {
    if (panel === "reaction-auth" && auth.reader) setPanel("activity");
  }, [panel, auth.reader]);
  useEffect(() => () => {
    if (highlightClick.current !== null) clearTimeout(highlightClick.current);
  }, []);
  usePassageSelection(content, root, canSelectPassage(data, post), (selection) => {
    if (selection) {
      setMenuTop(selection.top);
      setMenuLeft(selection.left);
      setOccurrence(selection.occurrence);
      selectionAnchor.current = selection.range;
    }
    setQuote(selection?.quote || "");
  });
  function open(next: Panel, passage = quote, trigger?: HTMLElement, passageOccurrence = occurrence) {
    cancelHighlightClick();
    setAnchor(trigger || selectionAnchor.current);
    setSelected(passage);
    setSelectedOccurrence(passageOccurrence);
    setQuote("");
    setPanel(next);
  }
  function cite() {
    if (!content.current) return;
    const target = createPassageCitation(passageText(content.current), quote, occurrence, post.revision);
    if (!target) return;
    const path = `/post/${encodeURIComponent(post.slug)}`;
    const articleURL = theme.publicUrl ? theme.publicUrl.replace(/\/$/, "") + path : new URL(sitePath(path), window.location.origin).href;
    const url = citationURL(articleURL, target);
    setCitation({ quote, title: post.title, text: citationText(quote, post.title, theme.name, theme.authorProfile?.name, url) });
    setQuote("");
  }
  async function react(emoji: string, passage = quote, passageOccurrence = occurrence) {
    if (!auth.reader) {
      open("reaction-auth", passage, undefined, passageOccurrence);
      return "";
    }
    try {
      await api(`/public/posts/${post.id}/reactions`, json("POST", { quote: passage, occurrence: passageOccurrence, revision: post.revision, emoji }));
      refresh((value) => value + 1);
      setQuote("");
      setError("");
      return "Reaction saved.";
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      return message;
    }
  }
  function cancelHighlightClick() {
    if (highlightClick.current !== null) clearTimeout(highlightClick.current);
    highlightClick.current = null;
  }
  function onContentClick(event: ReactMouseEvent<HTMLDivElement>) {
    preserveSelectedLinkClick(event, content.current);
    cancelHighlightClick();
    const mark = clickedHighlight(event, root.current, marks);
    if (!mark) return;
    highlightClick.current = setTimeout(() => {
      highlightClick.current = null;
      if (window.getSelection()?.isCollapsed === false) return;
      open("activity", mark.quote, undefined, mark.occurrence);
    }, 300);
  }
  return (
    <div
      className="passage-interactions"
      data-enabled={data.enabled}
      ref={root}
    >
      <AuthorUpdateBanner update={data.authorUpdate} />
      <div className="passage-article-content" ref={content} onClickCapture={onContentClick} onPointerDownCapture={cancelHighlightClick} onDoubleClickCapture={cancelHighlightClick}>{children}</div>
      <CitedPassage content={content} root={root} postID={post.id} revision={post.revision} />
      {citation && <PassageCitationDialog citation={citation} onClose={() => setCitation(null)} />}
      <ArticleContributors contributors={data.contributors} />
      {showPassageTools(data, post) && (
        <>
          <PassageMarkers marks={marks} panel={panel} selected={selected} selectedOccurrence={selectedOccurrence} open={open} />
          <PassageActions
            data={data}
            quote={quote}
            menuTop={menuTop}
            menuLeft={menuLeft}
            open={open}
            dismiss={() => setQuote("")}
            react={(emoji) => void react(emoji)}
            canFlag={post.status === "published"}
            onCite={post.status === "published" ? cite : undefined}
          />
        </>
      )}
      {error && (
        <p className="small-text" role="status">
          Reader interactions could not load: {error}
        </p>
      )}
      {data.questionMode === "open" && isConversation(panel, anchor) && (
        <PassageConversation
          anchor={anchor}
          questions={data.questions}
          quote={selected}
          occurrence={selectedOccurrence}
          onClose={() => setPanel(null)}
        />
      )}
      {isQuestionComposer(panel, anchor, data) && (
        <QuestionComposer
          anchor={anchor}
          theme={theme}
          post={post}
          quote={selected}
          occurrence={selectedOccurrence}
          onClose={() => setPanel(null)}
        />
      )}
      <ReaderDialog
        open={["notes", "activity", "reaction-auth", "flag", "alerts"].includes(panel || "")}
        className={dialogClass(panel)}
        onClose={() => setPanel(null)}
        title={<>{panel === "alerts" && <Bell size={18} aria-hidden="true" />}{panelTitle(panel)}</>}
      >
        <PassageDialogBody panel={panel} data={data} post={post} theme={theme} selected={selected} occurrence={selectedOccurrence} auth={auth} onSaved={() => refresh((value) => value + 1)} onAddNote={() => setPanel("notes")} onReact={(emoji) => react(emoji, selected, selectedOccurrence)} />
      </ReaderDialog>
    </div>
  );
}
function canSelectPassage(data: InteractionData, post: Post) { return canAnnotate(data) || post.status === "published"; }
function showPassageTools(data: InteractionData, post: Post) { return data.enabled || data.subscriber || !!data.reactionsEnabled || post.status === "published"; }
function dialogClass(panel: Panel) { return `${panel === "notes" ? "passage-notes-sidebar" : ["activity", "flag", "alerts"].includes(panel || "") ? "passage-modal-sheet" : ""}`; }
function AuthorUpdateBanner({ update }: { update: InteractionData["authorUpdate"] }) {
  if (!update) return null;
  return <aside className="article-author-update" aria-label="Pinned author update"><span className="eyebrow">AUTHOR UPDATE</span><p>{update.body}</p><time dateTime={update.updatedAt}>{new Date(update.updatedAt).toLocaleDateString()}</time></aside>;
}
function ArticleContributors({ contributors }: { contributors: InteractionData["contributors"] }) {
  useEffect(() => {
    if (!window.location.hash.startsWith("#contribution-")) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (target?.closest(".article-contributors")) target.scrollIntoView({ block: "center" });
  }, [contributors]);
  if (!contributors?.length) return null;
  return <aside className="article-contributors" aria-label="Reader contributors"><span className="eyebrow">READER CONTRIBUTORS</span><p>Thanks to readers whose suggestions improved this article.</p><ul>{contributors.map((contributor, index) => <li id={`contribution-${contributor.id}`} key={contributor.id || `${contributor.name}-${contributor.position}-${index}`}><strong>{contributor.name}</strong><span> on “{contributor.quote}”</span></li>)}</ul></aside>;
}
function initialInteractionData(data?: InteractionData) {
  return data ?? emptyInteractions;
}
function PassageMarkers({ marks, panel, selected, selectedOccurrence, open }: {
  marks: Mark[];
  panel: Panel;
  selected: string;
  selectedOccurrence: number;
  open: (panel: Panel, passage?: string, trigger?: HTMLElement, occurrence?: number) => void;
}) {
  return <>
    <div className="passage-marks" aria-hidden="true">
      {marks.flatMap((mark) => mark.rects.map((rect, index) => (
        <span className="passage-highlight" key={`${mark.quote}-${mark.occurrence}-${index}`} style={rect} />
      )))}
    </div>
    {marks.map((mark) => <PassageMarker key={`${mark.quote}-${mark.occurrence}`} mark={mark} expanded={panel === "activity" && selected === mark.quote && selectedOccurrence === mark.occurrence} open={open} />)}
  </>;
}
function clickedHighlight(event: ReactMouseEvent<HTMLDivElement>, root: HTMLElement | null, marks: Mark[]) {
  if (!root || !isOrdinaryClick(event)) return null;
  if (window.getSelection()?.isCollapsed === false) return null;
  if (!(event.target instanceof Element) || event.target.closest("a, button, input, textarea, select, label, summary, iframe, audio, video, [contenteditable], [role='button'], [role='link']")) return null;
  const bounds = root.getBoundingClientRect();
  return highlightAt(marks, event.clientX - bounds.left, event.clientY - bounds.top);
}
function isOrdinaryClick(event: ReactMouseEvent<HTMLDivElement>) {
  return !event.defaultPrevented && event.button === 0 && event.detail <= 1 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}
function preserveSelectedLinkClick(event: ReactMouseEvent<HTMLDivElement>, content: HTMLElement | null) {
  const link = (event.target as Element).closest?.("a");
  const selection = window.getSelection();
  if (link && selection?.rangeCount && !selection.isCollapsed && content?.contains(selection.getRangeAt(0).commonAncestorContainer) && selection.getRangeAt(0).intersectsNode(link)) event.preventDefault();
}
export function highlightAt<T extends Pick<Mark, "quote" | "rects">>(marks: T[], x: number, y: number): T | null {
  return marks.filter((mark) => mark.rects.some((rect) => x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height))
    .sort((a, b) => a.quote.length - b.quote.length)[0] || null;
}
function PassageMarker({ mark, expanded, open }: {
  mark: Mark;
  expanded: boolean;
  open: (panel: Panel, passage?: string, trigger?: HTMLElement, occurrence?: number) => void;
}) {
  const reactions = mark.reactions.reduce((sum, reaction) => sum + reaction.count, 0);
  const conversations = mark.questions.length;
  const topReactions = [...mark.reactions].sort((a, b) => b.count - a.count).slice(0, 2);
  return <button
    className="passage-bubble passage-activity-marker"
    style={{ "--chip-left": `${mark.chipLeft}px`, "--chip-top": `${mark.chipTop}px` } as CSSProperties}
    aria-label={`${mark.questions.length} questions, ${reactions} reactions about ${mark.quote}`}
    aria-expanded={expanded}
    onClick={(event) => open("activity", mark.quote, event.currentTarget, mark.occurrence)}
  >
    {topReactions.map((reaction) => <span className="passage-marker-reaction" key={reaction.emoji} aria-hidden="true">{reaction.emoji} <strong>{reaction.count}</strong></span>)}
    {mark.reactions.length > 2 && <span className="passage-marker-more" aria-hidden="true">+{mark.reactions.length - 2}</span>}
    {conversations > 0 && <span className="passage-marker-conversations" aria-hidden="true"><MessageCircle size={12} /> {conversations}</span>}
  </button>;
}
function PassageDialogBody({ panel, data, post, theme, selected, occurrence, auth, onSaved, onAddNote, onReact }: {
  panel: Panel;
  data: InteractionData;
  post: Post;
  theme: PublicTheme;
  selected: string;
  occurrence: number;
  auth: ReturnType<typeof useCommentAuth>;
  onSaved: () => void;
  onAddNote: () => void;
  onReact: (emoji: string) => Promise<string>;
}) {
  if (panel === "reaction-auth") return <ReaderAuth auth={auth} prompt="Sign in to react to this passage." />;
  if (panel === "flag") return <PassageFlagComposer postId={post.id} revision={post.revision || ""} quote={selected} occurrence={occurrence} auth={auth} onSaved={onSaved} />;
  if (panel === "alerts") return <ReaderAlerts auth={auth} />;
  if (panel === "activity") return <PassageActivity quote={selected} occurrence={occurrence} reactionsEnabled={!!data.reactionsEnabled} onReact={onReact} canAddNote={canAddPassageNote(data)} onAddNote={onAddNote} postId={post.id} onSaved={onSaved} />;
  if (panel === "notes") return <PassageNotes postId={post.id} revision={post.revision || ""} quote={selected} occurrence={occurrence} notesEnabled={data.notesEnabled} auth={auth} onSaved={onSaved} />;
  return null;
}
function canAddPassageNote(data: InteractionData) {
  return data.notesEnabled;
}
function panelTitle(panel: Panel) {
  return {
    questions: "In the margins",
    ask: "Ask a question",
    notes: "Notes",
    activity: "In the margins",
    "reaction-auth": "React to this passage",
    flag: "Suggest an improvement",
    alerts: "Your alerts",
  }[panel || "questions"];
}
type SectionActivity = { entries: { kind: "question"; item: PassageQuestion }[]; reactions: PassageReaction[] };
export function PassageActivity({ quote, occurrence, reactionsEnabled, onReact, canAddNote, onAddNote, postId, onSaved, initialSection }: {
  quote: string;
  occurrence: number;
  reactionsEnabled: boolean;
  onReact: (emoji: string) => Promise<string>;
  canAddNote: boolean;
  onAddNote: () => void;
  postId: string;
  onSaved: () => void;
  initialSection?: SectionActivity;
}) {
  const [section, setSection] = useState<SectionActivity | null>(initialSection ?? null);
  const [sectionError, setSectionError] = useState("");
  const [sectionVersion, setSectionVersion] = useState(0);
  useEffect(() => {
    if (initialSection) return;
    let active = true;
    const query = new URLSearchParams({ quote, occurrence: String(occurrence) });
    api<SectionActivity>(`/public/posts/${postId}/sections?${query}`).then((value) => {
      if (active) { setSection(value); setSectionError(""); }
    }).catch((cause) => { if (active) setSectionError((cause as Error).message); });
    return () => { active = false; };
  }, [postId, quote, occurrence, sectionVersion, initialSection]);
  const saved = () => { setSectionVersion((value) => value + 1); onSaved(); };
  return <div className="passage-activity">
    {quote && <blockquote>{quote}</blockquote>}
    {sectionError && <p role="alert">{sectionError}</p>}
    {!section && !sectionError && <p role="status">Loading passage activity…</p>}
    {section && <LoadedPassageActivity section={section} reactionsEnabled={reactionsEnabled} onReact={onReact} canAddNote={canAddNote} onAddNote={onAddNote} postId={postId} onSaved={saved} />}
  </div>;
}
function LoadedPassageActivity({ section, reactionsEnabled, onReact, canAddNote, onAddNote, postId, onSaved }: {
  section: SectionActivity;
  reactionsEnabled: boolean;
  onReact: (emoji: string) => Promise<string>;
  canAddNote: boolean;
  onAddNote: () => void;
  postId: string;
  onSaved: () => void;
}) {
  const [choosingReaction, setChoosingReaction] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [reactionMessage, setReactionMessage] = useState("");
  return <>
    {(section.reactions.length > 0 || reactionsEnabled) && <div className="passage-activity-reactions" aria-label="Reactions">
      {section.reactions.map((reaction) => <span key={reaction.emoji}>{reaction.emoji} {reaction.count}</span>)}
      {reactionsEnabled && <button type="button" className="passage-activity-react" aria-label="Add reaction" title="Add reaction" aria-expanded={choosingReaction} onClick={() => setChoosingReaction((value) => !value)}><span aria-hidden="true">+</span><Smile size={15} aria-hidden="true" /></button>}
    </div>}
    {choosingReaction && <div className="passage-activity-reaction-picker" role="group" aria-label="Choose a reaction">
      {reactionEmoji.map((emoji) => <button type="button" key={emoji} aria-label={`React ${emoji}`} disabled={reactionBusy} onClick={async () => {
        setReactionBusy(true);
        setReactionMessage(await onReact(emoji));
        setReactionBusy(false);
        setChoosingReaction(false);
      }}>{emoji}</button>)}
    </div>}
    {reactionMessage && <p className="passage-reaction-status" role="status">{reactionMessage}</p>}
    <ActivityEntries entries={section.entries} postId={postId} onSaved={onSaved} />
    {canAddNote && <button type="button" className="passage-activity-add" onClick={onAddNote}><StickyNote size={15} /> Add a note</button>}
  </>;
}
function ActivityEntries({ entries, postId, onSaved }: {
  entries: SectionActivity["entries"];
  postId: string;
  onSaved: () => void;
}) {
  if (!entries.length) return null;
  return <div className="passage-activity-feed">{entries.map((entry) => <ActivityEntry key={entry.item.id} entry={entry} postId={postId} onSaved={onSaved} />)}</div>;
}
function ActivityEntry({ entry, postId, onSaved }: {
  entry: SectionActivity["entries"][number];
  postId: string;
  onSaved: () => void;
}) {
  const { item } = entry;
  return <article>
    <div className="passage-activity-byline"><strong>{item.name}</strong><span>asked</span></div>
    <p>{item.body}</p>
    {entryAnchorStatus(entry) !== "active" && <small>On an earlier version</small>}
    <PassageThread question={item} postId={postId} onSaved={onSaved} />
  </article>;
}
function entryAnchorStatus(entry: SectionActivity["entries"][number]) {
  return entry.item.section_anchor_status || entry.item.anchor_status;
}
function PassageThread({ question, postId, onSaved }: {
  question: PassageQuestion;
  postId: string;
  onSaved: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const result = await api<{ message: string }>(`/public/posts/${postId}/questions/${question.id}/followups`, json("POST", { body }));
      setBody("");
      setReplying(false);
      setMessage(result.message);
      onSaved();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <div className="passage-thread">
    {question.answer && <div className="passage-activity-reply"><strong>Writer</strong><span className="passage-thread-context"> replied</span><p>{question.answer}</p></div>}
    {question.followups?.map((followup) => <Fragment key={followup.id}>
      <div className="passage-thread-turn">
        <strong>{question.name}</strong><span className="passage-thread-context"> replied to writer</span><p>{followup.body}</p>
        {!followup.approved && <small>Awaiting approval</small>}
      </div>
      {followup.answer && <div className="passage-activity-reply"><strong>Writer</strong><span className="passage-thread-context"> replied to {question.name}</span><p>{followup.answer}</p></div>}
    </Fragment>)}
    {question.answer && question.canReply && !replying && <button type="button" className="passage-thread-action" onClick={() => setReplying(true)}>Reply to writer</button>}
    {replying && <form className="passage-thread-form" onSubmit={submit}>
      <label>Your reply<textarea required maxLength={10000} rows={3} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <div><button className="button primary" disabled={busy}>{busy ? "Sending…" : "Send reply"}</button><button type="button" className="button" onClick={() => setReplying(false)}>Cancel</button></div>
    </form>}
    {message && <p role="status" className="passage-thread-status">{message}</p>}
  </div>;
}
function isConversation(
  panel: Panel,
  anchor: PassageAnchor | null,
): anchor is PassageAnchor {
  return panel === "questions" && anchor !== null;
}
function isQuestionComposer(
  panel: Panel,
  anchor: PassageAnchor | null,
  data: InteractionData,
): anchor is PassageAnchor {
  return panel === "ask" && anchor !== null && data.questionMode === "open";
}
type MarkGroup = { quote: string; occurrence: number; questions: PassageQuestion[]; reactions: PassageReaction[] };
function measureMarks(
  content: HTMLElement,
  root: HTMLElement,
  questions: PassageQuestion[],
  reactions: PassageReaction[],
) {
  const groups = groupAnchors(questions, reactions);
  const origin = root.getBoundingClientRect();
  const marks = [...groups.values()].map((group) => measureMark(content, origin, group)).filter((mark): mark is Mark => mark !== null);
  marks.sort((a, b) => a.chipTop - b.chipTop);
  let bottom = -36;
  for (const mark of marks) {
    mark.chipTop = Math.max(mark.chipTop, bottom + 36);
    bottom = mark.chipTop;
  }
  return marks;
}
function groupAnchors(questions: PassageQuestion[], reactions: PassageReaction[]) {
  const groups = new Map<string, MarkGroup>();
  const get = (quote: string, occurrence = 0) => {
    const key = `${quote}\u0000${occurrence}`;
    const group = groups.get(key) || { quote, occurrence, questions: [], reactions: [] };
    groups.set(key, group);
    return group;
  };
  for (const question of questions) get(question.quote, question.occurrence).questions.push(question);
  for (const reaction of reactions.filter((r) => r.quote)) get(reaction.quote, reaction.occurrence).reactions.push(reaction);
  return groups;
}
function measureMark(content: HTMLElement, origin: DOMRect, group: MarkGroup): Mark | null {
  const { quote, occurrence } = group;
  const range = hasActiveAnchor(group) ? passageRange(content, quote, occurrence) : null;
  const fallback = passagePosition(content, anchorPosition(group));
  if (!range && !fallback) return null;
  const rects = range ? rangeRects(range, origin) : [];
  const block = range ? range.endContainer.parentElement?.closest("p, li, blockquote") : fallback;
  const blockRect = block?.getBoundingClientRect();
  const beside = !!range && !!block && !hasFollowingText(range, block);
  return { rects, ...group, ...markPlacement(rects, blockRect, origin, beside) };
}
function hasFollowingText(range: Range, block: Element) {
  const tail = range.cloneRange();
  tail.selectNodeContents(block);
  tail.setStart(range.endContainer, range.endOffset);
  return !!tail.toString().trim();
}
function hasActiveAnchor(group: MarkGroup) {
  return group.questions.some((question) => (question.section_anchor_status || question.anchor_status) === "active") || group.reactions.some((reaction) => reaction.anchor_status === "active");
}
function anchorPosition(group: MarkGroup) {
  return group.questions[0]?.position ?? group.reactions[0]?.position ?? 0;
}
function rangeRects(range: Range, origin: DOMRect) {
  return [...range.getClientRects()].map((rect) => ({ left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height }));
}
function markPlacement(rects: Mark["rects"], blockRect: DOMRect | undefined, origin: DOMRect, allowBeside: boolean) {
  const block = blockRect || origin;
  const last = rects[rects.length - 1];
  const right = block.right - origin.left;
  const beside = allowBeside && !!last && last.left + last.width + 144 <= right;
  return {
    chipLeft: beside ? last.left + last.width + 8 : Math.max(0, right - 136),
    chipTop: beside ? last.top + last.height / 2 : block.bottom - origin.top + 16,
  };
}

type ActionProps = {
  data: InteractionData;
  quote: string;
  menuTop: number;
  menuLeft?: number;
  open: (panel: Panel, passage?: string, trigger?: HTMLElement) => void;
  dismiss: () => void;
  react?: (emoji: string) => void;
  canFlag?: boolean;
  onCite?: () => void;
};
export function PassageActions(props: ActionProps) {
  return <>
    {props.quote && (canAnnotate(props.data) || props.canFlag || props.onCite) && <SelectedPassageActions {...props} />}
    <ArticlePassageTools {...props} />
  </>;
}
function hasArticleTools(data: InteractionData) {
  return data.notesEnabled || data.subscriber;
}
function SelectedPassageActions({ data, quote, menuTop, menuLeft = 0, open, dismiss, react, canFlag, onCite }: ActionProps) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = menu.current;
    if (!node) return;
    const position = () => positionSelectionMenu(node);
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, { passive: true });
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position);
    };
  }, [menuTop, menuLeft, quote, data, canFlag]);
  return <div ref={menu} className="passage-selection" style={{ top: menuTop, left: menuLeft }} role="toolbar" aria-label="Selected passage actions">
    <div className="passage-selection-heading">
      <span title={quote}>“{quote}”</span>
      <button type="button" className="passage-selection-close" aria-label="Dismiss selection" onClick={dismiss}><X size={14} /></button>
    </div>
    <div className="passage-selection-actions">
      {onCite && <button type="button" onClick={onCite}><Quote size={15} aria-hidden="true" /> Create citation</button>}
      {data.questionMode === "open" && <button type="button" onClick={() => open("ask")}><MessageCircle size={15} /> Ask a question</button>}
      {data.notesEnabled && <button type="button" onClick={() => open("notes")}><StickyNote size={15} /> Note</button>}
      {canFlag && <button type="button" onClick={() => open("flag")}><Flag size={15} /> Suggest a fix</button>}
      {data.reactionsEnabled && react && <div className="passage-reactions" role="group" aria-label="Choose a reaction">
        {reactionEmoji.map((emoji) => <button type="button" key={emoji} aria-label={`React ${emoji}`} onClick={() => react(emoji)}>{emoji}</button>)}
      </div>}
    </div>
  </div>;
}

function positionSelectionMenu(menu: HTMLElement) {
  menu.style.transform = "";
  const bounds = menu.getBoundingClientRect();
  const edge = window.innerHeight - 8;
  let top = bounds.top;
  if (bounds.bottom > edge) {
    const above = bounds.top - bounds.height - 16;
    top = above >= 8 ? above : Math.max(8, edge - bounds.height);
  }
  if (top < 8) top = 8;
  menu.style.transform = `translateY(${Math.round(top - bounds.top)}px)`;
}
function ArticlePassageTools({ data, open }: ActionProps) {
  return <ConversationTools>
    {hasArticleTools(data) && <button className="conversation-notes" type="button" onClick={() => open("notes", "")}><StickyNote size={14} aria-hidden="true" /> Notes</button>}
    <button className="conversation-notes" type="button" onClick={() => open("alerts", "")}><Bell size={14} aria-hidden="true" /> Alerts</button>
  </ConversationTools>;
}
