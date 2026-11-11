import { Plus, X } from "lucide-react";
import type { ProfileForm } from "./useProfileForm";

export default function ProfileDetails({ state }: { state: ProfileForm }) {
  const { profile, change } = state;
  return <section className="settings-card profile-details" aria-labelledby="profile-details-title">
    <h2 id="profile-details-title">Personal details</h2>
    <p>Introduce yourself and give readers a way to find your work.</p>
    <div className="profile-field">
      <label htmlFor="profile-name">Display name
      <input id="profile-name" value={profile.name} maxLength={120} autoComplete="name" placeholder="Your name"
        aria-describedby="profile-name-help" onChange={event => change({ name: event.target.value })} /></label>
      <p id="profile-name-help" className="small-text">Appears in the author byline on every post. Leave blank to hide the byline.</p>
    </div>
    <div className="profile-field">
      <label htmlFor="profile-bio">Bio <span className="profile-optional">Optional</span>
      <textarea id="profile-bio" value={profile.bio ?? ""} rows={4} maxLength={600}
        placeholder="What do you write about? A few words about you."
        onChange={event => change({ bio: event.target.value })} /></label>
      <p className="small-text profile-character-count">{(profile.bio ?? "").length}/600</p>
    </div>
    <div className="profile-field">
      <label htmlFor="profile-website">Website <span className="profile-optional">Optional</span>
      <input id="profile-website" type="url" value={profile.website ?? ""} maxLength={2048} placeholder="https://your-website.com"
        onChange={event => change({ website: event.target.value })} /></label>
    </div>
    <ProfileLinks state={state} />
  </section>;
}

function ProfileLinks({ state: { profile, change } }: { state: ProfileForm }) {
  const links = profile.links ?? [];
  return <div className="profile-links">
    <div className="profile-section-label"><h3>Social & other links</h3><span className="profile-optional">Up to 4</span></div>
    <p className="small-text">Your portfolio, GitHub, LinkedIn, or anywhere else you share your work.</p>
    {links.map((link, index) => <div className="profile-link-row" key={index}>
      <label><span className="sr-only">Link {index + 1} label</span>
        <input value={link.label} maxLength={40} required placeholder="e.g. GitHub" onChange={event => change({ links: links.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} />
      </label>
      <label><span className="sr-only">Link {index + 1} URL</span>
        <input type="url" value={link.url} maxLength={2048} required placeholder="https://…" onChange={event => change({ links: links.map((item, i) => i === index ? { ...item, url: event.target.value } : item) })} />
      </label>
      <button className="icon-button" type="button" aria-label={`Remove link ${index + 1}`} onClick={() => change({ links: links.filter((_, i) => i !== index) })}><X size={16} /></button>
    </div>)}
    <button className="button" type="button" disabled={links.length >= 4} onClick={() => change({ links: [...links, { label: "", url: "" }] })}><Plus size={15} />Add link</button>
  </div>;
}
