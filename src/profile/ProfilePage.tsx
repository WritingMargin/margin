import { useState } from "react";
import PageHeading from "../components/PageHeading";
import InnerTabs from "../components/InnerTabs";
import ImagePicker from "../media/ImagePicker";
import PostByline from "../blog/PostByline";
import ProfileDetails from "./ProfileDetails";
import ProfileSummary from "./ProfileSummary";
import ProfileAccount from "./ProfileAccount";
import { useProfileForm } from "./useProfileForm";
import "./profile.css";

const tabs = [{ value: "public", label: "Public profile" }, { value: "account", label: "Account & security" }] as const;
export default function ProfilePage({ notify, onDirtyChange }: {
  notify: (message: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const state = useProfileForm(notify, onDirtyChange);
  const [tab, setTab] = useState<"public" | "account">("public");
  return <section className="page-content profile-page">
    <PageHeading label="YOUR WORKSPACE" title="Profile" description="Make it yours. Manage your public identity and your account." />
    {state.loadError && <p className="error-box" role="alert">{state.loadError} <button className="button" onClick={state.refresh}>Try again</button></p>}
    {!state.loaded && !state.loadError && <p role="status">Loading profile…</p>}
    {state.loaded && <>
      <ProfileSummary profile={state.profile} />
      <InnerTabs label="Profile sections" tabs={tabs} value={tab} onChange={setTab} numbered={false}
        idPrefix="profile-tab" panelId={value => `profile-panel-${value}`} />
      <div id={`profile-panel-${tab}`} role="tabpanel" aria-labelledby={`profile-tab-${tab}`}>
        {tab === "account" ? <ProfileAccount /> : <form onSubmit={event => { event.preventDefault(); void state.save(); }}>
          <fieldset className="profile-edit-fields" disabled={state.busy}>
            <div className="profile-grid">
              <ProfileDetails state={state} />
              <div className="profile-side">
                <section className="settings-card profile-photo">
                  <ImagePicker label="Profile photo" imageLabel="Profile photo"
                    description="Optional. A square image works best. Your photo appears beside your name on posts."
                    value={state.profile.image} onChange={image => state.change({ image })} />
                </section>
                <aside className="profile-byline-preview" aria-label="Post byline preview">
                  <span className="eyebrow">ON YOUR POSTS</span>
                  <PostByline byline={state.profile} />
                  <p className="small-text">{state.profile.name.trim()
                    ? "Saving this profile updates the byline on existing and future posts."
                    : "Save a display name to show a byline on existing and future posts."}</p>
                </aside>
              </div>
            </div>
            {state.error && <p className="error-box" role="alert">{state.error}</p>}
            <footer className="profile-save-bar">
              <span className="small-text">{state.dirty ? "You have unsaved changes." : "Your profile is up to date."}</span>
              <button className="button primary" disabled={!state.dirty}>{state.busy ? "Saving…" : "Save profile"}</button>
            </footer>
          </fieldset>
        </form>}
      </div>
    </>}
  </section>;
}
