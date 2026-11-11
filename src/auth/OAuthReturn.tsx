import { useEffect } from "react";
import { sitePath } from "../base-path";

// Only the query is carried through sign-in. The return destination is fixed.
export default function OAuthReturn({ query }: { query: string }) {
  useEffect(() => {
    location.replace(`${sitePath("/oauth/authorize")}?${new URLSearchParams(query).toString()}`);
  }, [query]);
  return <main className="page-content"><p>Opening the connection request…</p></main>;
}
