import {
  useLoaderData,
  type ClientLoaderFunctionArgs,
  type MetaFunction,
} from "react-router";
import { PublicBlog } from "../blog/PublicBlog";
import { loadHome } from "./content";
import { publicMeta } from "./meta";

export function clientLoader({ request }: ClientLoaderFunctionArgs) {
  return loadHome(request);
}
export const meta: MetaFunction<typeof clientLoader> = ({ data }) =>
  data ? publicMeta(data.theme, data.canonical) : [];
export default function Home() {
  return <PublicBlog {...useLoaderData<typeof clientLoader>()} />;
}
export { RouteError as ErrorBoundary } from "./error";
