# OAuth for MCP and REST clients

Margin embeds `github.com/Usefused/fused-open-core/oauthserver` for OAuth client
authorization. An owner signs in to Margin, reviews the client, resource, and
requested permissions, selects which ones to grant, and approves or cancels. This is separate from reader sign-in.
Existing manually issued API tokens continue to work.

Set `PUBLIC_URL` to the canonical HTTPS publication URL, including any mount
path (`https://example.com/blog`). HTTP is accepted only for loopback development.
No provider client secret or external identity service is needed for this flow.
The bundled Fused source is pinned in `backend/third_party/fused-open-core`,
including its upstream license, so builds need no private GitHub access.

## Discovery and endpoints

For a publication at `https://example.com/blog`:

| Purpose | URL path |
| --- | --- |
| Authorization-server metadata | `/.well-known/oauth-authorization-server/blog` |
| MCP resource metadata | `/.well-known/oauth-protected-resource/blog/mcp` |
| REST resource metadata | `/.well-known/oauth-protected-resource/blog/api` |
| Dynamic client registration | `/blog/oauth/register` |
| Browser authorization | `/blog/oauth/authorize` |
| Token exchange and refresh | `/blog/oauth/token` |
| Token revocation | `/blog/oauth/revoke` |

Unauthorized MCP and protected REST requests advertise the resource metadata URL
in `WWW-Authenticate`. Reverse proxies must forward the well-known paths at the
origin root as well as the mounted publication paths. If another application
owns root routing, add explicit routes for these metadata URLs.

Register with JSON containing `client_name`, `redirect_uris`, and `scope`.
Use space-separated permissions; the default is `content:read`:

| Permission | Access |
| --- | --- |
| `content:read` | Published and private content, revisions, writing notes, and media library listings. |
| `content:draft` | Create and edit drafts; stage or discard unpublished changes to live posts. No publication or deletion of posts. |
| `content:publish` | Publish, unpublish, change live/archived posts, archive, restore, and delete. Draft editing remains separate. |
| `media:write` | Upload images and videos. |
| `settings:manage` | Read and change publication design, branding, templates, and SEO. |
| `administration:manage` | Reader/subscriber data, moderation, email/account settings, analytics, and paid AI services. Does not include the other capabilities above or credential management. |

Request only what the client needs. Owners can uncheck any requested permission;
selecting nothing grants no access. Unrequested permissions cannot be added by
modifying the consent form. The token response's `scope` is the actual approved
selection, which may be smaller than the request. Clients must honor that result.
MCP tool discovery and REST authorization both use the approved permissions.

The legacy role names `reader`, `writer`, `publisher`, and `owner` remain accepted
as registration/request aliases and expand to their equivalent capability sets.
Existing grants and manual API token roles remain compatible.

Redirect URIs require HTTPS, except loopback development addresses,
and must match exactly during authorization and code exchange. Fragments and
wildcards are rejected. Public clients use `token_endpoint_auth_method: none`;
confidential clients can request `client_secret_post` or `client_secret_basic`.
A confidential client's secret is returned only on registration.

Authorization uses `response_type=code`, S256 PKCE, and the registered redirect
URI. Include a fresh `state` and the exact `resource`:
`https://example.com/blog/mcp` or `https://example.com/blog/api`. Clients must
validate their returned state. Owner approval requires a browser session and a
session-bound consent form; an API bearer token cannot approve a client.

POST form-encoded token requests with `grant_type=authorization_code`,
`client_id`, `code`, `redirect_uri`, and `code_verifier`. Codes expire after 60
seconds and are consumed atomically. Access tokens expire after one hour.
Refresh with `grant_type=refresh_token`, `client_id`, and `refresh_token`.
Refresh tokens expire after 30 days and rotate on every successful exchange.
Replace both saved tokens atomically; replay of an old refresh token revokes
its entire family. Rotation also invalidates the previous access token.

The token endpoint inherits the resource from the grant when omitted. A supplied
resource must match; it cannot switch between REST and MCP. A refresh request
cannot change scope. Use a new consent flow for different permissions or a different resource.
MCP tokens can invoke allowed tools, whose internal API calls preserve their
MCP resource binding. They cannot be used directly against REST endpoints.

OAuth tokens cannot manage API tokens or OAuth connections. This prevents
exchanging an expiring delegated grant for a permanent credential. A new consent
with a different permission selection invalidates the client's previous grants.
Every request checks live database state; there is no authorization cache.

## Revoke access

Owners can revoke access in **Settings → Integrations → OAuth connections**.
Revocation invalidates outstanding codes and all tokens for that connection.
Removing a registered client also invalidates its registration. Clients can
POST `token` and their client credentials to `/oauth/revoke`; either an access
or refresh token revokes the associated family. Unknown tokens return success.

Anonymous registrations are rate-limited and capped at 1,000 clients per
publication. Owners can remove unused registrations in Integrations. Expired
codes and token records are cleaned in bounded batches during registration.
All credentials and authorization codes are stored only as hashes.
