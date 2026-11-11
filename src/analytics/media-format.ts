export function mediaPosition(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}.${Math.floor((ms % 1000) / 100)}`;
}

export function playbackDuration(ms: number) {
  if (ms < 1000 && ms > 0) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${Math.round(ms / 100) / 10}s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
