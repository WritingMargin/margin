import { useLoaderData, type ClientLoaderFunctionArgs } from "react-router";
import type { PublicTheme } from "../../shared/frontend";
import { sitePath } from "../base-path";
import { BlogFrame } from "../blog/BlogFrame";
import ReaderAlerts from "../blog/ReaderAlerts";
import { useCommentAuth } from "../blog/useCommentAuth";

export async function clientLoader({ request }: ClientLoaderFunctionArgs) {
  const response = await fetch(new URL(sitePath("/api/public/settings"), request.url), { credentials: "same-origin", signal: request.signal });
  if (!response.ok) throw new Response("Publication unavailable", { status: response.status });
  return { theme: await response.json() as PublicTheme };
}
export const meta = () => [{ title: "Your alerts" }, { name: "robots", content: "noindex, nofollow" }];
export default function ReaderAlertsPage() {
  const { theme } = useLoaderData<typeof clientLoader>();
  const auth = useCommentAuth();
  return <BlogFrame theme={theme} section="homepage"><main className="public-article reader-alerts-page"><a className="back-link" href={sitePath("/")}>Back to the blog</a><h1>Your alerts</h1><ReaderAlerts auth={auth} /></main></BlogFrame>;
}
export { RouteError as ErrorBoundary } from "./error";
