# Connecting Margin account features

Core writing, publishing, design, comments and uploaded media work without a Margin cloud account.

Owners explicitly choose **Create account and continue** before sharing their email and public blog address. The engine stores the account credential encrypted with `CONTENT_ENCRYPTION_KEY`. Operators can alternatively provision `AI_SERVICE_TOKEN`.

Open **Settings → Integrations → AI tools** (or **Plans & credits**) and choose **Create account and continue**. If the owner email is new to Margin Studio, registration completes automatically. If that email already belongs to a Studio user, choose **Sign in to Margin Studio**. In the Studio tab, sign in with that account, verify its email if needed, review the publication address, and choose **Connect publication**. The original engine tab connects automatically after approval; reloading it also resumes the pending request. Sign-in requests expire after ten minutes and can be restarted with **Start again**.

Connecting an existing account uses its subscription and credits. Each installation gets its own credential; existing account credentials and the Studio publication address remain unchanged. Your Studio password is entered only on Studio, and your engine keeps its local owner login. Matching an email alone never grants account access. This flow requires the updated Studio service and engine; deploy Studio first.

To move an existing account to a different Central address, first confirm that the new HTTPS address has a valid TLS certificate and uses the same account database. Set `AI_SERVICE_URL` to that address and `AI_SERVICE_URL_MIGRATE_FROM` to the exact old address saved by Margin, then recreate the engine container. On the first account request, Margin asks the new Central to verify the saved credential before re-encrypting it for the new address. A failed check leaves the saved address and credential unchanged; restore the old `AI_SERVICE_URL` to keep using the previous Central. Remove `AI_SERVICE_URL_MIGRATE_FROM` after the account shows connected at the new address. Changing `AI_SERVICE_URL` alone deliberately does not move a saved account.

AI assistance, images, social drafts and smart recommendations use this connection. Provider keys and model configuration live exclusively in Margin Central. Engine installations do not accept OpenAI or Jev credentials.

## Independent AI and hosting

Every installation offers prepaid AI packs: **£5 for 100 credits**, **£20 for 800 credits**, and **£50 for 3,200 credits**. Credits do not expire, and AI needs no subscription. Hosting customers can separately choose **Hosting Starter** (£10/month) or **Hosting Studio** (£30/month), with 1 GiB or 10 GiB of Margin-managed storage. Purchase buttons become available once the matching Stripe prices are configured.

**Auto top-up** is optional and off by default. Choose a pack, balance threshold and monthly spending cap, agree to automatic payments, then save a card through Stripe. The cap covers calendar months in UTC and includes pending payments. Disable it at any time to prevent new automatic purchases; a payment already started can still complete. Payment uncertainty or required authentication pauses automatic purchases for review.

Existing subscribers can be migrated by an operator: Starter/Studio bundles retain the matching hosting tier; AI-only subscriptions stop renewing at the paid-period end. Remaining spendable credits are preserved as non-expiring prepaid credits. Migration never opts anyone into auto top-up. Review removed legacy email/newsletter benefits before applying it. Historical plan definitions remain available for invoice reconciliation, but monthly AI plans are no longer offered to new buyers.

Margin imposes no storage quota on user-owned buckets, including buckets attached to a Margin-hosted engine. **Settings → Integrations → Content storage** and **Plans & credits** show measured bucket usage. Managed storage also shows the allowance and remaining bytes; owner storage says **No Margin quota**. Listing failures show an error, not a zero balance. Figures include all current objects in the configured bucket, including encrypted content, revisions and files; provider version history and other provider overhead are not included.

Your own SMTP delivery and Cloudinary credentials work without a paid Margin plan. Managed email remains a paid service included in legacy bundles; AI or the new hosting-only plans do not unlock it.

Rollout: validate and publish the updated billing adapter, configure the prepaid pack and hosting Stripe prices, deploy Studio with the additive database migration, let it reconcile storage ownership flags, then deploy the Engine. Managed storage uses `MARGIN_STORAGE_MANAGED=true` with `S3_STORAGE_LIMIT_BYTES`; a user-owned bucket ignores Margin plan limits. No existing subscription is automatically migrated.

## Simplified articles

In **Readers → Settings**, enable **Simplified articles** to generate a shorter version on each newly published article revision. The setting shows Central's current credit charge before it can be enabled. Draft saves and software deployments do not generate or charge. A failed generation leaves the original article published and returns reserved credits; the writer can retry from the article editor. The editor's **Simplified** panel lets the writer review, edit, hide, or restore the version for the current published revision. Publishing another revision hides the previous Simplified version until the new one is ready.

Readers choose **Standard** or **Simplified** at the top of an article. Their choice is remembered in a browser cookie. Simplified pages keep the Standard article as their canonical URL and are not separate sitemap or feed entries. Generation uses Central's `simplified` feature and never exposes provider credentials to an individual Margin installation.

## Formatting existing content

