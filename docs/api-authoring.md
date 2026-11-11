# API authoring for MCP clients

Margin also includes a [native MCP server at `/mcp`](mcp.md). Its authoring guide is the `margin://authoring/guide` resource, and schemas/examples are `margin://authoring/blocks`. The REST operation names below apply to generated clients such as Fused; native MCP uses the tool names documented in that guide.

Margin exposes its OpenAPI 3.0 contract at `/openapi.json` and interactive documentation at `/swagger/`. Use the complete publication base URL, including any mount path such as `/blog`, and authenticate with `Authorization: Bearer YOUR_TOKEN`. Existing Fused MCP deployments must refresh their service specification and selected operations to use new endpoints; Margin does not change those deployments automatically.

## Learn the supported block syntax first

Call **`getAuthoringGuide`** (`GET /api/public/authoring`) before generating rich content. It returns this engine's authoring reference, supported code languages and tags, four interactive block examples, JSON Schemas generated from the real renderer validators, and semantic rules that JSON Schema cannot express. This operation is public and read-only; it exposes no post content or credentials.

The same guide is available at `/authoring.md`, with the schema/example catalog at `/authoring-blocks.json`. `/llms.txt` and OpenAPI link to them. All URLs use the publication's mount path. The CLI bundles the same reference offline: `margin skills show margin-authoring --json` includes `references/content.md` and `references/blocks.json`.

For an MCP author, include this instruction in its task or tool guidance: “Before writing Margin rich content, call getAuthoringGuide. Use only its supported syntax, apply both schemas and semantic rules, and preserve the existing body and current revision when editing.” A successful save does not validate every block; preview complex content before publication. Refresh Fused's service specification and select `getAuthoringGuide` to make this available to the MCP server.

## Read and update content

Use `readPost` (`GET /api/posts/{id}`) to read the current `content`, `seo`, `cover`, and `revision`. `updatePost` (`PUT /api/posts/{id}`) accepts only the fields you want to change plus the latest revision:

```json
{
  "revision": "LATEST_REVISION_FROM_READ_POST",
  "content": "## Introduction\n\nUpdated article text."
}
```

This works for articles and guides. Omitted top-level fields are preserved. Supplied `content` replaces the entire Markdown document: preserve the rest of the article when inserting an image or editing a section. Use the revision returned by each successful update for the next edit. A missing revision returns `428`; a stale one returns `409`. On conflict, read the latest version and reconcile the intended edit before retrying.

A writer token can create and edit drafts only. A publisher or owner token can also edit published or archived content and change publication status. Editing a published post changes the live article immediately; uploading an image alone does not.

## Draft previews and unpublished changes

Draft creation and updates return `draftUrl`, an absolute URL such as `https://example.com/blog/draft/post/my-story`. It uses the intended public slug, configured publication domain and mount path, with `/draft` inserted before `/post`. Only an authenticated admin **browser session** can open the preview; bearer tokens and reader sessions cannot. Preview pages use `no-store` and `noindex, nofollow` and never appear in public feeds, search or exports.

To prepare changes to a published article or guide without changing its live version:

1. `readPostDraft` — `GET /api/posts/{id}/draft` returns the saved working draft, or the current post as a starting point. It includes `baseRevision` for staged edits to published content. Reading alone creates no draft.
2. `updatePostDraft` — `PUT /api/posts/{id}/draft` takes the reviewed `revision` and fields to change, using the same shape as `updatePost`. Omitted fields are preserved from the working draft. Status must be omitted or `draft`. Writers, publishers and owners may save; OAuth requires `content:draft`. The response includes a fresh revision and `draftUrl`.
3. `publishPostDraft` — `POST /api/posts/{id}/draft/publish` takes `{"revision":"REVIEWED_DRAFT_REVISION"}` and atomically publishes the saved body and metadata. Requires publisher/owner or OAuth `content:publish`. The staged draft is removed only after successful publication.

The live post remains unchanged until step 3, including its slug, SEO, timestamps, feed entries and public media access. Draft saves reserve their intended slug. Stale draft revisions or changes to the live base return `409 REVISION_CONFLICT`, preserving both versions. Review both, preserve the intended edits, then call `discardPostDraft` (`DELETE /api/posts/{id}/draft` with the reviewed draft revision) and reconcile against the current live version. Discarding leaves the live post and revision history intact. To unpublish, call `updatePost` with the current live `revision` and `status: "draft"`. Pending staged edits become the private draft; the last live version and previous drafts remain in revision history. Any explicitly supplied fields override the staged values. Concurrent live or draft changes fail safely. Archived posts must be restored before staging.

