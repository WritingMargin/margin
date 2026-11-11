import { useId, type RefObject } from "react";
import { ArrowUp, LibraryBig, Loader2 } from "lucide-react";
import type { WritingSession } from "../../shared/writing";
import ChatContext from "./ChatContext";
import ChatResearchToggle from "./ChatResearchToggle";
import type { AIConfig } from "../../shared/ai";

type Props = {
  session: WritingSession;
  change: (patch: Partial<WritingSession>) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  config: AIConfig | null;
  disabled: boolean;
  library: boolean;
  toggleLibrary: () => void;
  send: () => void;
};

export default function ChatComposer({
  session,
  change,
  inputRef,
  config,
  disabled,
  library,
  toggleLibrary,
  send,
}: Props) {
  const id = useId();
  const message = session.busy ? "" : session.brief;

  return (
    <form
      className="chat-compose"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) send();
      }}
    >
      <div className="chat-compose-box">
        <label className="sr-only" htmlFor={id}>
          Message the Writing Assistant
        </label>
        <div className="chat-message-field">
          <span className="chat-message-measure" aria-hidden="true">
            {message}
            {"\u200b"}
          </span>
          <textarea
            ref={inputRef}
            id={id}
            rows={2}
            maxLength={4000}
            value={message}
            disabled={session.busy}
            placeholder={
              session.turns.length
                ? "Ask a follow-up…"
                : "Message the Writing Assistant…"
            }
            onChange={(e) => change({ brief: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing)
                return;
              e.preventDefault();
              if (!disabled) send();
            }}
          />
        </div>
        <div className="chat-compose-tools">
          <ChatResearchToggle
            describedBy={session.research ? id + "-research-hint" : undefined}
            checked={session.research}
            disabled={session.busy}
            onChange={(research) => change({ research })}
          />
          <ChatContext session={session} change={change} />
          {session.research && (
            <button
              type="button"
              className="chat-tool"
              aria-label="Research library"
              title="Research library"
              aria-expanded={library}
              onClick={toggleLibrary}
            >
              <LibraryBig size={16} />
            </button>
          )}
          <button
            className="chat-send"
            type="submit"
            title="Send message"
            aria-label="Send message"
            disabled={disabled}
          >
            {session.busy ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <ArrowUp size={18} />
            )}
          </button>
        </div>
      </div>
      <ComposerCaption research={session.research} id={id} config={config} />
    </form>
  );
}

function ComposerCaption({
  research,
  id,
  config,
}: {
  research: boolean;
  id: string;
  config: AIConfig | null;
}) {
  const cost = config?.costs?.writing;
  return (
    <div className="chat-caption">
      {research && (
        <small id={id + "-research-hint"}>Paper searches use Crossref.</small>
      )}
      {cost != null && (
        <small>
          {cost} {cost === 1 ? "credit" : "credits"} per message ·{" "}
          {config?.credits} available
        </small>
      )}
    </div>
  );
}
