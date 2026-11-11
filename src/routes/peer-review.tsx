import { useLoaderData, type ClientLoaderFunctionArgs } from "react-router";
import { PublicBlog } from "../blog/PublicBlog";
import { loadNewsletter } from "./content";
export async function clientLoader({
  params,
  request,
}: ClientLoaderFunctionArgs) {
  const { theme } = await loadNewsletter(request, "confirm");
  return { theme, reviewInvite: params.invite };
}
export const meta = () => [
  { title: "Peer review" },
  { name: "robots", content: "noindex, nofollow" },
];
export default function PeerReviewRoute() {
  return <PublicBlog {...useLoaderData<typeof clientLoader>()} />;
}
export { RouteError as ErrorBoundary } from "./error";
