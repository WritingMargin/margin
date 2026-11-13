# Embedded MCP server

Margin serves a native Model Context Protocol endpoint at **`/mcp`**, in the same process as the blog. A publication mounted at `/blog` uses `/blog/mcp`. No separate MCP process or Fused deployment is required. REST and existing Fused integrations continue to work.

## Connect

Open **Connected apps → Connect an AI client** to copy this publication’s MCP URL. Reviewers find Connected apps in their review workspace. In an OAuth-capable client, add the URL, follow its sign-in prompt, and approve permissions within your publication role. Manage or revoke your own access under **OAuth connections**. The primary owner’s existing Settings integration and manual tokens remain available. See [OAuth client setup](oauth.md) for server requirements and REST client authorization.

For clients using manual API tokens, create one in the **API tokens** tab and configure:

- Transport: **Streamable HTTP**.
- URL: your publication's full base URL followed by `/mcp`, for example `https://example.com/blog/mcp`.
- HTTP header: `Authorization: Bearer YOUR_MARGIN_TOKEN`.

Use HTTPS for remote connections. Local development can use `http://127.0.0.1:3187/mcp`. OAuth-capable clients can discover authorization automatically when `PUBLIC_URL` is configured. Approve the connection in your signed-in publication session; see [OAuth client setup](oauth.md). Clients that support custom headers can continue using an existing Margin API token. Browser session cookies are insufficient. It does not expose the older HTTP+SSE `/sse` transport.

## Peer-review tools

Request OAuth scope `review:assigned` for reviewers. This exposes only the tools
below, using the same identity, current article grants and reference checks as
the browser review flow. General post, search, media-library and preview-link
tools are unavailable. Another publication's or an unassigned article's content
remains inaccessible even when its ID or review link is known.

| Tool | Purpose |
| --- | --- |
| `list_peer_reviews` | List active article invitations approved for this account and connection. |
| `open_peer_review` | Open a listed invitation’s draft, prior reviewed version, notes and approval state. |
| `add_peer_review_note` | Add a passage note using the reviewed revision, exact quote and optional idempotent submission ID. |
| `get_peer_review_note_fix` | Compare only revisions referenced by an addressed note. |
| `approve_peer_review` | Approve the reviewed revision; does not publish or edit the article. |
| `get_peer_review_attachment` | Read a referenced attachment in bounded base64 chunks using its kind and ID; no arbitrary URLs. |

Use the invitation `id` returned by `list_peer_reviews` as `invite`, rather than
the article ID. Removing article access takes effect on the next call. Newly
assigned or regranted articles require fresh consent. MCP tokens remain scoped
to `/mcp`; use the attachment tool rather than sending the token to a file URL.

Reader tokens can discover resources and read posts, revisions, and media libraries. Writers can additionally create/edit drafts and upload media. Publishers can also change live content and publish, unpublish or archive posts. Owner tokens can additionally read and replace publication-wide SEO and customise the blog design. Token revocation and role changes apply on the next request. The tool list reflects the token's current role.

## Authoring resources

Use MCP `resources/list` and `resources/read`:

| URI | MIME type | Contents |
| --- | --- | --- |
| `margin://authoring/guide` | `text/markdown` | Writing syntax, code blocks, media, examples, and revision-aware editing guidance |
| `margin://authoring/blocks` | `application/json` | Supported block schemas, examples, and semantic constraints |
| `margin://design/guide` | `text/markdown` | Customisation workflow, partial JSON edits, hero components and dynamic variables |
| `margin://design/schema` | `application/json` | Complete design schema and defaults generated from the design editor |

The authoring resources contain the same versioned-with-the-engine documentation served at `/authoring.md` and `/authoring-blocks.json`. Both authoring and design references are bundled with the CLI. They do not contain private post content. The initialization instructions direct LLMs to read the resources before authoring. Clients must support reading MCP resources; connection alone does not guarantee the client loads them automatically.

The REST `getAuthoringGuide` operation remains available for generated clients. The native server exposes the guide as a resource, not a tool.

## Tools

