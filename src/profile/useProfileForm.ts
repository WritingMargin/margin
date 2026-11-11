import { useEffect, useState } from "react";
import { emptyAuthorProfile, type AuthorProfile } from "../../shared/author-profile";
import { useAuthorProfile } from "./AuthorProfileContext";

export function useProfileForm(notify: (message: string) => void, onDirtyChange: (dirty: boolean) => void) {
  const state = useAuthorProfile()!;
  const [profile, setProfile] = useState(state.profile ?? emptyAuthorProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = Boolean(state.profile && JSON.stringify(profile) !== JSON.stringify(state.profile));
  useEffect(() => { if (state.profile) setProfile(state.profile); }, [state.profile]);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await state.save(profile);
      notify("Profile saved. Your author details are up to date.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function change(fields: Partial<AuthorProfile>) { setProfile(current => ({ ...current, ...fields })); }
  return { ...state, profile, loaded: Boolean(state.profile), loadError: state.error, busy, error, dirty, change, save };
}
export type ProfileForm = ReturnType<typeof useProfileForm>;
