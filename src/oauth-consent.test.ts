import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConsentSignInRequired, consentSignInUrl, loadOAuthConsent, selectConsentPermission } from "./auth/oauth-consent";

test("consent data is private and sign-in return stays on the publication", async context => {
  context.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/oauth/authorize?client_id=test");
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.cache, "no-store");
    assert.deepEqual(init.headers, { Accept: "application/json" });
    return Response.json({ error: "Sign in", loginUrl: "https://untrusted.invalid" }, { status: 401 });
  });
  await assert.rejects(loadOAuthConsent("?client_id=test", new AbortController().signal), ConsentSignInRequired);
  assert.equal(consentSignInUrl("?client_id=test&redirect_uri=https://client.test/callback"), "/admin?oauthAuthorize=client_id%3Dtest%26redirect_uri%3Dhttps%3A%2F%2Fclient.test%2Fcallback");
});
test("permissions can be deselected without introducing extra scopes", () => {
  assert.deepEqual(selectConsentPermission(["review:assigned"], "review:assigned", false), []);
  assert.deepEqual(selectConsentPermission(["review:assigned"], "review:assigned", true), ["review:assigned"]);
});
test("consent renders shared Margin form conventions and only offered permissions", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".oauth-consent-test-"));
  try {
    const outfile = path.join(dir, "renderer.mjs");
    await build({ stdin: { contents: 'export { OAuthConsentForm, ConsentActions } from "./src/auth/OAuthConsent";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", packages: "external", outfile, jsx: "automatic", loader: { ".css": "empty", ".svg": "dataurl" } });
    const { OAuthConsentForm, ConsentActions } = await import(pathToFileURL(outfile).href);
    const html = renderToStaticMarkup(createElement(OAuthConsentForm, { data: {
      client: { name: "App <script>alert(1)</script>" }, member: { email: "reviewer@example.test" }, action: "/blog/oauth/consent", resource: "https://publication.test/blog/mcp", redirectUri: "https://client.test/callback", fields: { csrf: "signed&value", expires: "123" },
      permissions: [{ scope: "review:assigned", name: "Review assigned articles", description: "Assigned articles only" }],
    } }));
    assert.match(html, /class="settings-card"/);
    assert.match(html, /class="settings-check"/);
    assert.match(html, /class="button primary"/);
    assert.match(html, /action="\/blog\/oauth\/consent" method="post"/);
    assert.match(html, /name="csrf" value="signed&amp;value"/);
    assert.match(html, /name="permission" checked="" value="review:assigned"/);
    assert.doesNotMatch(html, /value="content:read"|<script>/);
    assert.match(html, /App &lt;script&gt;/);
    const empty = renderToStaticMarkup(createElement(ConsentActions, { selectedCount: 0, busy: "" }));
    assert.match(empty, /value="allow" disabled=""/);
    assert.doesNotMatch(empty, /value="deny" disabled/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