| Tool | Purpose |
| --- | --- |
| `list_posts` | Paginated workspace content, with filters |
| `search_posts` | Search workspace content |
| `search_publications` | Find papers by topic, title or author through Crossref |
| `list_research_sources`, `save_research_source` | Read or save sources for the specified draft |
| `list_thinking_notes`, `save_thinking_note` | Read or append private notes for the specified draft |
| `get_post` | Read the current post, working draft, preview link, public link or a saved revision using `view` |
| `create_post` | Create a draft by default |
| `update_post` | Save content/SEO, stage changes, publish, unpublish, archive or discard staged changes using `action` |
| `list_revisions` | List saved versions; read one with `get_post` |
| `list_images`, `list_videos` | Find uploaded media to reuse |
| `upload_image`, `upload_video` | Upload media bytes; images also accept a public URL |
| `get_blog_design` | Read design JSON and its current revision (owner only) |
| `validate_blog_design` | Check partial design changes without saving (owner only) |
| `update_blog_design` | Apply partial design changes with a revision check (owner only) |
| `get_site_seo`, `update_site_seo` | Read/replace publication SEO (owner only) |
| `get_author_profile`, `update_author_profile` | Read or replace the shared public author profile (owner token or OAuth `settings:manage`) |

Read the profile before editing it. Preserve its other fields and set `website` to the author’s HTTPS profile URL. The publication uses it for the visible byline link, article structured data and social metadata.

With Google connected under Blog SEO, call `list_search_console_properties`, then `submit_google_sitemap` with `input.property` or `inspect_google_article` with `input.property` and `input.slug`. These require owner access or OAuth `settings:manage`.

The owner tool set has 29 tools. Post read/write schemas combine the relevant operations from Margin's OpenAPI contract; the available actions reflect the token role or approved OAuth scopes. Path and query parameters are top-level arguments; a JSON request body goes in `input`. Results contain `{ "status": 200, "data": ... }`; failed API operations set MCP `isError` and retain the API status and error code. Schema validation errors also set `isError` and explain the invalid argument.

For example, call `get_post` with `{"id":"POST_ID"}`, then call `update_post` with:

```json
{
  "id": "POST_ID",
  "input": {
    "revision": "REVISION_FROM_GET_POST",
    "edits": [{ "oldText": "https://old.example/link", "newText": "https://new.example/link" }]
  }
}
```

Omitted fields stay unchanged. `edits` applies up to 100 exact text replacements in order. Each `oldText` must match exactly once; missing or ambiguous matches return `409 EDIT_MATCH_CONFLICT` without saving any changes. Include enough surrounding text to make the match unique. `newText` may be empty to delete text. Supply either `edits` or `content`, never both. A supplied `content` replaces the entire body; a supplied `seo` replaces that object. Read first and preserve fields the user wants to keep. On a `409` conflict, reread and reconcile; do not blindly resubmit an old body with the latest revision. The default `action: "save"` preserves the existing immediate-save behavior, including `input.status` transitions. Use the explicit actions below for lifecycle operations.

### Read views and write actions

`get_post` accepts `view: "current"` (default), `"draft"`, `"link"`, `"preview"`, or `"revision"`. Historical reads require a top-level `revision` from `list_revisions`. `fields` selects response fields, except for `view: "link"` and `view: "preview"`, which return their complete objects.

| `update_post.action` | Read first | `input` | Effect |
| --- | --- | --- | --- |
| `save` (default) | `get_post` with `view: "current"` | Current revision and changed fields, including `seo` | Save immediately; edits to published content go live |
| `save_draft` | `get_post` with `view: "draft"` | Working-draft revision and changed fields | Save privately, keeping live content unchanged |
| `publish` | `get_post` with `view: "draft"` | Working-draft revision only | Publish the saved draft |
| `unpublish` | `get_post` with `view: "current"` | Current revision only | Remove public access and retain pending edits as the private draft |
| `archive` | `get_post` with `view: "current"` | Current revision only | Archive the post |
| `discard_draft` | `get_post` with `view: "draft"` | Working-draft revision only | Discard staged edits, preserving the live version and history |

For example, unpublish a published article or guide with:

```json
{
  "id": "POST_ID",
  "action": "unpublish",
  "input": { "revision": "REVIEWED_CURRENT_REVISION" }
}
```

Unpublishing requires publisher/owner or OAuth `content:publish` permission. The last live version remains in revision history. If staged edits exist, they become the ordinary private draft, even when the live base has changed since staging. Nothing is published or deleted. The public URL, feed, search and exports no longer expose the post. The response includes `draftUrl`.

For unpublished updates, use `update_post` with `{"id":"POST_ID","action":"save_draft","input":{"revision":"REVIEWED_DRAFT_REVISION","content":"Updated draft body"}}`. Writers can stage edits to published content. Omitted fields stay unchanged in the working draft. Publish later with `action: "publish"` and only the reviewed draft revision in `input`. Lifecycle actions reject extra input fields so content cannot be silently ignored.

