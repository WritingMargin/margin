# Reader views, polls, and section conversations

Margin should let readers choose a shorter version of an article, take part in a poll, and help improve specific passages. Writers should be able to respond, recognize useful contributions, and bring subscribers back to an older article when there is a meaningful update. These features build on the existing signed-in reader, passage anchor, private note, poll, and newsletter systems.

## Current product behavior

| Area | Available today | Work in this specification |
| --- | --- | --- |
| Article views | One published article body and its normal canonical URL | Standard and Simplified views, a remembered reader choice, generation, review, and canonical handling |
| Polls | One vote per signed-in reader; agree/disagree reasons remain private writer feedback | Writer-controlled result timing and poll closing |
| Section feedback | Passage questions, private reader notes, author answers, and anchor reconciliation after edits | Unclear or out-of-date flags, proposed fixes, contributor credit, and update alerts |
| Subscriber communication | Newsletter campaigns | A short pinned author update on an article with a subscriber notification |

Polls, private notes, and passage questions are described in [reader-interactions.md](reader-interactions.md).

## Standard and Simplified article views

### Reader experience

- Show a **Standard / Simplified** control near the top of a published article when a current Simplified version exists. Standard displays the complete article. Simplified displays a shorter explanation of the same article, with its title, byline, and a direct **Read the full article** action.
- Remember the choice for that browser across articles and visits. Apply the preference only when an article has a current Simplified version; otherwise show Standard and explain that Simplified is unavailable. A reader can switch back immediately. The view must not affect the writer's saved article, private notes, votes, or sign-in state.
- Use a shareable Simplified URL, `/post/{slug}/simplified`. The normal `/post/{slug}` URL remains the primary article. Both routes must work without JavaScript, including when Margin is mounted under a base path. On a visit to the primary URL, a browser preference for Simplified redirects to the Simplified URL; an explicit `/post/{slug}?view=standard` overrides that preference. The switch updates the URL and preference together so back, forward, refresh, and sharing behave predictably.
- Label Simplified as AI-generated, and show a reviewed label only after the writer has reviewed it. Keep essential qualifications, dates, citations, and links to the corresponding full-article sections. It must not invent facts or strip warnings that change the meaning. If the source contains rich interactive blocks, summarize their purpose and link to the Standard view rather than presenting an incomplete interactive result.

### Writer settings and publishing

- Add an opt-in **Simplified articles** setting in the publication's reading experience settings. Before enabling it, show the current per-generation credit charge and that a new published article revision can incur that charge. The setting is off by default and does not retroactively process older posts unless the writer explicitly requests it.
- When enabled, each newly published article revision queues one generation for the complete current article. Draft saves, previews, design changes, and unrelated software deployments do not trigger generation. Use the post ID and published revision as the idempotency key. A repeat publish event for the same revision must not charge twice.
- Generate through Margin Central's metered AI service. `deepseek-flash` is the proposed provider model; Central owns the model choice, credentials, credit reservation, and refund behavior. The exact charge should be exposed from Central, not duplicated in the browser. DeepSeek currently documents `deepseek-flash` as its Flash API model ([official API documentation](https://api-docs.deepseek.com/quick_start/agent_integrations/)). Validate its output quality on representative long, technical, and sensitive articles before making it the default.
- Publishing the Standard article succeeds even if generation fails or credits are exhausted. The writer sees the failure and a retry action. Do not show a Simplified version from an older revision alongside a newly published article. A successful generation becomes available automatically; the writer may review, edit, and save it without another AI charge. Manual edits attach to the same source revision and have their own revision history.
- A subsequent published article revision creates a new Simplified version. Keep the prior version in writer history but hide it from readers until a version for the current published revision is ready. A writer can turn off future automatic generation without deleting already published Simplified versions; provide a separate per-post unpublish action.

### Search engines and accessibility

- The Simplified page emits `<link rel="canonical">` pointing to the Standard article's absolute URL. Its Open Graph URL and structured article identity also point to that original. Do not add Simplified URLs to the sitemap, RSS, or article search index as separate posts.
- Preserve the Standard article's `noindex` setting on both views. Keep the canonical target updated when a slug or publication domain changes. Do not expose a Simplified page for an unpublished or archived article.
- The switch is a labeled, keyboard-operable control with an announced current selection. A preference change must not trap focus or silently replace text while the reader is interacting with a passage.

## Poll result timing

