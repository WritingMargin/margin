export function deploymentPath(): string {
  // Release builds use a reserved marker which Go resolves when serving assets.
  // Development retains its explicit Vite mount.
  const value = process.env.MARGIN_WEB_BUILD_BASE ?? process.env.MARGIN_BASE_PATH ?? "";
  if (value.length > 200 || !/^(?:\/[A-Za-z0-9_-]+)*$/.test(value))
    throw new Error("MARGIN_BASE_PATH must be empty or a path such as /blog without a trailing slash");
  return value;
}