The draft read/save/publish endpoints also support ordinary unpublished drafts. Discard applies only to staged changes; deleting an ordinary draft uses `deletePost`.

## Upload an image, then insert it

Call `uploadImage` (`POST /api/media/images`) with `Content-Type: application/json`:

```json
{
  "contentType": "image/png",
  "data": "BASE64_ENCODED_IMAGE_BYTES"
}
```

`data` is standard base64, without a `data:image/...;base64,` prefix. Supported types are `image/png`, `image/jpeg`, `image/webp`, and `image/gif`. The declared type must match the file. The decoded file limit is 10 MiB; the encoded string limit is 13,981,016 characters, with an additional 1 KiB allowed for JSON framing. Invalid input returns `400`; excessive size returns `413`. Writers, publishers and owners can upload; reader tokens cannot.

The response is `201`:

```json
{
  "url": "/api/public/covers/00000000-0000-4000-8000-000000000000"
}
```

Keep the actual returned URL unchanged in saved content. Read the post, insert an image with descriptive alt text into the existing Markdown, then call `updatePost`:

```json
{
  "revision": "LATEST_REVISION_FROM_READ_POST",
  "content": "Existing introduction.\n\n![Diagram of the request flow](/api/public/covers/ACTUAL_UPLOAD_ID)\n\nExisting remainder of the article."
}
```

To use it as a cover instead, send `{"revision":"LATEST_REVISION","cover":"RETURNED_URL"}`. To use it for search/social sharing, set `seo.image` as described below. These actions are separate from uploading; an unsuccessful post edit does not attach the upload. Reuse the uploaded URL when retrying a reconciled edit instead of uploading again.

Unused images and images referenced only by drafts or archives require authentication. An image becomes publicly readable when referenced in a published post's body, cover or SEO image, or in publication-wide SEO. When fetching an image directly from a mounted blog, prepend the mount path to the canonical URL (for example `/blog/api/public/covers/...`). The article renderer handles this automatically for saved Markdown and cover fields.

Clients that can send bytes may use `uploadImageBinary` (`POST /api/media/covers`) with the raw file as the request body and its matching image `Content-Type`. It has the same 10 MiB limit, role requirements, privacy rules, and URL response. It is not a multipart upload.

## Find and reuse uploaded media

`listImages` (`GET /api/media/images?source=uploads`) returns uploaded and generated images. `listVideos` (`GET /api/media/videos`) returns videos stored directly in Margin, newest first. Reader, writer, publisher and owner tokens can use both libraries. Unauthenticated requests return `401`.

Both return `{"resources":[...]}`. Each asset has `public_id`, `secure_url`, and `resource_type` (`image` or `video`). Generated images include a title; native videos include `title`, `contentType`, `sizeBytes`, and `createdAt`. Use the returned `secure_url` in an image or video block without uploading again. Lists include private draft assets; knowing the URL does not make them public.

The existing Cloudinary library remains separate at `GET /api/media` (owner access). It returns up to 100 images and 100 videos from Cloudinary. `listImages?source=cloudinary` adds up to 100 Cloudinary images to the local image list and requires an active integration and configured credentials. Direct Margin uploads need neither.

YouTube, Vimeo, Mux and Cloudinary video links continue to work in `[Video src="..."]` blocks and through **From a link** in the editor. They do not need to be uploaded to Margin; direct storage is an additional source. Mux HLS URLs continue to use the streaming player.

## Upload and insert a video

`uploadVideo` (`POST /api/media/videos`) stores MP4 and WebM files in Margin's configured storage. For JSON-only MCP tools:

```json
{
  "contentType": "video/mp4",
  "data": "BASE64_ENCODED_VIDEO_BYTES",
  "title": "A walkthrough"
}
```

Use `Content-Type: application/json`. The decoded limit is **10 MiB**; standard base64 without a data-URL prefix is required. The encoded string limit is 13,981,016 characters, with 2 KiB allowed for JSON framing and title. `title` is optional and at most 200 characters. For larger files, send raw bytes with `Content-Type: video/mp4` or `video/webm`, up to **50 MiB**. Binary uploads accept an optional `?title=...` query parameter. This endpoint does not accept multipart bodies or fetch remote URLs.

The `201` response includes `url`, `id`, `contentType`, `title`, and `sizeBytes`. Use the returned canonical URL in the existing Markdown and save with the latest post revision:

```json
{
  "revision": "LATEST_REVISION_FROM_READ_POST",
  "content": "Existing introduction.\n\n[Video src=\"/api/public/videos/ACTUAL_UPLOAD_ID\" title=\"A walkthrough\"]\n\nExisting remainder."
}
```

