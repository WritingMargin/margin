import { api } from "../api";

export type OAuthConnection = { id: string; name: string; role: string; permissions?: string[]; grantedAt: string };
export type OAuthClient = { id: string; name: string; clientId: string; redirectUris: string[] };

export async function loadOAuthSettings(primaryOwner: boolean, signal?: AbortSignal) {
  const [connections, clients] = await Promise.all([
    api<OAuthConnection[]>("/oauth/connections", { signal }),
    primaryOwner ? api<OAuthClient[]>("/oauth/clients", { signal }) : Promise.resolve([]),
  ]);
  return { connections, clients };
}
