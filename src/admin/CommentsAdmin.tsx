import QuestionModeration from "./QuestionModeration";
import { Check, MessageSquare, Trash2 } from "lucide-react";
import { date } from "../admin/post-utils";
import { api, json } from "../api";
import Empty from "../components/Empty";
import Select from "../components/Select";
import "./comments-admin.css";
import PageHeading from "../components/PageHeading";

import { useCommentsAdmin, type ModerationComment } from "./useCommentsAdmin";
export default function CommentsAdmin(
  props: Parameters<typeof useCommentsAdmin>[0] & { embedded?: boolean },
) {
  const state = useCommentsAdmin(props);
  const { notify, filter, setFilter, kind, setKind, offset, setOffset, hasMore, counts, comments, loading, refresh } = state;
  return (
    <section
      className={props.embedded ? "reader-conversations" : "page-content"}
    >
      {!props.embedded && (
        <PageHeading
          label="KEEP THE CONVERSATION GOING"
          title="A few words from your readers."
          description="Review conversations and approve contributions that require moderation."
        />
      )}
      <div
        className="conversation-filters"
        role="group"
        aria-label="Filter conversations"
      >
        <label>
          <span>Status</span>
          <Select
            value={filter}
            onChange={(event) => { setOffset(0); setFilter(event.target.value as "pending" | "all"); }}
          >
            <option value="pending">
              Awaiting approval ({counts.pending})
            </option>
            <option value="all">All conversations</option>
          </Select>
        </label>
        <label>
          <span>Type</span>
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="all">All types</option>
            <option value="questions">Passage questions</option>
            <option value="comments">Article comments</option>
          </Select>
        </label>
        {!loading && (
          <span className="conversation-result-count" role="status">
            {comments.length}{" "}
            {comments.length === 1 ? "conversation" : "conversations"} on this page
          </span>
        )}
      </div>
      <div id="conversation-results">
        {loading ? (
          <p role="status">Loading conversations…</p>
        ) : !comments.length ? (
          <Empty
            icon={<MessageSquare />}
            title="All quiet in the margins."
            text="Comments and passage questions appear here for approval. Private notes are only visible to their reader."
          />
        ) : (
          comments.map((comment) => <ModerationCard key={comment.id} comment={comment} notify={notify} refresh={refresh} />)
        )}
      </div>
      {(offset > 0 || hasMore) && <nav className="conversation-pagination" aria-label="Conversation pages"><button type="button" className="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</button><span>Page {Math.floor(offset / 20) + 1}</span><button type="button" className="button" disabled={!hasMore} onClick={() => setOffset(offset + 20)}>Next</button></nav>}
    </section>
  );
}

type CardProps = { comment: ModerationComment; notify: (message: string) => void; refresh: () => Promise<unknown> };
function ModerationCard({ comment, notify, refresh }: CardProps) {
  return <article className="comment-card">
    <div><span className="profile-avatar">{comment.name.charAt(0).toUpperCase()}</span><div><strong>{comment.name}</strong><small>{comment.email} · {date(comment.createdAt)}</small></div><span className="status-pill">{comment.approved ? "Approved" : "Pending"}</span></div>
    <p>{comment.body}</p>
    <p className="small-text">{commentKindLabel(comment)}</p>
    {comment.quote && <QuestionModeration comment={comment} notify={notify} refresh={refresh} />}
    <footer><CommentActions {...{ comment, notify, refresh }} /></footer>
  </article>;
}
function commentKindLabel(comment: ModerationComment) {
  return comment.quote ? "Passage question" : "Article comment";
}
async function mutate(path: string, init: RequestInit, notify: CardProps["notify"], refresh: CardProps["refresh"]) {
  try { await api(path, init); await refresh(); }
  catch (cause) { notify((cause as Error).message); }
}
function CommentActions({ comment, notify, refresh }: CardProps) {
  async function remove() {
    if (!confirm("Delete this comment?")) return;
    await mutate(`/comments/${comment.id}`, { method: "DELETE" }, notify, refresh);
  }
  return <>
    <button className="button" onClick={() => void mutate(`/comments/${comment.id}`, json("PATCH", { approved: !comment.approved }), notify, refresh)}><Check size={14} />{comment.approved ? "Unapprove" : "Approve"}</button>
    <button className="button danger" onClick={() => void remove()}><Trash2 size={14} />Delete</button>
  </>;
}