- Add **Show results after voting** and **Show results when voting closes** to each poll. The first option preserves today's behavior. The second requires a close date and time with a clear timezone in the writer's poll editor.
- Before close, the server returns no vote totals or option counts for a delayed-results poll, including to a reader who already voted. The voter sees their choice and the close time. The author can inspect results in the authenticated writer interface.
- At the close time, reject new votes and reveal the final totals to readers, including signed-out readers. The page should refresh the result state at close or on the next visit. Changing a poll's stable ID starts a new poll; editing its wording without changing the ID preserves votes. The writer UI warns when editing a poll with votes.
- An agree/disagree reason is private feedback stored with the vote and visible in writer results only. It never appears in public poll responses or the conversations inbox. An author can close a poll early; reopening after results have been public is disallowed to avoid changing a declared final result.

## Section flags and proposed fixes

- A signed-in reader can select a passage and choose **Unclear** or **Out of date**. They may add a short explanation and propose replacement text. The submission stores the post ID, published revision, quote, occurrence, anchor position, reason, proposed text, and reader identity. It is private to the writer until accepted. Rate limits and abuse controls follow other passage submissions.
- Show flags in the writer's Conversations inbox with the current passage and the original quoted passage. The writer can dismiss, request clarification, or accept a proposed fix into a working draft. Acceptance never changes the live article by itself; the writer reviews and publishes the draft.
- When the published revision includes the accepted change, mark the contribution **Applied**, show the reader's chosen public display name beside the updated section or in an article contribution list, and send the section-updated alert. The writer may remove attribution if the reader requests it. A dismissed or unused proposal receives no public credit.
- Reconcile the flag's anchor after edits using the existing passage anchor behavior. If a quote no longer maps confidently, show it as referring to an earlier version and require the writer to choose the target section before applying a fix. Never apply replacement text by an unchecked string substitution.

## Author updates

- Let the writer pin one active, short **Author update** on a published article. It appears near the article opening with its date and can be edited or removed. A new update or substantive edit has its own revision so readers can tell what changed. A historical update remains in the writer's audit trail.
- Publishing an update queues one message per currently confirmed subscriber containing the article title, update text, and canonical Standard URL. Use the configured newsletter delivery, unsubscribe rules, delivery retries, and a stable notification ID to prevent duplicates. Require working email delivery before offering **Publish and notify subscribers**, and report delivery state to the writer. If delivery becomes unavailable after publication, retain the update and retry the queued notifications; do not claim subscribers were notified until delivery succeeds.

## Reply and update alerts

Provide an in-app alert inbox for signed-in readers. Email alerts are optional per reader and separate from newsletter subscription. A reader can mute a thread or all email alerts, and every email includes an alert-settings link. Store delivery state so retries do not create duplicate messages.

| Event | Recipient | Alert text and destination |
| --- | --- | --- |
| Writer answers a question | Original contributor | **The author answered you**; open the anchored thread |
| Another reader replies in a thread | Participants who have not muted it, excluding the sender | **Someone replied**; open the new reply |
| A flagged section's accepted fix is published | Reader who flagged or proposed the fix | **The section you noted was updated**; open the revised section |

Question follow-ups remain in the existing passage thread. Only approved, visible replies trigger alerts. Moderation changes, repeated saves, and a writer's draft edits do not trigger them. If an article is unpublished, alerts remain in the inbox but their public links no longer reveal the article.

## Data and service boundaries

- Store Simplified content by `(post_id, source_revision)` with generation state, model/credit transaction ID, generated text, optional writer edits, publication state, and timestamps. Serve only a version matching the live published revision. Central handles provider calls and credit accounting; the blog backend keeps article content and revision checks.
- Store the reader's view preference in a browser cookie so the server can redirect before rendering and keep the primary URL cache behavior explicit. A request from a crawler or a browser without that cookie receives Standard.
- Add poll visibility and close time to the validated poll block schema. Enforce result secrecy and close time in the backend; hiding counts in React alone is insufficient.
- Store flags and proposed fixes separately from private reader notes, with a status history and a link to the published revision that applied a fix. Store author updates independently from reader feedback.
- Store reader alerts with recipient, event key, thread or section target, read state, and delivery preference. Use unique event keys for idempotent publication and email queues. Keep subscriber email addresses and private flag text out of public responses.

## Release acceptance

1. A writer can enable Simplified generation, see its credit price, publish an article, review or edit the generated view, and retry a failed generation without a duplicate charge for the same revision.
2. A reader can switch views, refresh or share either URL, and keep their browser preference. A crawler receives a server-rendered Simplified page whose canonical points to the Standard article.
3. A delayed-results poll reveals no counts before close through either the UI or public API, rejects votes at close, and shows final results afterward. Existing polls continue to work with their current result behavior.
4. A reader can flag a passage and propose a fix; the writer can review it in context, apply it to a draft, publish, and credit the contributor. No unapproved or unapplied proposal appears publicly.
5. A writer can publish an author update, notify confirmed subscribers once, and see whether the message was queued, delivered, or failed.
6. Readers receive the three specified alert types for visible events, can open the relevant thread or section, and can mute email alerts without changing their newsletter subscription.
