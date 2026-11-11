import { sitePath } from "../base-path";
import { isRouteErrorResponse, useRouteError } from "react-router";

export function RouteError() {
  const error = useRouteError();
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="journal-empty route-error" role="alert">
      <title>{missing ? "Page not found" : "Journal unavailable"}</title>
      <meta name="robots" content="noindex" />
      <h1>
        {missing
          ? "This page could not be found."
          : "This page is taking a moment."}
      </h1>
      <p>
        {missing
          ? "The story may have moved or is no longer published."
          : "Please try again shortly."}
      </p>
      <a className="button" href={sitePath("/")}>
        Back to the journal
      </a>
    </main>
  );
}
