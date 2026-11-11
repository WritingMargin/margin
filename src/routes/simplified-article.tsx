import { useLoaderData, type ClientLoaderFunctionArgs, type MetaFunction } from "react-router";
import { PublicBlog } from "../blog/PublicBlog";
import { loadArticle } from "./content";
import { publicMeta } from "./meta";

export function clientLoader({ request, params }: ClientLoaderFunctionArgs) {
  return loadArticle(request, params.slug!, true);
}
export const meta: MetaFunction<typeof clientLoader> = ({ data }) =>
  data ? publicMeta(data.theme, data.canonical, data.post) : [];
export default function SimplifiedArticle() {
  return <PublicBlog {...useLoaderData<typeof clientLoader>()} />;
}
export { RouteError as ErrorBoundary } from "./error";
