import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("post/:slug", "routes/article.tsx"),
  route("post/:slug/simplified", "routes/simplified-article.tsx"),
  route("reader/alerts", "routes/reader-alerts.tsx"),
  route("admin/*", "routes/workspace.tsx"),
  route("oauth/authorize", "routes/oauth-authorize.tsx"),
  route("review/:invite", "routes/peer-review.tsx"),
  route("reader/sign-in", "routes/reader-sign-in.tsx"),
  route("comments/verify", "routes/comment-verification.tsx"),
  route("newsletter/:action", "routes/newsletter.tsx"),
  ...(process.env.NODE_ENV === "development" ? [route("__preview/passage", "routes/dev-passage.tsx")] : []),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
