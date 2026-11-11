import assert from "node:assert/strict";
import test from "node:test";
import { APIError } from "./api";
import {
  readWritingStream,
  type WritingStreamEvent,
} from "./ai/writing-stream";

function chunks(parts: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

test("writing stream reads split UTF-8, progress, reasoning summary and reply deltas", async () => {
  const source = [
    'event: progress\r\ndata: {"message":"Checking the draft"}\r\n\r\n',
    'event: thinking\ndata: {"text":"One possible angle. "}\n\n',
    'event: delta\ndata: {"text":"A clearer opening: "}\n\n',
    'event: delta\ndata: {"text":"café"}\n\n',
    'event: complete\ndata: {"reply":"A clearer opening: café","plan":{"sections":[],"questions":[]}}\n\n',
  ].join("");
  const bytes = new TextEncoder().encode(source);
  const midpoint = source.indexOf("café") + 3;
  const parts = [
    bytes.slice(0, midpoint),
    bytes.slice(midpoint, midpoint + 1),
    bytes.slice(midpoint + 1),
  ];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      parts.forEach((part) => controller.enqueue(part));
      controller.close();
    },
  });
  const events: WritingStreamEvent[] = [];
  const result = await readWritingStream<{ reply: string }>(stream, (event) =>
    events.push(event),
  );
  assert.equal(result.reply, "A clearer opening: café");
  assert.deepEqual(events, [
    { event: "progress", message: "Checking the draft" },
    { event: "thinking", text: "One possible angle. " },
    { event: "delta", text: "A clearer opening: " },
    { event: "delta", text: "café" },
  ]);
});

test("writing stream accepts a buffered completion with no deltas", async () => {
  const events: WritingStreamEvent[] = [];
  const result = await readWritingStream<{ reply: string }>(
    chunks([
      'event: progress\ndata: {"message":"Writing"}\n\n',
      'event: complete\ndata: {"reply":"Finished"}',
    ]),
    (event) => events.push(event),
  );
  assert.equal(result.reply, "Finished");
  assert.deepEqual(events, [{ event: "progress", message: "Writing" }]);
});

test("writing stream surfaces server errors and rejects interrupted responses", async () => {
  await assert.rejects(
    readWritingStream(
      chunks([
        'event: error\ndata: {"error":"Credits unavailable","code":"NO_CREDITS"}\n\n',
      ]),
      () => {},
    ),
    (error: unknown) =>
      error instanceof APIError &&
      error.message === "Credits unavailable" &&
      error.code === "NO_CREDITS",
  );
  await assert.rejects(
    readWritingStream(
      chunks(['event: delta\ndata: {"text":"Partial"}\n\n']),
      () => {},
    ),
    /connection ended before a response arrived/,
  );
});
