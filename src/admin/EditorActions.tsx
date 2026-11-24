import { useTeamIdentity } from "../auth/TeamContext";
import { contentTypeLabel } from "../../shared/content-types";
import { History, SlidersHorizontal, Sparkles } from "lucide-react";
import type { AdminController } from "./useAdminController";
import { date } from "./post-utils";
import EditorOptionsMenu, { type EditorMenuItem } from "../editor/EditorOptionsMenu";

type State = Pick<AdminController, "post" | "theme" | "setModal" | "openAI">;
/** Extra menu entries supplied by the page (e.g. Customize, Guide). */
export type { EditorMenuItem } from "../editor/EditorOptionsMenu";
export default function EditorActions({ state, more = [] }: { state: State; more?: EditorMenuItem[] }) {
  const { post, setModal, openAI } = state;
  const { role } = useTeamIdentity();
  const label = contentTypeLabel(post.contentType, state.theme.publicationType);
  const items: EditorMenuItem[] = [
    { label: `${label} details`, icon: SlidersHorizontal, run: () => setModal("details") },
  ];
  if (role === "owner" && (post.status === "published" || post.baseRevision)) {
    items.push({ label: "Social summaries", icon: Sparkles, run: () => openAI("social") });
  }
  if (post.id) items.push({ label: "Revision history", icon: History, run: () => setModal("history") });
  return <EditorOptionsMenu label={`${label} options`} items={[...items, ...more]}
    footer={post.id ? <p>Updated {date(post.updatedAt)}</p> : undefined} />;
}