Writers, publishers and owners can upload. Unused videos and videos referenced only in drafts or archives require authentication. A video becomes public when referenced in current published content; unpublishing removes anonymous access unless another published post still references it. Video delivery supports `HEAD` and HTTP byte ranges (`206`, or `416` for an unsatisfiable range) for seeking. Canonical URLs also work for blogs mounted under a path: prepend that path only when fetching directly, never in saved content.

Files are checked for a matching MP4/WebM container signature and stored unchanged. Margin does not transcode or generate adaptive streams; playback depends on browser support for the codecs in the file. For broad compatibility, export MP4 with H.264/AAC or WebM with VP8/VP9 and Opus. The editor's **Media → Uploads → Videos** tab also uploads, previews and inserts these files.

Generated Nginx configs now allow 50 MiB request bodies. Existing deployments must update `client_max_body_size` to `50m` (or regenerate their config) for full-size binary video uploads. The Go API still applies the smaller route-specific image and JSON limits.

## Update per-post SEO

Use `updatePost`; no content field is necessary for an SEO-only edit:

```json
{
  "revision": "LATEST_REVISION_FROM_READ_POST",
  "seo": {
    "title": "A title for search and social previews",
    "description": "A concise search description.",
    "image": "/api/public/covers/ACTUAL_UPLOAD_ID",
    "noindex": false,
    "nofollow": false
  }
}
```

A supplied `seo` object replaces the previous object. Always include `title` (up to 120 characters), `description` (up to 320), and `image` (up to 2048). Preserve existing `noindex` and `nofollow` overrides when they should remain; omitting them removes those overrides. Read `seo` first when changing only one nested field.

An empty title or description uses the normal article fallback. An empty image uses the post cover, then the publication sharing image. For a post, use an uploaded cover URL, a generated Margin image URL (`/api/assets/ID.png`), or a public HTTPS image URL without credentials. Clear the override to follow future cover changes automatically. The same writer/publisher permissions and revision guards apply to SEO edits as to content edits.

## Update publication-wide SEO

Owner tokens can call `getSiteSEO` (`GET /api/settings/seo`) and `updateSiteSEO` (`PUT /api/settings/seo`). Read before editing, preserve unchanged values, and send the complete object:

```json
{
  "title": "Publication search title",
  "description": "What this publication is about.",
  "image": "",
  "indexing": true,
  "googleVerification": ""
}
```

All five fields are required. Empty title and description use publication defaults. Empty image clears the sharing-image override. `indexing: false` disables search indexing. `googleVerification` accepts the verification token only (up to 256 letters, digits, underscores or hyphens); saving it does not complete Google's verification process. Site-wide SEO uses replacement semantics and has no post revision field.

## Suggested MCP operation selection

Select `getAuthoringGuide` to learn content syntax, `posts` or `workspacePostsPage` to find content, `readPost` to retrieve it, `updatePost` to edit it, and `listImages` / `listVideos` to reuse media. Select `uploadImage` and `uploadVideo` for JSON uploads. Add `createPost` when new content is needed. Add `getSiteSEO` and `updateSiteSEO` only for a connection intended to manage publication-wide SEO with an owner token. Choose `uploadImageBinary` instead of `uploadImage` if the client supports raw binary HTTP bodies.

The generated specification describes required fields, response types, examples, allowed token roles, and revision errors. It contains no credentials; provide the selected connection's token through the MCP service's authentication configuration.

## Blog customisation

Owner tokens can use `getBlogDesign` (`GET /api/settings/design`) to read design JSON and its revision. `validateBlogDesign` (`POST /api/settings/design/validate`) accepts `{"changes":{...}}` and returns a validated candidate without saving. `updateBlogDesign` (`PUT /api/settings/design`) accepts `{"revision":"CURRENT_REVISION","changes":{...}}` and atomically applies the partial edit. Nested objects merge, arrays replace, and null removes optional overrides; untouched homepage/article/guide settings stay unchanged. Invalid configurations return 400, missing revisions 428, and conflicting saves 409. Saves affect the live blog. See [MCP customisation and design resources](mcp.md#blog-customisation) for the matching native tools and JSON format. These routes do not refresh central templates.

## Get the published article URL

Call `getPostLink` (`GET /api/posts/{id}/link`) after publishing. All API token roles can read it. It returns `{id,title,slug,url}`, with the absolute canonical URL using the current publication domain, mount path and slug. Drafts and archives return `409 POST_NOT_PUBLISHED` without a URL; unknown posts return `404`. The native MCP equivalent is `get_post` with `{"id":"POST_ID","view":"link"}`. No publication state is changed.
