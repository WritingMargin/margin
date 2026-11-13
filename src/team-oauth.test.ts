import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { teamRoles, canOpenWorkspaceView } from "../shared/team";
import { adminUrl, parseAdminRoute } from "./admin-route";
import { signedInEntry } from "./auth/workspace-entry";
import { loadOAuthSettings } from "./admin/oauth-connections";

test("OAuth authorization resumes for every role before reviewer routing, retaining CLI routing", () => {
  const query = "client_id=test&scope=review%3Aassigned&state=opaque";
  for (const role of teamRoles) {
    assert.deepEqual(signedInEntry(`?oauthAuthorize=${encodeURIComponent(query)}&cliCode=other`, role), { kind: "oauth", query });
    assert.equal(canOpenWorkspaceView(role, "connections"), true);
  }
  assert.deepEqual(signedInEntry("?cliCode=secret", "peer_reviewer"), { kind: "reviews" });
  assert.deepEqual(signedInEntry("?cliCode=secret", "writer"), { kind: "cli", code: "secret" });
  assert.deepEqual(parseAdminRoute(adminUrl({ view: "connections" })), { view: "connections" });
  assert.equal(canOpenWorkspaceView("writer", "settings"), false);
  assert.equal(canOpenWorkspaceView("peer_reviewer", "settings"), false);
});

test("personal connections never request primary-owner client administration", async context => {
  const requests: string[] = [];
  const app = { id: "mine", name: "My client", role: "peer_reviewer", permissions: ["review:assigned"], grantedAt: "2026-11-12" };
  context.mock.method(globalThis, "fetch", async (url: string) => {
    requests.push(url);
    return Response.json(url.endsWith("/clients") ? [{ id: "registered" }] : [app]);
  });
  const result = await loadOAuthSettings(false);
  assert.deepEqual(requests, ["/api/oauth/connections"]);
  assert.deepEqual(result, { connections: [app], clients: [] });
  requests.length = 0;
  await loadOAuthSettings(true);
  assert.deepEqual(requests.sort(), ["/api/oauth/clients", "/api/oauth/connections"]);
});

test("teammate MCP setup shows OAuth without manual token creation", async context => {
  const dir = await mkdtemp(path.join(process.cwd(), ".team-oauth-test-"));
  const previous = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "https://publication.test" } });
  context.after(() => { if (previous) Object.defineProperty(globalThis, "location", previous); else Reflect.deleteProperty(globalThis, "location"); });
  try {
    const outfile = path.join(dir, "renderer.mjs");
    await build({ stdin: { contents: 'export { default as MCPSetup } from "./src/admin/MCPSetup";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", packages: "external", outfile, jsx: "automatic", loader: { ".css": "empty" } });
    const { MCPSetup } = await import(pathToFileURL(outfile).href);
    const html = renderToStaticMarkup(createElement(MCPSetup, {}));
    assert.match(html, /https:\/\/publication.test\/mcp/);
    assert.match(html, /Sign in with your Margin account/);
    assert.match(html, /review:assigned/);
    assert.match(html, /Review assigned articles/);
    assert.match(html, /only the articles assigned to you at approval/);
    assert.doesNotMatch(html, /Manage API tokens|YOUR_API_TOKEN|OAuth or API token/);
    const owner = renderToStaticMarkup(createElement(MCPSetup, { openTokens: () => {} }));
    assert.match(owner, /Manage API tokens/);
    assert.match(owner, /YOUR_API_TOKEN/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
