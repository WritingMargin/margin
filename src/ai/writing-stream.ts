import { api, APIError, json } from "../api";
import { sitePath } from "../base-path";
import { requestIdentity, settleRequestIdentity } from "./request-identity";

export type WritingStreamEvent =
  | { event: "progress"; message: string }
  | { event: "delta"; text: string }
  | { event: "thinking"; text: string };

const maximumFrameLength = 1_000_000;

function streamError(payload: Record<string, unknown>) {
  return new APIError(
    typeof payload.error === "string"
      ? payload.error
      : "The writing assistant could not finish this request.",
    typeof payload.code === "string" ? payload.code : undefined,
  );
}

/** Read SSE frames from a POST response, including frames split across UTF-8 chunks. */
export async function readWritingStream<T>(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: WritingStreamEvent) => void,
): Promise<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];
  let complete: unknown;
  let finished = false;
  function handleEvent(name: string, payload: Record<string, unknown>) {
    if (name === "complete") {
      complete = payload;
      finished = true;
    } else if (name === "error") {
      throw streamError(payload);
    } else if (name === "progress" && typeof payload.message === "string") {
      onEvent({ event: name, message: payload.message });
    } else if (
      (name === "delta" || name === "thinking") &&
      typeof payload.text === "string"
    ) {
      onEvent({ event: name, text: payload.text });
    }
  }
  function dispatch() {
    if (!data.length) {
      event = "message";
      return;
    }
    const payload = JSON.parse(data.join("\n")) as Record<string, unknown>;
    handleEvent(event, payload);
    event = "message";
    data = [];
  }
  function consume(final: boolean) {
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (!line) dispatch();
      else if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (final) {
      if (buffer) {
        const line = buffer.replace(/\r$/, "");
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      dispatch();
    }
    if (buffer.length + data.join("\n").length > maximumFrameLength)
      throw new Error("The assistant response was too large to display.");
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      consume(done);
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (!finished)
    throw new Error(
      "The assistant connection ended before a response arrived. Try again.",
    );
  return complete as T;
}

export async function streamWritingRequest<T>(
  body: unknown,
  scope: string,
  onEvent: (event: WritingStreamEvent) => void,
): Promise<T> {
  const identity = await requestIdentity("/ai/writing", body, scope);
  try {
    const response = await fetch(sitePath("/api/ai/writing/stream"), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Idempotency-Key": identity.id,
      },
      body: JSON.stringify(body),
    });
    // An older server can still serve the same request through the JSON route.
    if ([404, 405, 406, 501].includes(response.status))
      return api<T>("/ai/writing", {
        ...json("POST", body),
        headers: { "Idempotency-Key": identity.id },
      }).then((result) => {
        settleRequestIdentity(identity, true);
        return result;
      });
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}));
      throw new APIError(
        typeof payload.error === "string"
          ? payload.error
          : "The writing assistant could not start this request.",
        typeof payload.code === "string" ? payload.code : undefined,
        response.status,
      );
    }
    const result = await readWritingStream<T>(response.body, onEvent);
    settleRequestIdentity(identity, true);
    return result;
  } catch (error) {
    settleRequestIdentity(identity, false, error);
    throw error;
  }
}