MCP creation and save replies are compact by default: `id`, `title`, `slug`, `status`, `revision`, `updatedAt`, `draftUrl`, `baseRevision`, `publicationState`, and `warnings` where applicable. Request explicit `fields` to return `content` or other fields. REST responses retain their full default shape.

`publicationState` describes current public availability separately from editing `status`: `never_published`, `published`, `unpublished`, or `archived`. A working draft of a live post has editing status `draft` and publication state `published`. Historical reads report the publication state of the current post.

For the visible article cover, set `cover` to an image, audio, or supported video URL. An empty `seo.image` automatically uses an image cover for sharing, then the site default. A dedicated `seo.image` overrides sharing only. Saves warn when a sharing image is supplied without a cover; audio and video covers need separate sharing artwork.

All draft creation and updates return `draftUrl`, such as `https://example.com/blog/draft/post/story`. Open it in a browser signed in as admin to preview the rendered content. The preview follows the intended public slug and includes the publication domain and mount path. API tokens and reader sessions cannot load that admin-session URL.

To preview without an admin login, call `get_post` with `{"id":"POST_ID","view":"preview"}` after saving the draft. The response includes `previewUrl`, `revision`, `expiresAt`, and structural `warnings`. The bearer link opens the normal rendered page and grants access only to the referenced uploads in that draft. Anyone holding the link can view it for 30 minutes. Saving another revision, publishing, discarding the staged draft, archiving, or deleting the post invalidates it. Preview pages are uncached, excluded from indexing, and send no referrer. Keep the link private. The REST equivalent is `GET /api/posts/{id}/preview`.

Warnings identify missing closing tags, malformed Tabs structure, and missing Tab titles. They are advisory and do not certify chart data, Mermaid syntax, external embeds, or visual layout. Open the preview to review those before publication.

The draft tracks its live `baseRevision`. If either version changes, stale saves or publication fail with `409 REVISION_CONFLICT`. Read both versions, preserve the desired edits, discard the old stage with `action: "discard_draft"` using its reviewed revision, and reconcile against the current post. Unpublishing checks the live revision and atomically retains the captured working draft; concurrent edits cause a conflict rather than data loss.

### Migrating older MCP calls

Refresh your client's tool list after updating the server. REST endpoints and CLI commands remain available. The redundant native MCP names have been removed:

| Previous tool | Replacement |
| --- | --- |
| `get_post_draft` | `get_post`, `view: "draft"` |
| `get_post_link` | `get_post`, `view: "link"` |
| `get_revision` | `get_post`, `view: "revision"`, plus `revision` |
| `update_post_draft` | `update_post`, `action: "save_draft"` |
| `publish_post_draft` | `update_post`, `action: "publish"` |
| `discard_post_draft` | `update_post`, `action: "discard_draft"` |
| `update_post_seo` | `update_post`, `action: "save"`, with `input.revision` and `input.seo` |

For images, prefer `upload_image` with `{"input":{"url":"https://example.com/cover.png"}}`. Margin downloads public HTTP(S) images with bounded redirects, time and size, blocking internal destinations. `contentType` is optional for URL imports and checked against the bytes when supplied. Alternatively send base64 bytes in `input.data` with a matching `input.contentType`; `url` and `data` are mutually exclusive.

URL imports report why they failed in the error `code`:

| Code | Status | Meaning |
| --- | --- | --- |
| `IMAGE_URL_BLOCKED` | 400 | The host resolves to a private or internal address |
| `IMAGE_URL_REDIRECT_REFUSED` | 400 | More than 3 redirects, or a redirect to a blocked address |
| `IMAGE_URL_NOT_IMAGE` | 400 | The URL returned a page or other non-image type; the message names it |
| `IMAGE_URL_HTTP_ERROR` | 502 | The site answered with a non-200 status; the message includes it |
| `IMAGE_URL_TIMEOUT` | 502 | The site did not respond in time |
| `IMAGE_URL_UNREACHABLE` | 502 | The host name was not found or the connection failed |
| `IMAGE_TOO_LARGE` | 413 | The image exceeds 10 MiB |

Imports identify themselves as `Margin-ImageImport/1.0`. A site that still refuses (403/429) can be handled by downloading the image and sending it as base64 `data`. Video uploads still accept base64 `data`, `contentType`, and optional `title`.

A remote MCP server cannot read a file on the caller's computer. Local clients can send a file directly through the existing binary REST endpoint, without pasting base64:

```sh
curl --fail-with-body "$MARGIN_URL/api/media/covers" \
  -H "Authorization: Bearer $MARGIN_TOKEN" \
  -H "Content-Type: image/png" \
  --data-binary @/absolute/path/cover.png
```

