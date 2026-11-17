import { sitePath } from "../base-path";
import { useTeamIdentity } from "./TeamContext";
export default function BillingLink() {
  const { primaryOwner } = useTeamIdentity();
  return primaryOwner ? <a href={sitePath("/admin/pricing")}>Plans & credits</a> : <span>Ask the publication’s primary owner about plans and credits.</span>;
}
