export const teamRoles = ["owner", "writer", "publisher", "peer_reviewer"] as const;
export type TeamRole = typeof teamRoles[number];
export type TeamUser = { id: string; email: string; name: string };
export const teamRoleLabels: Record<TeamRole, string> = {
  owner: "Owner", writer: "Writer", publisher: "Publisher", peer_reviewer: "Peer reviewer",
};
export function canPublish(role: TeamRole) { return role === "owner" || role === "publisher"; }
export function canOpenWorkspaceView(role: TeamRole, view: string) {
  return view === "connections" || role === "owner" || ((role === "writer" || role === "publisher") && ["posts", "editor", "media", "reviews"].includes(view));
}
export function memberWorkspaceKey(workspace: string, user?: TeamUser) {
  return user ? `${workspace}:member:${encodeURIComponent(user.id)}` : workspace;
}