The assistant opens on **Chat**, with **Saved insights** beside it. Ask for formatting directly in the conversation. The reply includes suggested changes to the existing wording, with **Changes**, **Original**, and **Preview** tabs and an **Apply formatting** action. Applying changes updates the editor; saving and publishing use the normal controls. **Undo formatting** restores the original snapshot while no subsequent edits have been made. A stale suggestion cannot overwrite newer edits; ask again to format the latest draft.

Use **New chat** (+) to start another conversation, and **Switch chat** to return to one already in progress. Each chat keeps its own history, unsent message and context choices. Replies continue in their original chat while you work in another. These chats are retained in the current workspace session and do not survive a page reload.

Formatting uses the existing Central writing connection and writing credit cost. Only eligible plain-text lines from the current draft (including unsaved changes) are submitted. Existing Markdown, links, images, code, tables, and Margin containers are left intact. Drafts are limited to 40,000 characters and 500 eligible lines; each proposal permits at most 100 changes.

The authenticated `POST /api/ai/formatting` endpoint accepts `{ "content": "Existing text" }` and returns `{ "content": "Formatted text", "changes": 1 }`. Like other AI endpoints, API-key access requires the owner role. Central returns only existing line numbers and an enumerated style; the engine rejects unknown fields, invented text, duplicate or protected targets, and unsupported operations. It constructs the result by inserting approved Markdown markers and spacing into the original snapshot, so the AI cannot add, remove, reorder, or rewrite article text. Empty proposals leave the snapshot unchanged; drafts without eligible lines skip the paid request. No Central deployment or new provider key is required.

For Central operators, deployment and billing documentation lives in the separate [Margin Central repository](https://github.com/Usefused/margin-central).

## Managed newsletter delivery

Newsletter → Managed uses the existing Margin account connection. Central checks the paid plan, sender domain ownership and verification, then sends confirmation email through the `margin-resend-email` Fused Unified App and Resend. The app also handles custom sender-domain setup. SMTP mode remains local.

Operators configure `MAIL_PROVIDER=resend`, `FUSED_MAIL_APP_ID=c2842aba-758e-46da-8d27-e467957e77eb`, `FUSED_MAIL_TOKEN`, and matching `MARGIN_MAIL_DOMAIN` (default `margin.dev`) and verified `MARGIN_MAIL_DOMAIN_ID` on **Margin Central**, following [Central’s operations guide](https://github.com/Usefused/margin-central/blob/main/docs/operations.md#managed-newsletter-email). The Resend and Plunk Fused sources, deployment configuration, tests, and Plunk import definitions live in the Margin Central repository. Deploy Central’s `.fused/unified_app/margin-resend-email.yaml` before rolling out Central. Resend's key stays in Fused's `fused-hosting` service bucket and must have full access for domain checks; a send-only key can test sending but cannot enable managed newsletter verification. The execution token stays on Central. No additional key is required by individual Margin installations.

Custom senders on other domains, such as `hello@your-publication.com`, require both Margin's account-specific `_margin-verification.your-publication.com` TXT record and Resend's sender-domain verification. A successful send-only test does not establish Margin account ownership. The managed domain name and provider ID must match; configuring only the ID does not change the default domain.

The previous `margin-plunk-email` app remains available for an explicit operator switch using its own family ID, execution token and `PLUNK_PROJECT_ID`. There is no automatic provider fallback.

Newsletter confirmation emails use a publication masthead, a responsive editorial layout, an inline-styled confirmation button, and an unsubscribe footer. The managed template lives in Central at `internal/central/newsletter_confirmation.html`; local SMTP uses the matching engine template at `backend/internal/blog/newsletter_confirmation.html`. Both render dynamic names and links with Go HTML templates. Design-preview emails are explicitly labelled and link to the publication without creating or changing a subscription.

Newsletter campaigns live in **Readers → Campaigns**. Choose one to five published articles in reading order, add a subject and optional introduction, then create a preview. Emails contain article excerpts and links to the full stories. The accent follows the blog design (`homepage.accent`, then the publication `accent`, then Margin’s `#202020` default); light accents get dark button text for contrast. Managed delivery and SMTP use the same email layout.

Send a single-address test from the preview before reviewing the audience and queuing a campaign. Tests are labeled and never subscribe their recipient. Queued campaigns snapshot their content and confirmed audience, persist across restarts, and send at one recipient per second. The worker checks that readers remain subscribed and articles remain published at the reviewed revision. Repeating the send request does not queue a second campaign. Pausing newsletters pauses pending deliveries. Acceptance counts describe provider acceptance, not inbox delivery; ambiguous or interrupted sends need provider review and are never replayed automatically. Each real email includes its own unsubscribe link, which remains usable when delivery or the account connection is unavailable.

Campaign APIs are owner administration routes under `/api/newsletter/campaigns` (list/create, get by ID, POST `/{id}/test`, POST `/{id}/send`). Tests require `email` and the reviewed `revision`; audience sends require `revision` and the reviewed `audience` count. Article or design changes invalidate a draft preview. Central must include POST `/v1/newsletter/campaign` before managed campaigns are enabled; it validates structured issue data, checks entitlement and sender verification, and sends through the configured Unified App with a stable per-recipient idempotency key. No arbitrary HTML is accepted.
