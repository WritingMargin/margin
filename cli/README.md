# Margin CLI

A native Go `margin` command for searching, creating, editing, and publishing posts on your Margin blog. Skills and their references are embedded in the executable. Running it requires no Node.js, npm, Go, or blog-server installation.

Download a `margin-cli_VERSION_OS_ARCH` archive from [GitHub Releases](https://github.com/WritingMargin/margin/releases/latest) and extract it:

- macOS: `darwin_arm64` for Apple silicon, `darwin_amd64` for Intel.
- Linux: `linux_amd64` or `linux_arm64`, matching your computer.

Run these commands from the extracted folder:

```sh
mkdir -p "$HOME/.local/bin"
install -m 755 ./margin "$HOME/.local/bin/margin"
export PATH="$HOME/.local/bin:$PATH"
```

Add the `export PATH` line to your shell profile to keep it for future terminals. Run `margin --help` to check installation.

The full blog-server binary includes the same CLI implementation, so `margin list`, `margin publish`, `margin skills`, and `margin deploy` also work there.

Connect using the admin account already signed in to your browser:

```sh
margin login --url https://usefused.com/blog
margin whoami
```

The CLI opens an approval page. Compare the code with your terminal and click **Approve connection**. If you are signed out, sign in first. Approval grants owner access, including private drafts and publishing. The CLI saves its own revocable credential; it never copies the browser session or asks for your password. Use `--no-browser` on a remote server, then open the printed link in your own browser. Codes expire after ten minutes.

Credentials are stored in `margin/credentials.json` under your operating system's user configuration directory with file mode `0600`. `MARGIN_CONFIG_DIR` can select a different directory. `margin logout` revokes the saved credential and removes it locally; you can also revoke connections in **Settings → Integrations**. Each login creates a separate connection, so revoke older connections there when replacing them.

For automation, `MARGIN_URL` and `MARGIN_TOKEN` can still specify a blog URL and an API token from Settings. The CLI also reads these from `.env` in the current working directory; exported environment values take precedence. Nonempty values override the saved login, and `--url` overrides `MARGIN_URL`. Saved credentials are only used for the exact blog URL they were approved for, including its mount path. Use HTTPS for remote blogs and keep tokens out of Markdown, logs, and source control.

Choose Reader for reading posts, Writer for drafting and image and video uploads, Publisher for publishing/archiving/deleting and image and video uploads, or Owner for all APIs, including publication-wide SEO. New manual tokens default to Reader; existing tokens keep their roles until changed in Settings. See the [REST API guide](../README.md#use-the-rest-api) for status filters, field selection, and token roles.

```sh
margin --help
margin push --help
margin list --json
margin audit article.md --json
margin audit --id POST_ID --public --json
margin grep 'TODO|FIXME' --json
margin get POST_ID --lines 5:12 --json
margin create --title 'Field notes' --slug field-notes --file notes.md --json
margin create --title 'Getting started' --slug getting-started --file guide.md --content-type guide --json
margin publish POST_ID --revision REVISION_FROM_GET --json
margin unpublish POST_ID --revision REVISION_FROM_GET --json
margin update POST_ID --lines 5:8 --file replacement.md --revision REVISION_FROM_GET --json
```

The audit uses the connected publication’s settings. File mode checks a draft before publication. Public mode fetches the saved article’s canonical URL and compares the delivered HTML with the editor settings. Each finding includes its severity, affected field or URL, reason, and suggested fix. Use `--intent hidden` for a deliberately unindexed article or `--intent index` to check that an article intended for discovery is visible.

To upload a whole Markdown file:

```sh
# Create a draft; add --publish only when ready to make it public.
margin push --title 'Field notes' --slug field-notes --file notes.md
# Read the current revision before replacing an existing article.
margin get POST_ID --json
margin push POST_ID --file notes.md --revision REVISION_FROM_GET
```

`create`, `push`, and `update` accept `--content-type article|guide`. New content defaults to `article`; updates preserve the existing type when the flag is omitted. `get --json` and `list --json` include the content type.

To prepare changes to an already published post while keeping the live version available:

```sh
margin get POST_ID --draft --json
margin push POST_ID --draft --file notes.md --revision REVISION_FROM_DRAFT_GET --json
# Or edit selected lines:
margin update POST_ID --draft --lines 3:7 --text 'Revised section' --revision DRAFT_REVISION --json
# Publish only after reviewing the saved draft:
margin publish POST_ID --draft --revision LATEST_DRAFT_REVISION --json
```

Every draft creation or update returns `draftUrl`, for example `https://example.com/blog/draft/post/notes`. It uses the intended public URL with `/draft` before `/post`, including the publication domain and mount path. Open it in a browser signed in as the admin; API tokens and reader sessions do not grant preview-page access. Draft previews are excluded from indexing and caching.

`get --draft` reads staged changes, or the current post if no staged draft exists. Draft saves preserve omitted fields and return a new revision. `--draft` and `--publish` cannot be combined on `push`. If the live version changes while a draft is being prepared, saving or publishing fails with `REVISION_CONFLICT`. Read both versions and preserve any edits you need, then use `margin discard-draft POST_ID --revision DRAFT_REVISION --json` and reconcile against the current live post. Discarding preserves the live version and revision history. To unpublish, use `margin unpublish POST_ID --revision CURRENT_LIVE_REVISION --json`. Pending edits become the private draft and the last live version remains in revision history; no discard is needed. The response includes the admin preview URL.

An existing post keeps its publication status. Replacing a published post changes its live content. `push` never guesses an existing post from its slug and requires an explicit ID and reviewed revision for updates. Every command supports `--help` / `-h`, and `margin help COMMAND` shows the same guidance without connecting to a server. `login --json` emits a pending JSON object followed by a connected object so automation can present the approval link.

`grep` uses Go/RE2 syntax: lookarounds and backreferences are unsupported; `(?i)` enables case-insensitive matches. `grep` returns `post-id:line-number:matching-text` in text mode. Its JSON matches include `id`, `slug`, `line`, `text`, and `revision`. Line numbers are one-based and ranges inclusive. Use `--file -` for standard input. Creation defaults to a draft; `create --publish` publishes immediately. `publish` publishes an existing draft. `update`, `publish`, `unpublish`, and `delete` require `--revision` from the read you reviewed. Missing revisions fail with `REVISION_REQUIRED` before contacting the server. Conflicting revisions fail without automatic retries. Publishing changes website visibility; it does not send a newsletter campaign.

Agent skills work offline and need no API token:

```sh
margin skills list
margin skills show engineering-writing
margin skills show margin-authoring
margin skills install engineering-writing
margin skills install margin-authoring
# Or choose your agent's personal skill directory:
margin skills install engineering-writing --dir ~/.codex/skills
margin skills install margin-authoring --dir ~/.codex/skills
```

Choose either skill independently, or install both for engineering articles in Margin:

- **engineering-writing** teaches evidence-based technical writing: reader intent, causal explanations, reproducible examples, tradeoffs, and substantive editing. It works with any publishing destination.
- **margin-authoring** applies editorial judgment to Margin citations, code, diagrams, charts, and layouts, with references for content syntax and revision-safe CLI operations.

Installation defaults to `.agents/skills` in the current working directory; use `--dir DIRECTORY` to choose another location. It copies the selected skill, references, and helper scripts into a subdirectory named after the skill, such as `.agents/skills/engineering-writing/SKILL.md`. Existing files are never overwritten. Agents can read a skill directly with `margin skills show NAME --json`; bundled references and helper sources are included in the JSON `references` and `scripts` objects because embedded files have no runtime filesystem path. Skills without either resource return empty objects. JSON errors go to stderr, and failures exit with status 1.

The Margin skill also bundles `references/blocks.json`: generated chart, scene, illustration and poll schemas, Mermaid constraints, and examples from the editor. The engine serves the same reference at `/authoring.md` and through the `getAuthoringGuide` API operation. Read the connected engine’s reference when its version differs from an older installed CLI.

The Margin skill includes a local diagram-preview workflow. Its optional `scripts/preview-diagrams.mjs` helper requires Node.js, a Margin source checkout with npm dependencies, Playwright, and Chromium. It captures desktop/mobile diagrams through the actual renderer without publishing or using account credentials. Run the installed helper with `--help`, and follow `references/preview.md` to inspect and repair the output. Installing or reading the skill still needs no runtime other than the native CLI.


## Generate engine deployment configs

Generate an Nginx site or Apache 2.4 virtual host offline, without an API token:

```sh
margin deploy nginx --domain blog.example.com --output margin.nginx.conf
margin deploy apache --domain blog.example.com --output margin.apache.conf
margin deploy --help
```

Omit `--output` (or use `--output -`) to print the config. Existing output files are never overwritten. `--json` returns `server`, `domain`, `upstream`, `tls`, `config`, and `path` when a file was written. The CLI generates configuration only; it does not obtain certificates, install files, enable modules, or reload servers.

HTTPS is the default, with a port 80 redirect that preserves the request method. The generated config expects existing certificates at `/etc/letsencrypt/live/DOMAIN/fullchain.pem` and `/etc/letsencrypt/live/DOMAIN/privkey.pem`. Override both paths when using another certificate location:

```sh
margin deploy nginx --domain blog.example.com \
  --tls-cert /etc/ssl/blog/fullchain.pem --tls-key /etc/ssl/blog/privkey.pem
margin deploy apache --domain blog.example.com --upstream http://127.0.0.1:4000
margin deploy nginx --domain localhost --http-only
```

`--upstream` defaults to `http://127.0.0.1:3001` and accepts an HTTP origin with an explicit port, including IPv6 such as `http://[::1]:3001`. Paths, credentials and query strings are rejected. By default, serve the engine at the root of its own hostname. For a mounted Nginx or Apache deployment use `--base-path /blog`; run the engine with `MARGIN_BASE_PATH=/blog` (no rebuild required). This generates a snippet for the existing Nginx server block or Apache virtual host, reuses its TLS configuration, and preserves the URI prefix. See [the complete /blog deployment guide](../docs/deploy-usefused-blog.md). Certificate paths are absolute paths on the deployment server; they need not exist on the computer generating the config.

For a proxy in the same Docker network, use the engine service name (for example `--upstream http://engine:3001`) and keep the engine port private. The default loopback upstream is for a proxy running on the engine host. HTTP-only output is for bootstrap or local development; production login uses secure cookies and requires HTTPS.

Set `PUBLIC_URL=https://blog.example.com`, `TRUST_PROXY=1`, and `MARGIN_ENV=production` in the engine environment. Keep its listener inaccessible from the internet and retain its existing S3, encryption, setup-token and central-account configuration. These templates assume one internet-facing reverse proxy and replace client-supplied forwarding headers. Additional CDN/load-balancer layers require an explicit trusted-proxy design before changing these settings.

Both configs route public HTML, the workspace, API and assets through Go and allow 300 seconds for upstream responses such as AI image generation. Nginx caps request bodies at 50 MiB; Apache relies on the Go engine's route-specific body limits because `LimitRequestBody` is bypassed for proxied requests. Nginx response buffering and proxy caching are disabled. See the [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) and [Apache reverse-proxy directives](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html) for server-level tuning.

Install the Nginx file inside the existing `http` context, such as `/etc/nginx/conf.d/`. Install the Apache file in the server's enabled-sites configuration and enable the modules listed in its comments; the server must listen on ports 80 and 443 for HTTPS output. Provision certificates before enabling the TLS site. Validate with `nginx -t` or `apachectl configtest`, then reload with your service manager.

`npm run test:deploy` is an optional Docker integration check. It runs generated HTTP and HTTPS configs through real Nginx and Apache, checking syntax, request forwarding, spoofed-header replacement, Nginx's upload cap, Apache's forwarding of upstream upload rejections, and redirects with temporary test certificates. It does not use your engine data or provider credentials.

## Build from source

Build from the repository root with `go -C cli run ./cmd/build`. This produces `cli/dist/margin` (`margin.exe` on Windows) plus a versioned native binary, checksum, and Go license notices in `artifacts/`. Copy the executable to a directory on PATH. Native binaries are specific to their OS and architecture.

A source build requires Go 1.22 or newer; the full backend uses the version in `backend/go.mod`. To build without Node, run `go -C cli build -o dist/margin ./cmd/margin` (use `dist/margin.exe` on Windows). To embed a release version, add `-ldflags="-X main.version=1.0.0"`. Build a release for another platform with `go -C cli run ./cmd/build -os linux -arch amd64`. Run CLI unit tests with `go -C cli test -race ./...`.
