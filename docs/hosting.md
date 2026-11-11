# Hosting Margin

Margin serves the public site, editor, and API from one Go application. Release binaries embed the frontend; production needs no Node runtime.

## Run the GHCR image

Install Docker and create the `.env` shown in [Start writing](../README.md#start-writing), using your private bucket's credentials. Then run:

```sh
chmod 600 .env
docker run -d --name margin --restart unless-stopped \
  --env-file .env \
  -p 127.0.0.1:3001:3001 \
  -v margin-data:/app/.data \
  ghcr.io/writingmargin/margin:latest
```

Read the generated setup token with `docker exec margin cat /app/.data/setup-token.secret`, then enter it at `http://localhost:3001/admin` to create the owner account. The image includes the application and frontend, and keeps SQLite and generated keys in the persistent `margin-data` volume. If you supplied `SETUP_TOKEN`, use that value instead.

### Bundled local storage

To run storage alongside Margin, use Docker Compose. Download just the deployment files into a new directory:

```sh
mkdir margin && cd margin
curl -fsSLo compose.yaml https://raw.githubusercontent.com/WritingMargin/margin/main/docker-compose.yml
curl -fsSLo .env https://raw.githubusercontent.com/WritingMargin/margin/main/.env.example
chmod 600 .env
```

Replace the example storage credentials. Missing encryption and setup keys are generated in the persistent data volume. Then start the stack:

```sh
docker compose pull
docker compose up -d
```

Read the setup token with `docker compose exec app cat /app/.data/setup-token.secret` and enter it when creating the owner.

Choose either the standalone container or this Compose stack for an installation; both use port 3001.

## Public hosting

Before exposing the installation:

1. Set `MARGIN_ENV=production` and `PUBLIC_URL` to your full public HTTPS URL, including any mount path.
2. Use the generated setup token from the data volume, or set your own `SETUP_TOKEN`. Enter it when creating the first owner.
3. Put an HTTPS reverse proxy in front of port 3001. Set `TRUST_PROXY` to the actual number of trusted proxy hops.
4. Persist the metadata directory and content storage, and retain the encryption key securely.

If the same installation is served through additional trusted hostnames, set `MARGIN_ALLOWED_ORIGINS` to their comma-separated origins, for example `https://www.example.com,https://writers.example.com:8443`. Include the scheme and optional port, but no mount path, query, credentials, or wildcard. `PUBLIC_URL` and the saved publication domain remain allowed automatically. Invalid entries grant no access. This is the blog engine's browser-origin check; it does not enable CORS, share login cookies across hosts, or change the canonical public URL. Cross-site requests remain rejected. Restart the process after changing its environment; with Docker Compose, recreate the app container to load `.env` changes.

Owner and reader logins automatically share cookies between the HTTPS `PUBLIC_URL`
host and its `www` alias. For example, either `https://example.com/blog` or
`https://www.example.com/blog` uses `example.com` as the cookie domain. This exact
alias is also allowed for browser mutations without `MARGIN_ALLOWED_ORIGINS`.
A host such as `blog.example.com` stays scoped to `blog.example.com` and
`www.blog.example.com`; it never automatically widens to `example.com`. HTTP URLs,
localhost, IP addresses, and public suffixes retain host-only cookies.

`MARGIN_COOKIE_DOMAIN` optionally overrides the default. Set it to `host-only` to
disable sharing, or to a domain matching the HTTPS public hostname or one of its
parents. Schemes, paths, ports, and public suffixes are rejected. All subdomains
receiving domain cookies must be trusted, and aliases must serve the same Margin
database. Cookies keep their mount path, HttpOnly, SameSite, and production Secure
protections. Shared cookies use separate names, requiring a fresh sign-in after
upgrading from host-only sessions so old cookies cannot shadow the new session.
Logout revokes the shared session across both hosts. Recreate the container after
changing its environment.

In **Settings → General → Configure your web server**, choose Nginx or Apache and enter the engine address reachable by your proxy. Generate, copy, or download a config based on the public blog URL. A root URL generates a complete site config; a subpath generates a snippet for your existing site. Generation does not change your saved address, DNS, certificates, or server. Review the comments, install the config, validate it, and reload your proxy.

The native CLI uses the same templates: `margin deploy nginx --domain blog.example.com` or `margin deploy apache --domain blog.example.com`. See [proxy setup](../cli/README.md#generate-engine-deployment-configs) or [hosting under an existing /blog path](deploy-usefused-blog.md).

Download binaries from [releases](https://github.com/WritingMargin/margin/releases). The engine image is `ghcr.io/writingmargin/margin:latest`. The supplied Compose file pulls the published image for both the app and bucket initialization. Set `MARGIN_IMAGE` in `.env` to a release tag or digest to pin a version. The same image serves a domain root or any supported subpath. Set `PUBLIC_URL=https://example.com/blog` and the mount is inferred, or explicitly set `MARGIN_BASE_PATH=/blog`. Restart after changing the environment; no rebuild is needed. Keep the URI prefix in the reverse proxy. Older releases with a compiled mount need upgrading once. Release images run as UID 1000 and store SQLite metadata in `/app/.data`.

## Storage

| Setting | Purpose |
| --- | --- |
| `SQLITE_PATH` | Metadata database; defaults to `.data/margin.db` |
| `DATABASE_URL` | Select PostgreSQL instead of SQLite |
| `CONTENT_ENCRYPTION_KEY` | Primary write key; optional override for the persisted key |
| `CONTENT_ENCRYPTION_KEY_PREVIOUS` | Optional read-only fallback during online key rotation; verify migration before removing |
| `SETUP_TOKEN` | Optional override for the persisted first-owner setup token |
| `S3_BUCKET` | Private article and upload bucket |
| `S3_REGION` | Bucket region; defaults to `us-east-1` |
| `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | Configure compatible storage services |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Storage credentials; AWS workload credentials are also supported |

The bundled Compose stack overrides the endpoint to its local storage service. For external storage, remove those endpoint overrides and the `create-bucket` dependency, and omit the `s3` and `create-bucket` services. Keep the bucket private; Margin controls public access to published content.

For bundled PostgreSQL, set `POSTGRES_PASSWORD` and `DATABASE_URL=postgresql://margin:YOUR_URL_ENCODED_PASSWORD@postgres:5432/margin`, then run:

```sh
docker compose --profile postgres up -d --wait postgres
docker compose --profile postgres up -d
```

Persist the data directory even when using PostgreSQL: generated keys are stored beside `SQLITE_PATH` (default `.data/margin.db`), or in `margin serve --data-dir`. Changing database settings does not migrate existing data. See [content encryption and recovery](storage-encryption.md).

## Upgrades

Back up your data and retain your existing `.env` and encryption key. For the standalone container, pull the new image and replace the container while keeping its volume:

```sh
docker pull ghcr.io/writingmargin/margin:latest
docker stop margin
docker rm margin
docker run -d --name margin --restart unless-stopped \
  --env-file .env \
  -p 127.0.0.1:3001:3001 \
  -v margin-data:/app/.data \
  ghcr.io/writingmargin/margin:latest
```

For Compose, update `MARGIN_IMAGE` if you pin a release, then run:

```sh
docker compose pull
docker compose up -d
```

## Backups

Back up metadata, content objects, and the encryption key. Keep secrets separately from database backups. Stop the app before copying SQLite and its WAL files; use consistent database backups for PostgreSQL. Saved revisions retain their content objects, so do not apply blanket bucket expiry rules. Test restoration.

`docker compose down` preserves volumes. Adding `-v` removes them.

## Optional services

Owners choose whether to connect an account in the workspace. An operator may also provision `AI_SERVICE_TOKEN`. AI provider keys and models are managed by Margin, not configured on the engine. See [account connection](ai-service.md).

Comments use Turnstile credentials saved in Settings. Newsletters can use Margin email or your own SMTP server, configured in Settings. SMTP works without a Margin account; its credentials are encrypted locally. Margin email uses a blog-specific @margin.dev address, or a custom domain after DNS verification. These integrations are optional; publishing does not depend on them.

Owner signup attempts to send an email verification link when delivery is ready.
Owners can sign in and work before verification; a workspace reminder lets them
send or resend the link after configuring **Readers → Settings → Email delivery**
and the public URL. Pausing newsletter subscriptions does not disable owner
verification. Existing owners start unverified and retain access.

Verification uses a separate, hashed, single-use token valid for 24 hours, with
a one-minute resend cooldown. Opening a link does not consume it: the owner
clicks **Verify my email**. Verification neither logs in nor subscribes the owner.
The recorded email and verification timestamp must match the current owner
address before password recovery can use it.

For managed delivery, deploy Central's `POST /v1/newsletter/owner-verification`
support before this engine. It uses the existing managed email plan and verified
sender, and requires the recipient and public URL to match the connected Central
account. SMTP delivery works locally without Central. If mail fails, signup still
succeeds and the owner can retry from the reminder.

## Releases

Pushes to `main` run checks, create a patch version, and publish engine/CLI archives and a Docker image. Manual workflow runs build unpublished snapshots. [Margin Central](https://github.com/Usefused/margin-central) has its own repository and release workflow.

## Central-managed cloud accounts

A cloud-capable engine can be provisioned by Central through `POST /api/cloud/bootstrap`. This server-only operation requires the per-instance `SETUP_TOKEN` as a Bearer credential (at least 32 characters), a verified email, the immutable Central account subject/origin, and publication name. It creates the owner and records email verification atomically. It never creates a browser session or accepts a replacement for an existing local owner or different cloud identity.

Cloud owners sign in through the normal blog email/password form with their Central credentials. The engine validates those credentials over HTTPS against the bound Central origin's `/cloud/api/engine-login` endpoint, authenticated with its setup credential. Central checks ownership, account status, verification, and password before the engine creates its local session. Passwords are not stored on the engine, and redirects are not followed. Self-hosted local accounts retain their existing authentication flow.

Keep Central and the Hosting setup-token API available for new cloud logins. Select a released engine image containing this integration before enabling Central cloud provisioning. See [Central cloud hosting](../margin-central/docs/cloud-hosting.md) for verified-email signup and Plunk delivery configuration.

## Password recovery

**Forgot password?** on the owner sign-in screen supports two account types:

- Local owners receive a link through the publication's configured SMTP server or Margin managed email. SMTP needs no Central account. The owner email must already be verified, the public URL must be configured, and delivery must be ready. Disabling newsletter subscriptions does not disable recovery.
- Cloud-managed owners follow a link to their bound Central origin's `/forgot-password` page. Central resets the account password used for blog login; the engine never replaces it with a local password. Merely connecting a self-hosted publication to Central for AI/email does not make its owner cloud-managed.

Links expire after 30 minutes, are single-use, and are stored as hashes. A new request replaces the previous link after a one-minute cooldown. Request responses do not disclose account existence or mail readiness; delivery happens asynchronously with bounded concurrency and a timeout. Requests are limited to five per IP per hour and confirmations to fifteen per IP per fifteen minutes. Delivery failures log a credential-free message and invalidate the failed token so the owner can retry. An interrupted server may lose an in-flight delivery; request another link after the cooldown.

Local recovery atomically changes the password and removes all owner browser sessions. Central recovery removes all Central browser sessions for that account. Neither flow signs the owner in automatically, rotates content encryption keys, touches S3 objects, or changes API/OAuth credentials. Existing independent blog sessions for a Central owner retain their normal expiration; Central recovery does not remotely revoke them.

Deploy Central before the engine when using Central accounts or managed email. Managed delivery adds `POST /v1/newsletter/owner-password-reset`, restricted to the registered owner and blog URL under the existing email entitlement. Standalone SMTP needs only the engine upgrade. Database tables are created on startup without changing existing owner credentials.

Recovery cannot restore a missing SQLite volume or work without a previously verified mailbox and a working mail service. In that situation the server operator must restore the original database or perform an independently authorized administrative recovery.
