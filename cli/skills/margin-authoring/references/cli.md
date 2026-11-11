# Margin CLI workflow

Read this reference when connecting, reading, saving, or publishing posts. Writing a local article does not require a connection.

Use `margin` from any working directory. The owner connects with `margin login --url BLOG_URL` and explicitly approves the matching code in their signed-in admin. Include any mount path such as `/blog`. `margin whoami` checks owner access (a restricted token can still have permission to read or write posts) and `margin logout` revokes it. Automation can still use `MARGIN_URL` and `MARGIN_TOKEN`; do not put credentials in posts or command output. `margin --help` lists commands and `margin COMMAND --help` explains each one. If the CLI is missing, use the project’s installation instructions. In a Margin source checkout, `go -C cli run ./cmd/build` builds the executable; an installed binary needs no Go runtime. Prefer `--json` for machine-readable results; failures exit nonzero with JSON errors on stderr.

## Find and edit existing writing

- `margin list --json` includes drafts and published posts. `margin find 'phrase' --json` searches titles and slugs, case-insensitively.
- `margin grep 'pattern' --json` searches Markdown using a Go/RE2 regular expression (no lookarounds or backreferences; use `(?i)` for case-insensitive matching). Add `--id POST_ID` to search one post. Each match includes `id`, `slug`, one-based `line`, matching `text`, and `revision`. Text output is `post-id:line-number:matching-text`; no matches yields an empty result, not an error.
- Read context with `margin get POST_ID --lines 3:12 --json`, or get the entire post with `margin get POST_ID --json`. Line ranges are inclusive. Inspect the surrounding text and complete opening/closing tags before replacing a range.
- Write the replacement to a UTF-8 file, then run `margin update POST_ID --lines 3:12 --file replacement.md --revision REVISION_FROM_GET --json`. Use the actual ID and revision from the read. The file replaces precisely those lines; it is not a whole-document upload. Empty replacement deletes the selected lines. For insertion, include the existing boundary line plus the new content. An empty document cannot be edited with a line range.
- `--revision` is mandatory for update, publish, unpublish, and delete. Use the revision from your reviewed read; never fetch a new token merely to force a stale edit through.
- For a whole-document replacement, use `margin push POST_ID --file article.md --revision REVISION_FROM_GET --json`. It preserves publication status and fails on stale revisions. For a new draft, use `margin push --title TITLE --slug SLUG --file article.md --json`; add `--publish` only when publication is authorized.
- To prepare unpublished changes to a live post, read `margin get POST_ID --draft --json`, then save with `margin push POST_ID --draft --file article.md --revision DRAFT_REVISION --json` or `margin update POST_ID --draft --lines START:END --text TEXT --revision DRAFT_REVISION --json`. These commands leave the public version unchanged. Use `margin publish POST_ID --draft --revision DRAFT_REVISION --json` only when publication is requested.
- Draft creation and updates return `draftUrl` at the publication's `/draft/post/SLUG` path. Open it in an admin browser session to review the rendered draft. Bearer tokens cannot open preview pages. A staged draft reserves its intended slug.
- If the live post changes after staging, read both versions, preserve the intended edits, and discard the old stage with `margin discard-draft POST_ID --revision DRAFT_REVISION --json` before reconciling against the new live revision. Discarding keeps the live content and history.
- On `REVISION_CONFLICT`, reread and reconcile the latest content. Do not blindly retry the same range or remove the revision guard. Updating an already published post changes its public content immediately; match the user's authorized editing scope.

## Create a post

Write Markdown to a local file. Choose a descriptive title and a lowercase, hyphenated slug; inspect existing posts when avoiding duplicates matters. The title is stored separately from the body, so a second identical H1 is usually unnecessary.

```sh
margin create --title 'Field notes' --slug field-notes --file notes.md --json
```

Creation defaults to a draft. Record the returned `id`, `revision`, and `status`; the editable URL is `MARGIN_URL/admin/posts/ID`. Use `--file -` to stream standard input. Files or stdin avoid shell interpolation of Markdown code, dollar signs, and backticks. If a creation request times out, check `find` or `list` before retrying so a successful request is not duplicated.

For typography, diagrams, charts, 3D scenes, media, layouts, and tabs, read [content.md](content.md). It contains supported tag syntax and complete examples. Do not invent arbitrary HTML, CSS, JavaScript, font names, or tag properties. Choose a rich block only when it helps the reader understand the content. Existing fenced rich blocks remain supported.

## Publish when requested

When the user has asked to publish, review the current draft and use its revision:

```sh
margin get POST_ID --json
margin publish POST_ID --revision REVISION_FROM_GET --json
```

Confirm the response has `status: "published"`. The reader URL is `MARGIN_URL/post/SLUG`. A request to draft alone does not authorize publishing. For explicitly requested immediate publication during creation, use `create ... --publish`; do not add it by default. `margin unpublish POST_ID --revision REVISION_FROM_GET --json` returns a post to draft when requested, using its current live revision from `get` (without `--draft`). Pending staged edits become the private draft, the last live version stays in revision history, and the response includes `draftUrl`. Publishing does not send a newsletter campaign.

Do not delete a post as a substitute for editing or unpublishing. Permanent deletion is a separate command requiring `delete POST_ID --yes --revision REVISION_FROM_GET` and the user's deletion request.
