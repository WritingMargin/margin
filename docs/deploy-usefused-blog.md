# Deploy Margin at https://usefused.com/blog

This procedure keeps the existing Nginx site and its HTTPS certificate. It adds the `/blog` and `/blog/` locations plus three exact OAuth discovery routes at the origin root. Run server commands in your own Termius session; enter secrets privately, and do not paste `.env`, shell environment dumps, or `nginx -T` output into chat.

## 1. Upload the deployment files

Install Docker Engine with the Compose plugin on the Linux host if it is not installed. In Termius, create a dedicated directory owned by your deployment user:

```sh
sudo install -d -m 750 -o "$(id -un)" /opt/margin-blog
```

Using Termius SFTP, upload `docker-compose.yml` and `.env.example` from a release with runtime mount support into `/opt/margin-blog`. A source checkout and frontend build are not needed on the server:

```sh
cd /opt/margin-blog
```

These deployment files contain no local credentials, databases, or existing blog content. These are fresh-install instructions. To migrate existing content, restore its metadata and S3 objects together and retain the original encryption key. Do not generate a new content key for existing encrypted data.

## 2. Configure the engine privately

For a fresh installation only:

```sh
umask 077
cp -n .env.example .env
chmod 600 .env
nano .env
```

Set these non-secret deployment values:

```dotenv
MARGIN_ENV=production
MARGIN_BASE_PATH=/blog
PUBLIC_URL=https://usefused.com/blog
TRUST_PROXY=1
```

Enter your own `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`. `AI_SERVICE_TOKEN` is optional for a pre-provisioned Central account. For a new blog, generate **separate** values for `CONTENT_ENCRYPTION_KEY` and `SETUP_TOKEN` using `openssl rand -hex 32`, and save them privately. Keep the other S3 settings from the example when using the bundled S3 service.

Core blogging needs no Central account. For AI, managed newsletters, or integrations, the owner explicitly creates an account in the workspace; its blog URL is `https://usefused.com/blog`. See [account connection](ai-service.md).

`TRUST_PROXY=1` assumes Nginx is the one proxy in front of Go. If a CDN/load balancer is in front of Nginx, configure its trusted client-IP handling separately; do not blindly increase the hop count.

Owner and reader logins automatically work across `usefused.com` and `www.usefused.com`
when `PUBLIC_URL=https://usefused.com/blog` (or its `www` alias). No cookie-domain or
additional-origin setting is needed for this pair. Both hosts must route to the same
Margin installation and database with valid HTTPS certificates. Sign in once again
when upgrading from host-only cookies; logout then revokes the session on both hosts.

For other trusted origins, set `MARGIN_ALLOWED_ORIGINS` to comma-separated origins
(scheme and optional port, without `/blog`). To override the inferred cookie domain,
set `MARGIN_COOKIE_DOMAIN=usefused.com`; use `host-only` to disable sharing. Domain
cookies also reach matching paths on other subdomains, so those subdomains must be
trusted. These settings belong on the **Margin blog engine**, not Margin Central.
The deployed image must include this support. After upgrading or changing `.env`,
recreate the app with `docker compose -p margin-blog up -d --no-deps --force-recreate app`.
Restarting an existing container does not load changed environment values.

## 3. Pull and start

```sh
docker compose -p margin-blog pull
docker compose -p margin-blog up -d
docker compose -p margin-blog ps
curl --fail http://127.0.0.1:3001/blog/api/health
```

The same release image works at `/`, `/blog`, or a nested mount. Go resolves the frontend router and asset URLs at runtime. Changing `MARGIN_BASE_PATH` only requires recreating the container with the new environment. When omitted, the mount is inferred from the path in `PUBLIC_URL`. Upgrade older fixed-path images once to get this support. The runtime needs no Node installation. The Compose file binds port 3001 to loopback and stores SQLite and encrypted S3 objects in named volumes. Use the same `-p margin-blog` on subsequent commands to retain the same volumes.

If port 3001 is already occupied, change the host side of the app port binding before starting, and supply the matching `--upstream http://127.0.0.1:PORT` in the next command. Do not stop an unrelated service to claim its port.

