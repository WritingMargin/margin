import { sitePath } from "./base-path";

export class APIError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(sitePath(`/api${path}`), {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const data = await res.json();
  if (!res.ok)
    throw new APIError(
      data.error || "Something went wrong. Please try again.",
      data.code,
      res.status,
    );
  return data;
}
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
