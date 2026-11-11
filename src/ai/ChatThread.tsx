import type { ChatBodyProps } from "./chat-types";
import WritingReview from "./WritingReview";
import ChatTurn from "./ChatTurn";
import ChatWelcome from "./ChatWelcome";
import ChatActivity from "./ChatActivity";
import ReplyMarkdown from "./ReplyMarkdown";
export default function ChatThread({
  post,
  session,
  onChange,
  insert,
  selection,
  keep,
  refine,
  copy,
  copied,
  manage,
  choose,
  updateFormatting,
}: ChatBodyProps) {
  const turnCount = session.turns.length;
  return (
    <>
      {!turnCount && !session.pendingMessage && (
        <ChatWelcome research={session.research} choose={choose} />
      )}
      <div className="chat-transcript" aria-label="Conversation">
        {session.turns.map((turn, index) => (
          <ChatTurn
            key={turn.id}
            {...{
              turn,
              index,
              post,
              session,
              onChange,
              insert,
              selection,
              keep,
              refine,
              copy,
              copied,
              manage,
              updateFormatting,
              choose,
            }}
          />
        ))}
        {session.pendingMessage && (
          <section className="chat-turn" aria-label="Current conversation turn">
            <p className="chat-author-message">{session.pendingMessage}</p>
            <div className="chat-reply">
              <ChatActivity activity={session.pendingActivity} pending />
              {session.pendingReply && (
                <ReplyMarkdown content={session.pendingReply} />
              )}
            </div>
          </section>
        )}
      </div>
      {(session.mode === "questions" || session.passage) && (
        <WritingReview session={session} onChange={onChange} />
      )}
    </>
  );
}
