# Reader sign-in and comment moderation

Readers sign in before leaving comments or passage questions. Google is enabled for this rollout; Apple and Microsoft are disabled. Provider selection uses a Central-managed allowlist (`MARGIN_READER_PROVIDERS=google`); provider credentials are held by the Fused `margin-reader-auth` Unified App. Social sign-in needs an enabled Central account but no paid plan. Only configured providers are shown.

Email is a separate sign-in choice. Managed delivery uses Resend through the same `margin-reader-auth` Unified App and requires the publication's email entitlement; custom SMTP needs no Central subscription. Social sign-in sends no verification email. Neither method subscribes readers to a newsletter or grants author permissions.

| Require approval | New signed-in contribution |
| --- | --- |
| On (default) | Enters the author's approval queue. |
| Off | Publishes immediately. |

Set this in **Readers → Settings**. Comments and questions must also be open. Existing pending contributions retain their original rules when settings change. Old per-contribution email links continue to work, but new contributions never require a second verification email. CAPTCHA is no longer part of normal commenting; existing CAPTCHA configuration APIs remain for compatibility.

## Configure social sign-in

1. Deploy `margin-reader-auth` with Google's existing default-bucket registration and Resend.
2. Configure Central's app family ID, exact version ID, bucket ID, execution token, public callback origin, and `MARGIN_READER_PROVIDERS=google` using [the Fused deployment guide](reader-auth-fused.md). No Google client ID or secret is copied into Central.
3. Keep Google's registered callback on Engine: `https://eng.usefused.com/workspace/connect/callback`. Engine returns the browser to Central after completing consent.
4. Connect the blog to Central with its exact `PUBLIC_URL`, including any mount path. Deploy the updated Central code before enabling the engine's reader options.

Central starts a fresh Fused connection for each login and verifies its returned metadata against the initiating app, bucket, service and user reference. The Unified App fetches Google's authenticated profile through that connection. A single-use ticket is bound to the blog account and verifier; the blog additionally checks the initiating browser cookie. Social identities are keyed by provider and subject, never merged by email. An existing verified newsletter-reader session can also comment. Private notes are available only through a session for their verified email address.

## Email links and sessions

Email links expire after 15 minutes, work once, and must be opened in the browser where requested. Opening the page does not consume the link; clicking **Sign in** does. Only token hashes are stored. The link contains its token in a URL fragment, keeping it out of server URL logs. A failed email delivery removes the token and throttle reservation so the reader can retry. A new email can be requested after 15 minutes. Reader sessions last 30 days and can be signed out without unsubscribing.

The browser binding intentionally prevents forwarding a sign-in link to another browser or device. It also blocks login CSRF via someone else's emailed link. Authentication does not guarantee a human reader; rate limits and optional author approval remain in place.

## Automated tests

```sh
go -C backend test -race ./internal/blog -run 'Comment|Conversation|Passage|Reader'
```

Run the Central and hosted-app tests from the Margin Central checkout:

```sh
go test -race ./internal/central -run 'Reader'
npm run test:reader-auth
```

Tests cover mandatory sign-in, server-derived identity, CSRF/origin checks, private email, both moderation settings, no social verification email, no newsletter signup, browser binding, expired/replayed links, atomic confirmation, throttling and delivery failure. Central tests reject substituted connections, wrong app/bucket/service/user references, unavailable connections, and cross-blog or wrong-verifier tickets. Provider calls and delivery are mocked; no real email is sent.

## Local browser test with a captured inbox

```sh
npm run build:web
MARGIN_COMMENT_PREVIEW=1 go -C backend test ./internal/blog -run '^TestCommentVerificationPreview$' -count=1 -v -timeout=25m
```

This opt-in test uses an in-memory database and a fake inbox on `127.0.0.1:57503`, then stops after 20 minutes. Social buttons are displayed using mocked configuration; use the email path for this local browser test.

1. Open `http://127.0.0.1:57503/post/room`. Choose email sign-in using `reader@example.test`.
2. In the same browser open `/__preview/mailbox`, follow the sign-in link, and click **Sign in**. The article should now show the comment form.
3. Submit a comment. Open `/__preview/login` to enter the author dashboard, approve it, and confirm it appears publicly.
4. In **Readers → Settings**, turn **Require approval** off and save. Submit another comment while signed in; it should appear immediately without another email.
5. Sign out and confirm the form returns to the sign-in choices. Reusing the email link should fail.
6. Click **Stop preview** in the fake inbox.

Preview login and mailbox routes exist only in the opt-in test. For a local article using real Google consent and the live Unified App, use the opt-in live preview described in [reader-auth-fused.md](reader-auth-fused.md). A live email smoke test requires a configured sender and an explicitly chosen test inbox.