## 4. Generate and install the Nginx snippet

```sh
docker compose -p margin-blog exec -T app margin deploy nginx \
  --domain usefused.com --base-path /blog > margin-blog.locations.conf
sudo install -d -m 755 /etc/nginx/snippets
sudo install -m 644 margin-blog.locations.conf /etc/nginx/snippets/margin-blog.conf
```

Make a private backup of your existing Nginx site configuration. In the **existing HTTPS `server` block for `usefused.com`**, add:

```nginx
include /etc/nginx/snippets/margin-blog.conf;
```

Keep the current `listen`, certificate, root/proxy settings, and other locations. Do not add a second competing `server_name usefused.com` block. Check first that `/blog` is not already assigned to another application. Keep the existing HTTP-to-HTTPS redirect.

The generated `proxy_pass` deliberately has **no trailing URI slash**: Go receives `/blog/...` intact. Do not replace it with a prefix-stripping proxy rule.

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Reload only if validation succeeds. No new DNS record or certificate is needed when the existing `usefused.com` site already has working HTTPS. To roll back the route, remove the new include, validate, and reload; leave the database and storage volumes intact.

### Existing installations: OAuth does not open in Claude

An older generated snippet proxies only `/blog` and `/blog/`. OAuth clients follow
the MCP response's `WWW-Authenticate` header to discovery URLs at the **origin
root**. If these reach the main website and return HTML or 404, authorization
cannot start even though `/blog/mcp` correctly returns 401.

Regenerate and install the snippet above using a release containing the OAuth
discovery routes. Alternatively, add these exact locations to the existing HTTPS
server block, using the same upstream as `/blog/`:

```nginx
location = /.well-known/oauth-authorization-server/blog {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host usefused.com;
}
location = /.well-known/oauth-protected-resource/blog/mcp {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host usefused.com;
}
location = /.well-known/oauth-protected-resource/blog/api {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host usefused.com;
}
```

Preserve the full request path; do not add a URI suffix to `proxy_pass`. Validate
with `sudo nginx -t`, then reload with `sudo systemctl reload nginx` only on
success. Verify that both commands return HTTP 200 and JSON metadata:

```sh
curl --fail-with-body -i https://usefused.com/.well-known/oauth-protected-resource/blog/mcp
curl --fail-with-body -i https://usefused.com/.well-known/oauth-authorization-server/blog
```

Reconnect the custom connector in Claude using `https://usefused.com/blog/mcp`.
No new provider OAuth client secret is needed for Margin's owner consent flow.

## 5. Finish and check

Open `https://usefused.com/blog/admin` and create the owner using your setup token. In General settings, leave the optional domain blank to use `PUBLIC_URL`, or set it to `usefused.com`; the engine appends `/blog` itself.

Verify the existing homepage still works, publish a test article, and check:

- `https://usefused.com/blog/`
- `https://usefused.com/blog/post/YOUR-SLUG`
- `https://usefused.com/blog/rss.xml`
- `https://usefused.com/blog/sitemap.xml`
- `https://usefused.com/blog/llms.txt`

For search engines, add `Sitemap: https://usefused.com/blog/sitemap.xml` to the **existing root** `https://usefused.com/robots.txt`, without replacing that file's current rules. Robots rules are read at the domain root; `/blog/robots.txt` is informational. Ensure existing rules do not disallow `/blog/`.

Back up the SQLite metadata, S3 objects, and encryption key. Do not run `docker compose down -v` against data you need to preserve.

## AI and billing status

The services run in Go. Hosted Fused apps remain TypeScript. The local `margin-credit-prices` source/version 1.0.4 preserves `/blog` on Checkout returns; it must be published and made active separately before testing mounted Checkout. The already deployed 1.0.3 strips that prefix. Provision or update the Central account's saved blog URL to include `/blog` as well. No provider credentials need to be shared with the blog or this chat.

Billing currently permits Stripe test mode only. The previously reported Fused text-app admission problem and missing image-provider configuration also remain separate from hosting. Deploying this blog does not enable live billing or resolve provider readiness.
