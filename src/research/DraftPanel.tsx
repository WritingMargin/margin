import { useState } from "react";
import EditorSidePanel from "../editor/EditorSidePanel";
import type { AdminController } from "../admin/useAdminController";
import AuthorReviews from "../review/AuthorReviews";
import "./draft-panel.css";

export default function DraftPanel({
  state,
  close,
}: {
  state: AdminController;
  close: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <EditorSidePanel
      id="draft-tools"
      label="Peer review"
      className="draft-panel"
      expanded={expanded}
      setExpanded={setExpanded}
      close={close}
    >
      <div className="draft-panel-body">
        <AuthorReviews post={state.post} />
      </div>
    </EditorSidePanel>
  );
}
