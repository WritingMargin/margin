# Guide responses

Authors can open **Readers → Guides**, or follow **Guide responses by reader** from Analytics.

Choose a guide to see saved participants, readers who completed every current step, and problem reports. **Step completion** shows counts and percentages for each main heading. Expand a reader to see their completed steps, last saved section, and paginated problem reports. Review and resolve reports through the existing Feedback workflow.

These are current saved responses across all visits, not time-based page analytics or quiz answers. Scrolling saves a place but does not complete a step. Readers explicitly mark completion. Subheadings belong to their main step, and a single H1 title above H2 steps is introductory. Deleted headings no longer count toward completion; reports keep their original step title and message.

Only signed-in reader activity is saved. Guest progress stays in memory until sign-in or reload. The guide explains that saved progress is visible to the writer. The author view shows display names and stable reader references, without reader email addresses, authentication identities, or private notes. Its API requires owner authorization and uses no-store responses.

Comments, Notes, and the guide all use `src/blog/ReaderAuth.tsx` and the shared `ReaderAuthProvider`. Google sign-in appears when `/api/public/comment-auth` advertises the Google provider. Email-only local fixtures have no social providers configured; changing the guide layout does not enable an OAuth provider.
