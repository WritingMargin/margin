export function clientLoader() {
  throw new Response("Not found", { status: 404 });
}
export { RouteError as ErrorBoundary } from "./error";
export default function NotFound() {
  return null;
}
