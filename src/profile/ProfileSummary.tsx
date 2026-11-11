import ProfileAvatar from "./ProfileAvatar";
import type { AuthorProfile } from "../../shared/author-profile";

export default function ProfileSummary({ profile }: { profile: AuthorProfile }) {
  return <section className="profile-summary" aria-label="Your profile">
    <ProfileAvatar profile={profile} className="profile-portrait" />
    <div className="profile-summary-copy">
      <h2>{profile.name.trim() || "Your name"}</h2>
      <span className="profile-role">Publication owner</span>
      <p>{profile.bio?.trim() || "A little about the person behind the words."}</p>
    </div>
  </section>;
}
