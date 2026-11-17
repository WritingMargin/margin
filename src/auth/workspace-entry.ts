import type { TeamRole } from "../../shared/team";

export function signedInEntry(search: string, role?: TeamRole) {
  const query = new URLSearchParams(search);
  const oauth = query.get("oauthAuthorize");
  if (oauth) return { kind: "oauth", query: oauth } as const;
  if (role === "peer_reviewer") return { kind: "reviews" } as const;
  const code = query.get("cliCode");
  if (code) return { kind: "cli", code } as const;
  return { kind: "workspace" } as const;
}
