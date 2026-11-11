// Release builds contain a base marker resolved by Go when serving this module.
// Vite development and Node-based unit tests use their configured base directly.
export const basePath = (import.meta.env?.BASE_URL || "/").replace(/\/$/, "");
export function sitePath(path: string): string { return basePath + path; }
export function unmountPath(path: string): string {
  return basePath && path.startsWith(basePath + "/") ? path.slice(basePath.length) : path;
}
export function mediaPath(value: string): string {
  return value.startsWith("/api/") ? sitePath(value) : value;
}
