# OAuth for MCP and REST clients

Margin embeds `github.com/Usefused/fused-open-core/oauthserver` for OAuth client
authorization. A publication member signs in to Margin, reviews the client, resource, and
requested permissions, selects which ones to grant, and approves or cancels. This is separate from reader sign-in.
Existing manually issued API tokens continue to work.

OAuth uses the same publication session and membership as the browser. Invited
teammates sign in with their local publication accounts. Teammate accounts with
the same email on different Margin installations have separate passwords, roles
and article grants. Tokens remain bound to the publication and resource that
issued them. Each person owns their own consent and connections, including
when several people use the same client.

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
| `review:assigned` | Review only articles assigned when consent is approved, including their review notes and referenced attachments. No general content, library, editing or publishing access. |
| `content:read` | Published and private content, revisions, writing notes, and media library listings. |
| `content:draft` | Create and edit drafts; stage or discard unpublished changes to live posts. No publication or deletion of posts. |
| `content:publish` | Publish, unpublish, change live/archived posts, archive, restore, and delete. Draft editing remains separate. |
| `media:write` | Upload images and videos. |
| `settings:manage` | Read and change publication design, branding, templates, and SEO. |
| `administration:manage` | Reader/subscriber data, moderation, email/account settings, analytics, and paid AI services. Does not include the other capabilities above or credential management. |

Request only what the client needs. Members can uncheck any requested permission;
selecting nothing grants no access. Unrequested permissions cannot be added by
modifying the consent form. The token response's `scope` is the actual approved
selection, which may be smaller than the request. Clients must honor that result.
MCP tool discovery and REST authorization both use the approved permissions.

The consent page uses the shared Margin workspace UI. It loads role-filtered
permissions and signed form fields from the same authorization endpoint with
`Accept: application/json`; these responses are authenticated and never cached.
Approval and cancellation still use the signed native POST to `/oauth/consent`.

The consent screen offers only requested permissions allowed by the current role:

| Publication role | OAuth permission ceiling |
| --- | --- |
| Writer | `content:read`, `content:draft`, `media:write` |
| Publisher | Writer permissions plus `content:publish` |
| Owner | Content, media, design and administration permissions; primary-owner billing and credential restrictions still apply |
| Peer reviewer | `review:assigned` only |

Any role with an article invitation can explicitly approve `review:assigned`.
Clients supporting reviewers must request that scope; `content:read` does not
grant review access. Reviewer consent captures the assigned articles at approval.
Newly assigned or regranted articles require new consent. Every request intersects
approved permissions and article grants with current access in the publication’s
own database. Downgrades apply immediately; removal, reinvitation and password
changes invalidate old member credentials. Team authorization does not depend
on an external account service.

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
validate their returned state. Member approval requires a browser session and a
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
with a different permission selection invalidates that member's previous grants
for the client. Every request checks live grant and membership state; authorization
is not cached between requests. Code exchange and refresh also revalidate
membership and never expand the approved permissions.

## Revoke access

Members can revoke their own access in **Connected apps → OAuth connections**;
reviewers use the **Connected apps** accordion in their review workspace. The
primary owner can also use **Settings → Integrations → OAuth connections**.
Revocation invalidates outstanding codes and all tokens for that connection.
Only the primary owner can remove a registered client, which invalidates its
registration and all grants for that client. Revoking a personal connection
leaves other people's connections intact. Clients can
POST `token` and their client credentials to `/oauth/revoke`; either an access
or refresh token revokes the associated family. Unknown tokens return success.

Anonymous registrations are rate-limited and capped at 1,000 clients per
publication. Owners can remove unused registrations in Integrations. Expired
codes and token records are cleaned in bounded batches during registration.
All credentials and authorization codes are stored only as hashes.
