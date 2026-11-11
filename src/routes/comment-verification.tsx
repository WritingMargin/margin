import { useLoaderData, type ClientLoaderFunctionArgs } from "react-router";
import { PublicBlog } from "../blog/PublicBlog";
import { loadNewsletter } from "./content";
export async function clientLoader({ request }: ClientLoaderFunctionArgs) {
  const { theme } = await loadNewsletter(request, "confirm");
  return { theme, commentVerification: true };
}
export const meta = () => [
  { title: "Verify your comment" },
  { name: "robots", content: "noindex, nofollow" },
];
export default function VerifyComment() {
  return <PublicBlog {...useLoaderData<typeof clientLoader>()} />;
}
export { RouteError as ErrorBoundary } from "./error";
