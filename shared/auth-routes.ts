// Authentication always enters through the instance-aware workspace gate.
export const authEntryPaths = [
  "/signup",
  "/setup",
  "/login",
  "/admin/signup",
  "/admin/setup",
  "/admin/login",
];
export const isAuthEntry = (pathname: string) =>
  authEntryPaths.includes(pathname.replace(/\/+$/, ""));
