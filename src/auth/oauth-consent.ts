import { sitePath } from "../base-path";

export type OAuthPermission = { scope: string; name: string; description: string };
export type OAuthConsentData = {
  client: { name: string };
  member: { email?: string; name?: string; role?: string };
  permissions: OAuthPermission[];
  redirectUri: string;
  resource: string;
  fields: Record<string, string>;
  action: string;
};
export class ConsentSignInRequired extends Error {}
export function consentSignInUrl(search: string) {
  return `${sitePath("/admin")}?oauthAuthorize=${encodeURIComponent(search.replace(/^\?/, ""))}`;
}
export async function loadOAuthConsent(search: string, signal: AbortSignal): Promise<OAuthConsentData> {
  const response = await fetch(`${sitePath("/oauth/authorize")}${search}`, {
    credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal,
  });
  if (response.status === 401) throw new ConsentSignInRequired();
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load this connection request. Try again.");
  signal.throwIfAborted();
  return data;
}
export function selectConsentPermission(selected: string[], scope: string, checked: boolean) {
  return checked ? Array.from(new Set([...selected, scope])) : selected.filter(value => value !== scope);
}
