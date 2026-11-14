import CreditDialog from "../pricing/CreditDialog";
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
  return (
    <CreditDialog title="Invite a reviewer" onClose={close}>
      <div className="draft-panel-body">
        <AuthorReviews post={state.post} />
      </div>
    </CreditDialog>
  );
}
