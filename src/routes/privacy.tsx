import { useLoaderData, type ClientLoaderFunctionArgs, type MetaFunction } from "react-router";
import { BlogFrame } from "../blog/BlogFrame";
import { sitePath } from "../base-path";
import type { PublicTheme } from "../../shared/frontend";

export async function clientLoader({ request }: ClientLoaderFunctionArgs) {
  const response = await fetch(new URL(sitePath("/api/public/settings"), request.url), {
    credentials: "same-origin",
    signal: request.signal,
  });
  if (!response.ok) throw new Response("Publication unavailable", { status: response.status });
  return { theme: await response.json() as PublicTheme };
}

export const meta: MetaFunction<typeof clientLoader> = ({ data }) => data ? [
  { title: `Privacy — ${data.theme.name}` },
  { name: "description", content: `How ${data.theme.name} uses Margin's built-in analytics and reader features.` },
] : [];

export default function PrivacyPage() {
  const { theme } = useLoaderData<typeof clientLoader>();
  return <BlogFrame theme={theme} pwa={theme.pwa} section="article">
    <main className="publication-privacy">
      <a className="back-link" href={sitePath("/")}>Back to {theme.name}</a>
      <p className="eyebrow">READER PRIVACY</p>
      <h1>Privacy</h1>
      <p>This publication is run by its owner. This page explains how Margin’s built-in reader features handle information. The owner is responsible for disclosing any additional services they use.</p>

      <section>
        <h2>Readership analytics</h2>
        <p>Margin counts page views and reading activity without tracking cookies. If country lookup is enabled, your IP address is used briefly to find your country. Analytics records the country, not your IP address. If country lookup is not enabled or no country can be found, the location is recorded as unknown.</p>
        <p>Margin uses a random, temporary browser-tab identifier to estimate reading sessions. It respects Do Not Track and Global Privacy Control, excludes known bots and signed-in owner visits, and removes visits older than 90 days when new traffic arrives.</p>
      </section>

      <section>
        <h2>Information you choose to share</h2>
        <p>If you sign in, leave a comment or note, vote, or subscribe to a newsletter, this publication stores the information needed for that feature. Public contributions may be visible to other readers according to the publication’s moderation settings. Private notes are visible only to the reader who saved them.</p>
      </section>

      <section>
        <h2>Other services</h2>
        <p>Your IP address may be used temporarily for request rate limits and sent to a configured CAPTCHA provider when you submit a protected form. The publication’s host, reverse proxy, and any embedded media or other services may process information under their own policies. Contact this publication’s owner through the contact details they provide for questions about their use of those services.</p>
      </section>
    </main>
  </BlogFrame>;
}

export { RouteError as ErrorBoundary } from "./error";
