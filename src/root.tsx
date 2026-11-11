import { sitePath } from "./base-path";
import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "./fonts";
import "./styles.css";
import "./admin/workspace-settings.css";
import { RouteError } from "./routes/error";
import StartupScreen from "./StartupScreen";

export function Layout({ children }: { children: ReactNode }) {
  const nonce =
    typeof document === "undefined"
      ? "__MARGIN_NONCE__"
      : document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="generator" content="Margin" />
        <Meta />
        <link rel="manifest" href={sitePath("/manifest.webmanifest")} />
        <link rel="apple-touch-icon" href={sitePath("/pwa/icon/180.png")} />
        <link rel="icon" href={sitePath("/favicon.ico")} />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Publication RSS"
          href={sitePath("/rss.xml")}
        />
        <Links />
      </head>
      <body>
        <div id="root">{children}</div>
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}
export function HydrateFallback() {
  return <StartupScreen />;
}
export default function App() {
  return <Outlet />;
}
export const ErrorBoundary = RouteError;
