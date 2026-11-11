import { APIError } from "../api";

export async function requestIdentity(path: string, body: unknown, scope = "") {
  const serialized = JSON.stringify(body);
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(path + scope + serialized),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const storageKey = `margin-ai-request:${hash}`;
  const id = sessionStorage.getItem(storageKey) || crypto.randomUUID();
  sessionStorage.setItem(storageKey, id);
  return { id, storageKey };
}

export function settleRequestIdentity(
  identity: { storageKey: string },
  success: boolean,
  error?: unknown,
) {
  if (
    success ||
    (error instanceof APIError &&
      ([
        "AI_GENERATION_FAILED",
        "AI_INVALID_RESPONSE",
        "AI_INTERRUPTED",
        "AI_RESULT_EXPIRED",
      ].includes(error.code || "") ||
        (error.status &&
          error.status < 500 &&
          error.code !== "AI_IN_PROGRESS")))
  )
    sessionStorage.removeItem(identity.storageKey);
}
