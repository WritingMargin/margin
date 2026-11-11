import { UserRound } from "lucide-react";
import type { AuthorProfile } from "../../shared/author-profile";
import { safeMediaUrl } from "../media";

export default function ProfileAvatar({ profile, className = "profile-avatar" }: { profile?: AuthorProfile | null; className?: string }) {
  const image = safeMediaUrl(profile?.image);
  return <span className={className} aria-hidden="true">
    {image ? <img src={image} alt="" /> : <UserRound size={24} strokeWidth={1.4} />}
  </span>;
}
