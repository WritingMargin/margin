import { z } from "zod";
import type { TeamRole, TeamUser } from "../../shared/team";

const offlineSessionSchema = z.object({
  authenticated: z.literal(true),
  setupRequired: z.literal(false),
  storageConfigured: z.boolean(),
  user: z.object({ id: z.string().min(1), email: z.string(), name: z.string() }).optional(),
  role: z.enum(["owner", "writer", "publisher"]).optional(),
  cloudManaged: z.boolean().optional(),
  primaryOwner: z.boolean().optional(),
  centralOrigin: z.string().optional(),
  articleIds: z.array(z.string()).optional(),
}).refine(value => !value.user || !!value.role);
export type OfflineSession = z.infer<typeof offlineSessionSchema>;
type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Session = {
  authenticated: boolean; storageConfigured: boolean; user?: TeamUser; role?: TeamRole;
  cloudManaged?: boolean; centralOrigin?: string; articleIds?: string[]; primaryOwner?: boolean;
};

export function rememberOfflineSession(storage: SessionStorage, key: string, session: Session) {
  if (!session.authenticated || session.role === "peer_reviewer") {
    forgetOfflineSession(storage, key);
    return;
  }
  const offline = offlineSessionSchema.parse({ ...session, setupRequired: false });
  const destination = session.user ? `${key}:member:${encodeURIComponent(session.user.id)}` : key;
  storage.setItem(destination, JSON.stringify(offline));
  if (destination !== key) storage.setItem(key, JSON.stringify({ memberKey: destination }));
}

export function forgetOfflineSession(storage: SessionStorage, key: string) {
  const current = storage.getItem(key);
  if (current) {
    try {
      const pointer = JSON.parse(current);
      if (typeof pointer.memberKey === "string" && pointer.memberKey.startsWith(`${key}:member:`)) storage.removeItem(pointer.memberKey);
    } catch { /* Remove invalid markers as well. */ }
  }
  storage.removeItem(key);
}

export function offlineSessionAfterNetworkError(storage: SessionStorage, key: string, cause: unknown): OfflineSession | null {
  if (!(cause instanceof TypeError)) return null;
  try {
    const value = storage.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value);
    if (typeof parsed.memberKey === "string" && parsed.memberKey.startsWith(`${key}:member:`)) {
      const member = storage.getItem(parsed.memberKey);
      return member ? offlineSessionSchema.parse(JSON.parse(member)) : null;
    }
    return offlineSessionSchema.parse(parsed);
  } catch { return null; }
}
