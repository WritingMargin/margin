import assert from "node:assert/strict";
import test from "node:test";
import { adminEntryDestination, adminUrl, parseAdminRoute, type AdminRoute } from "./admin-route.ts";

test("workspace destinations round-trip through shareable URLs", () => {
  const routes: AdminRoute[] = [
    { view: "posts" },
    { view: "analytics" },
    { view: "settings", settingsTab:"seo", seoProvider:"google" },
    ...(["general", "seo", "pwa", "integrations"] as const).map((settingsTab) => ({
      view: "settings" as const,
      settingsTab,
    })),
    { view: "pricing" },
    ...(["conversations", "guides", "subscribers", "campaigns", "settings"] as const).flatMap(
      (readersTab) =>
        (["pending", "all"] as const).map((filter) => ({
          view: "readers" as const,
          readersTab,
          filter,
        })),
    ),
    ...(["homepage", "article", "guide", "comments", "footer"] as const).map((section) => ({
      view: "designer" as const,
      section,
    })),
    ...(["split", "write", "preview"] as const).flatMap((mode) =>
      ["", "cfd5ceaf-40df-405a-8a38-27d1b443a762"].map((postId) => ({
        view: "editor" as const,
        postId,
        mode,
      })),
    ),
    ...(["pending", "all"] as const).map((filter) => ({
      view: "comments" as const,
      filter,
    })),
    ...(["uploads", "link", "library", "defaults"] as const).map(
      (mediaTab) => ({
        view: "media" as const,
        mediaTab,
      }),
    ),
  ];
  for (const route of routes) {
    const url = new URL(adminUrl(route), "https://blog.example");
    assert.deepEqual(parseAdminRoute(url.pathname, url.search), route);
  }
});

test("root route has a stable default and malformed routes fail safely", () => {
  assert.deepEqual(parseAdminRoute("/admin/"), { view: "posts" });
  assert.deepEqual(parseAdminRoute("/admin/designer"), { view: "not-found" });
  assert.deepEqual(parseAdminRoute("/admin/posts/new", "?mode=bogus"), {
    view: "editor",
    postId: "",
    mode: "split",
  });
  assert.deepEqual(parseAdminRoute("/admin/media", "?tab=bogus"), {
    view: "media",
    mediaTab: "uploads",
  });
  for (const path of [
    "/administrator",
    "/admin/nope",
    "/admin/posts/a/extra",
    "/admin/posts/%ZZ",
    "/admin/designer/unknown",
  ])
    assert.deepEqual(parseAdminRoute(path), { view: "not-found" });
});

test("login entry keeps a valid admin destination and rejects external redirects", () => {
  assert.equal(adminEntryDestination("?next=%2Fadmin%2Fpricing"), adminUrl({ view: "pricing" }));
  for (const next of ["https://evil.test/admin/pricing", "//evil.test/admin/pricing", "/admin/../", "/admin/missing", "/admin/pricing#other"]) {
    assert.equal(adminEntryDestination(`?next=${encodeURIComponent(next)}`), "/admin");
  }
});

test("new guides retain their type through reloads and editor modes", () => {
  for (const contentType of ["guide"] as const) {
    for (const mode of ["split", "write", "preview"] as const) {
      const route: AdminRoute = { view: "editor", postId: "", contentType, mode };
      const url = new URL(adminUrl(route), "https://example.com");
      assert.equal(url.searchParams.get("type"), contentType);
      assert.deepEqual(parseAdminRoute(url.pathname, url.search), route);
    }
  }
  assert.equal(parseAdminRoute("/admin/posts/new", "?type=invalid").contentType, undefined);
  assert.equal(parseAdminRoute("/admin/posts/new", "?type=doc").contentType, undefined);
});
