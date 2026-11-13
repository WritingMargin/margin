import { ArrowUpRight } from "lucide-react";
import BrandMark from "../BrandMark";
import { sitePath } from "../base-path";
import ReviewerWorkspace from "./ReviewerWorkspace";
import type { TeamUser } from "../../shared/team";

export default function ReviewerHome({ user, logout }: { user?: TeamUser; logout: () => Promise<void> }) {
  return <main className="main-workspace">
    <header className="topbar">
      <a className="brand" href={sitePath("/admin/reviews")} aria-label="Margin review workspace">
        <BrandMark />margin<span className="brand-period">®</span>
      </a>
      <a className="visit-blog" href={sitePath("/")}>View publication <ArrowUpRight size={15} /></a>
    </header>
    <ReviewerWorkspace user={user} logout={logout} />
  </main>;
}