The decoded limit is **10 MiB** for images and videos over MCP. For videos up to 50 MiB use the binary REST upload. Files already on YouTube, Vimeo, Mux or Cloudinary can be embedded by URL; do not reupload them. Use the guide's image/video syntax and `update_post` to insert an uploaded or existing URL into the body. Uploading alone does not attach media to a post.

The server reuses the existing API handlers, including validation, token permissions, revision checks, media privacy and publication hooks. Saving returns structural warnings but does not validate every rich block's renderability. Follow the resource's schemas and semantic rules, and preview complex content before publication.

## Get a published article link

After publishing, call `get_post` with `{"id":"POST_ID","view":"link"}`. Its result includes:

```json
{
  "status": 200,
  "data": {
    "id": "POST_ID",
    "title": "My article",
    "slug": "my-article",
    "url": "https://example.com/blog/post/my-article"
  }
}
```

The URL uses the current slug, publication domain and mount path. All token roles can use this read-only tool. Drafts and archives return `409` with code `POST_NOT_PUBLISHED`, plus `status` and `publicationState` explaining whether this is a never-published draft, an unpublished post, or an archive; the tool never publishes content. Missing posts return `404`. A link can change if the slug/domain changes or become unavailable if the article is unpublished. The REST equivalent is `getPostLink`, `GET /api/posts/{id}/link`.

## Blog customisation

Read `margin://design/guide` and `margin://design/schema`, then call `get_blog_design`. Homepage, article and guide design objects are independently editable, alongside branding, colours, typography, comments and footer settings. Hero sections support the existing dynamic bindings such as `blog.title`, `content.title` and `content.cover`.

For example, validate a homepage layout change without saving:

```json
{
  "input": {
    "changes": {
      "homepage": { "layout": "grid", "gridColumns": "three" }
    }
  }
}
```

Pass that to `validate_blog_design`, then add `input.revision` from its response and call `update_blog_design` to save when the user wants the change applied. Changes affect the live blog immediately. Validation is not a visual preview; use the existing Customise preview for that.

Nested objects merge, omitted fields stay unchanged, arrays replace entirely, and `null` removes optional overrides. The complete result is checked by the backend validator. Concurrent saves return `409` instead of overwriting newer changes. These tools use the storage/API design format, which differs from the grouped editor export; the resource documents the exact format.

Equivalent owner-only REST routes are `GET /api/settings/design`, `PUT /api/settings/design`, and `POST /api/settings/design/validate`. These calls do not fetch Margin Central's templates; central checks remain tied to visits to the Templates page.

The feed heading and filter bar can be configured independently with
`homepage.feedHeader` and `homepage.feedFilters`: heading text, count arrow,
dividers, spacing, topic display labels, and search placement, placeholder and
maximum width. These apply to built-in layouts and the `post-feed` component.
Existing visibility flags still apply. The designer's grouped JSON uses
`homepage.feed.header` and `homepage.feed.filters`; the MCP/API uses the storage
paths above. See the [feed configuration example](../cli/skills/margin-authoring/references/design.md#feed-heading-and-filters).

## Deployment and implementation

The server uses the [official MCP Go SDK](https://github.com/modelcontextprotocol/go-sdk) with stateless Streamable HTTP and JSON responses. It does not retain MCP sessions or provide background notifications, subscriptions or resumable SSE streams. Reverse proxies must forward the Authorization header and permit the `/mcp` path. The request limit is 15 MiB to accommodate base64 upload framing; decoded media limits are enforced separately. Existing Margin-generated Nginx configurations allow 50 MiB request bodies.

Every HTTP request requires a valid bearer token, and any supplied Origin is checked against Margin's existing origin policy. MCP tool calls are routed in-process through a fixed allowlist of authoring and design API handlers. Tool arguments cannot select arbitrary endpoints or HTTP methods. Token-management and other administrative APIs are not exposed as tools.


### Audit an article

Use `audit_article` with `input.mode: "draft"` and either `input.article` (title, slug, Markdown content, optional SEO, cover and excerpt) or a saved `input.id`. After publishing, use `input.mode: "public"` with the post ID to verify the actual public HTML. Set `input.intent` to `index` or `hidden` to check the intended audience. Omitting it respects an explicitly hidden post. The tool returns a JSON report with actionable errors, warnings, suggestions and unavailable measurements. It never changes an article. The editor’s **Post details → SEO & sharing → SEO checks** and `margin audit article.md --json` use the same endpoint. To verify from the CLI, run `margin audit --id POST_ID --public --json`. Only public HTTP responses are inspected, with no credentials.
