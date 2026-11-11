import type { AnalyticsMediaEvent } from "../../shared/analytics";
import { analyticsID } from "./measurement";

export type MediaEventSink = (event: AnalyticsMediaEvent) => void;
/** Actions are explicit player callbacks, never inferred from pointer clicks. */
export function mediaActions(mediaId: string, record: MediaEventSink) {
  let state: "idle" | "playing" | "paused" | "ended" | "exited" = "idle";
  let playedMs = 0;
  function emit(kind: AnalyticsMediaEvent["kind"], position: number, stopped = false) {
    if (!Number.isFinite(position) || position < 0) return;
    record({ id: analyticsID(), mediaId, kind, occurredAt: new Date().toISOString(), positionMs: Math.min(86_400_000, Math.round(position * 1000)), ...(stopped ? { playedMs: Math.floor(playedMs) } : {}) });
  }
  return {
    play(position: number) {
      if (state === "playing") return;
      const kind = state === "paused" ? "resume" : "play";
      state = "playing";
      playedMs = 0;
      emit(kind, position);
    },
    pause(position: number) {
      if (state === "exited") { state = "paused"; playedMs = 0; return; }
      if (state !== "playing") return;
      state = "paused";
      emit("pause", position, true);
      playedMs = 0;
    },
    seek(position: number) { emit("seek", position); },
    ended(position: number) {
      if (state === "exited") { state = "ended"; playedMs = 0; return; }
      if (state === "idle" || state === "ended") return;
      state = "ended";
      emit("ended", position, true);
      playedMs = 0;
    },
    listen(elapsed: number) {
      if (state === "playing") playedMs = Math.min(86_400_000, playedMs + elapsed);
    },
    exit(position: number) {
      if (state !== "playing") return;
      state = "exited";
      emit("exit", position, true);
    },
    attachPlaying() { if (state === "idle") state = "playing"; },
    restore(playing = true) {
      if (state !== "exited") return;
      state = playing ? "playing" : "paused";
      playedMs = 0;
    },
    reset() { state = "idle"; playedMs = 0; },
  };
}

export type MediaActions = ReturnType<typeof mediaActions>;
export function providerAction(actions: MediaActions, event: string, position: number) {
  const kinds: Record<string, "play" | "pause" | "seek" | "ended"> = {
    PLAY: "play", PAUSE: "pause", SEEK: "seek", FINISH: "ended",
    play: "play", pause: "pause", seeked: "seek", ended: "ended",
    "1": "play", "2": "pause", "0": "ended",
  };
  const kind = kinds[event];
  if (kind) actions[kind](position);
}
export function spotifyActionUpdates(actions: MediaActions) {
  let entity: string | undefined;
  return (data: { playingURI?: string; isPaused: boolean; isBuffering: boolean; position: number; duration: number }) => {
    if (entity && data.playingURI && entity !== data.playingURI) actions.reset();
    entity = data.playingURI;
    if (data.isBuffering) return;
    const position = data.position / 1000;
    if (data.duration > 0 && data.position >= data.duration) actions.ended(position);
    else if (data.isPaused) actions.pause(position);
    else actions.play(position);
  };
}
