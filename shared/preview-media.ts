/** Strip only the scoped preview grant when validating a renderer media path. */
export function previewMediaBase(value: string): string {
  return value.replace(/\?preview=[A-Za-z0-9_-]{43}$/, "");
}
