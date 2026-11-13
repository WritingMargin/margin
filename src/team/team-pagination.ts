import { api } from "../api";

export type TeamCollection = "members" | "invitations";
export type TeamPage<T> = { items: T[]; total: number; page: number; pageSize: number; pages: number };
type TeamPageResponse<T> = Omit<TeamPage<T>, "items"> & { members?: T[]; invitations?: T[] };

export async function loadTeamPage<T>(collection: TeamCollection, page: number, pageSize: number, signal: AbortSignal): Promise<TeamPage<T>> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const response = await api<TeamPageResponse<T>>(`/team/${collection}?${query}`, { signal });
  // An obsolete transport response must not replace a newer page, even if the
  // transport completed after its request was cancelled.
  signal.throwIfAborted();
  return { items: response[collection] ?? [], total: response.total, page: response.page, pageSize: response.pageSize, pages: response.pages };
}
