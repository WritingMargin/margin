import AccountGate from "../auth/AccountGate";
import { WritingAvailability } from "./WritingStatus";
import ChatComposer from "./ChatComposer";
import ChatResearchToggle from "./ChatResearchToggle";
import type { ChatDockProps } from "./chat-types";
export default function ChatDock({
  session,
  onChange,
  config,
  configError,
  refresh,
  input,
  contextTooLong,
  disabled,
  paneView,
  setPane,
  send,
}: ChatDockProps) {
  return (
    <div className="chat-dock">
      <AccountGate
        embedded
        feature="Writing assistant"
        onConnected={refresh}
        offlineTools={
          <div className="chat-compose-tools">
            <ChatResearchToggle
              checked={session.research}
              onChange={(research) => onChange({ research })}
            />
            {session.research && (
              <button
                className="chat-copy"
                type="button"
                onClick={() => setPane("library")}
              >
                Research library
              </button>
            )}
          </div>
        }
      >
        {(!config?.features.writing || configError) && (
          <WritingAvailability
            config={config}
            error={configError}
            refresh={refresh}
          />
        )}
        {contextTooLong && (
          <p className="chat-context-notice" role="status">
            Long text uses an excerpt from the beginning and end. Each message
            includes up to 40,000 draft characters and 12,000 selected
            characters.
          </p>
        )}
        <ChatComposer
          session={session}
          change={onChange}
          inputRef={input}
          config={config}
          disabled={disabled || !session.brief.trim()}
          library={paneView === "library"}
          toggleLibrary={() =>
            setPane(paneView === "library" ? "thread" : "library")
          }
          send={() => {
            setPane("thread");
            void send(session.brief);
          }}
        />
      </AccountGate>
    </div>
  );
}
