import { useState } from "react";
import type { Comment } from "../../shared/types";
import type { PassageFollowup } from "../../shared/interactions";
import { api, json } from "../api";
import "../blog/passage-interactions.css";
export default function QuestionModeration({
  comment,
  notify,
  refresh,
}: {
  comment: Comment;
  notify: (text: string) => void;
  refresh: () => Promise<unknown>;
}) {
  const [answer, setAnswer] = useState(comment.answer || "");
  const [busy, setBusy] = useState(false);
  return <>
    <form
      className="question-moderation"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api(`/comments/${comment.id}/answer`, json("PUT", { answer }));
          notify("Answer saved. It appears with the approved question.");
        } catch (e) {
          notify((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <strong>Question about a passage</strong>
      <blockquote>{comment.quote}</blockquote>
      {comment.anchor_status === "hidden" && (
        <p>
          Hidden by the edit policy when the original passage changed. Approving
          this question won’t make it public.
        </p>
      )}
      {comment.anchor_status === "detached" && (
        <p>The passage has changed. The original quote is preserved.</p>
      )}
      <label>
        Your answer
        <textarea
          rows={3}
          maxLength={10000}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </label>
      <button className="button" disabled={busy}>
        {busy ? "Saving…" : "Save answer"}
      </button>
    </form>
    {comment.followups?.map((followup) => <FollowupModeration key={followup.id} questionId={comment.id} followup={followup} notify={notify} refresh={refresh} />)}
  </>;
}

function FollowupModeration({ questionId, followup, notify, refresh }: {
  questionId: string;
  followup: PassageFollowup;
  notify: (text: string) => void;
  refresh: () => Promise<unknown>;
}) {
  const [answer, setAnswer] = useState(followup.answer || "");
  const [busy, setBusy] = useState(false);
  const endpoint = `/comments/${questionId}/followups/${followup.id}`;
  async function update(value: { approved?: boolean; answer?: string }) {
    setBusy(true);
    try {
      await api(endpoint, json("PATCH", value));
      await refresh();
      notify(value.answer !== undefined ? "Reply saved." : value.approved ? "Follow-up approved." : "Follow-up unapproved.");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <div className="question-followup-moderation">
    <strong>Reader follow-up · {followup.approved ? "Approved" : "Pending"}</strong>
    <p>{followup.body}</p>
    <form onSubmit={(event) => { event.preventDefault(); void update({ answer }); }}>
      <label>Your reply<textarea rows={3} maxLength={10000} value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
      <button className="button" disabled={busy}>{busy ? "Saving…" : "Save reply"}</button>
      <button type="button" className="button" disabled={busy} onClick={() => void update({ approved: !followup.approved })}>{followup.approved ? "Unapprove follow-up" : "Approve follow-up"}</button>
    </form>
  </div>;
}
