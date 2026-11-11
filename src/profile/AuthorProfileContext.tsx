import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthorProfile } from "../../shared/author-profile";
import { api, json } from "../api";

type ProfileState = {
  profile: AuthorProfile | null;
  error: string;
  refresh: () => void;
  save: (profile: AuthorProfile) => Promise<AuthorProfile>;
};
const AuthorProfileContext = createContext<ProfileState | null>(null);
export const useAuthorProfile = () => useContext(AuthorProfileContext);

export function AuthorProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AuthorProfile | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    setError("");
    api<AuthorProfile>("/settings/profile", { signal: request.signal })
      .then(value => { if (!request.signal.aborted) setProfile(value); })
      .catch(error => { if (!request.signal.aborted) setError(error.message); });
    return () => request.abort();
  }, [attempt]);
  async function save(value: AuthorProfile) {
    const saved = await api<AuthorProfile>("/settings/profile", json("PUT", value));
    setProfile(saved);
    return saved;
  }
  return <AuthorProfileContext.Provider value={{ profile, error, save, refresh: () => setAttempt(value => value + 1) }}>
    {children}
  </AuthorProfileContext.Provider>;
}
