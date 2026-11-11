import { basePath } from "../base-path";

export type CommentIdentity = { name: string; email: string };
type DeviceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const commentIdentityKey = `margin:comment-identity:v1:${basePath || "/"}`;

function deviceStorage(): DeviceStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readCommentIdentity(
  storage = deviceStorage(),
): CommentIdentity | null {
  try {
    const value = JSON.parse(storage?.getItem(commentIdentityKey) || "null");
    if (
      !value ||
      typeof value.name !== "string" ||
      typeof value.email !== "string"
    )
      return null;
    if (value.name.length > 100 || value.email.length > 254) return null;
    return { name: value.name, email: value.email };
  } catch {
    return null;
  }
}

export function writeCommentIdentity(
  identity: CommentIdentity | null,
  storage = deviceStorage(),
): boolean {
  try {
    if (!storage) return false;
    if (identity)
      storage.setItem(
        commentIdentityKey,
        JSON.stringify({ name: identity.name, email: identity.email }),
      );
    else storage.removeItem(commentIdentityKey);
    return true;
  } catch {
    return false;
  }
}
