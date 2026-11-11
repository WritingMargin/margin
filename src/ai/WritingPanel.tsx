import { Feather } from "lucide-react";
import type { AdminController } from "../admin/useAdminController";
import EditorSidePanel from "../editor/EditorSidePanel";
import WritingAssistant from "./WritingAssistant";

export default function WritingPanel({
  state,
}: {
  state: Pick<
    AdminController,
    "post" | "writing" | "insert" | "editor" | "change"
  >;
}) {
  const { post, writing } = state;
  return (
    <EditorSidePanel
      id="writing-companion"
      label="Writing assistant"
      className="assistant-panel"
      icon={<Feather size={17} strokeWidth={1.6} aria-hidden="true" />}
      expanded={writing.expanded}
      setExpanded={writing.setExpanded}
      close={() => writing.setOpen(false)}
    >
      <WritingAssistant
        key={writing.key + ":" + writing.sessionKey}
        post={post}
        session={writing.session}
        onChange={writing.change}
        chats={writing.chats}
        sessionId={writing.sessionKey}
        historyError={writing.historyError}
        requestScope={writing.key + ":" + writing.sessionKey}
        createSession={writing.newSession}
        selectSession={writing.selectSession}
        changeContent={(content) => state.change({ content })}
        insert={state.insert}
        selection={() => {
          const input = state.editor.current;
          return (
            input?.value.slice(input.selectionStart, input.selectionEnd) || ""
          );
        }}
      />
    </EditorSidePanel>
  );
}
