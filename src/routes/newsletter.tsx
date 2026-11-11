import { useLoaderData, type ClientLoaderFunctionArgs } from "react-router";
import { PublicBlog } from "../blog/PublicBlog";
import { loadNewsletter } from "./content";

export function clientLoader({ request, params }: ClientLoaderFunctionArgs) {
  return loadNewsletter(request, params.action);
}
export const meta = () => [
  { title: "Newsletter — Journal" },
  { name: "robots", content: "noindex, nofollow" },
];
export default function Newsletter() {
  return <PublicBlog {...useLoaderData<typeof clientLoader>()} />;
}
export { RouteError as ErrorBoundary } from "./error";
