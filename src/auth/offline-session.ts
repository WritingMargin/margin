import { z } from "zod";

const offlineSessionSchema = z.object({
  authenticated: z.literal(true),
  setupRequired: z.literal(false),
  storageConfigured: z.boolean(),
});
export type OfflineSession = z.infer<typeof offlineSessionSchema>;
type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function rememberOfflineSession(
  storage: SessionStorage,
  key: string,
  session: { authenticated: boolean; storageConfigured: boolean },
) {
  if (!session.authenticated) {
    storage.removeItem(key);
    return;
  }
  const offline: OfflineSession = {
    authenticated: true,
    setupRequired: false,
    storageConfigured: session.storageConfigured,
  };
  storage.setItem(key, JSON.stringify(offline));
}

export function offlineSessionAfterNetworkError(
  storage: SessionStorage,
  key: string,
  cause: unknown,
): OfflineSession | null {
  if (!(cause instanceof TypeError)) return null;
  try {
    const value = storage.getItem(key);
    return value ? offlineSessionSchema.parse(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}
