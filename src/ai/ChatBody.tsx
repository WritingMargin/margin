import { ArrowLeft } from "lucide-react";
import ResearchPanel from "../research/ResearchPanel";
import SavedWritingNotes from "./SavedWritingNotes";
import { ChatSessionList } from "./ChatSessions";
import ChatThread from "./ChatThread";
import type { ChatBodyProps } from "./chat-types";
export default function ChatBody(props: ChatBodyProps) {
  const {
    post,
    session,
    onChange,
    insert,
    selection,
    chat,
    view,
    paneView,
    scroll,
  } = props;
  if (props.history)
    return (
      <div className="writing-scroll chat-scroll">
        <ChatSessionList
          chats={props.chats}
          active={props.sessionId}
          select={props.selectSession}
        />
      </div>
    );
  return (
    <div className="writing-scroll chat-scroll" ref={scroll}>
      {chat && session.error && (
        <p role="alert" className="error-box">
          {session.error}
        </p>
      )}
      {chat && paneView === "library" && (
        <LibraryHeading back={() => props.setPane("thread")} />
      )}
      <div hidden={!chat || paneView !== "thread"}>
        <ChatThread {...props} />
      </div>
      <div hidden={!chat || paneView !== "library"}>
        {session.research && (
          <ResearchPanel
            {...{ post, session, onChange, insert, selection }}
            visible={chat && paneView === "library"}
          />
        )}
      </div>
      <div hidden={view !== "saved"}>
        <SavedWritingNotes visible={view === "saved"} postId={post.id} />
      </div>
    </div>
  );
}
function LibraryHeading({ back }: { back: () => void }) {
  return (
    <div className="chat-tool-heading">
      <button
        type="button"
        aria-label="Back to chat"
        title="Back to chat"
        onClick={back}
      >
        <ArrowLeft size={16} />
      </button>
      <h3>Research library</h3>
    </div>
  );
}
