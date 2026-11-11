# Reader interactions

Open **Readers → Settings** to manage newsletter signups, article comments, passage questions, and private reader notes together. **Comments & questions** uses one shared mode: **Open** shows and accepts both once spam protection is configured. **Closed** and **Hidden** remove public conversations and question actions while retaining saved entries in moderation. The comments setting is authoritative, including when saved through older settings APIs. Private notes have their own switch. Highlight text to open a small menu beside it: **Create citation**, the available question or private **Note** action, and reactions below. Normal selection and copying remain available. Approved questions appear as highlights and margin bubbles. Click a highlight or its margin bubble to see that passage’s questions and reactions; dragging over highlighted text still selects it.

## Sharing a citation to a passage

Select up to 2,000 characters in a published article’s standard reading view and choose **Create citation**. The single **Copy citation** action copies the quotation, author (when available), article title, publication name, and passage link together. If clipboard access is unavailable, the dialog offers the complete citation as selectable text to copy manually. Creating and opening citations requires no sign-in and remains available when comments and notes are disabled.

Opening the link scrolls to the selected passage and highlights it. Links distinguish repeated passages, work across inline formatting and paragraph boundaries, and keep the standard reading view. The highlight follows layout changes and can be dismissed. Citation data lives in the URL fragment, so it is not stored as a reader note or sent to the server. Links retain surrounding text to locate unchanged quotations after edits. If the quotation is gone or its location is ambiguous, Margin shows the original quote with a notice instead of highlighting an unrelated section. Citations do not grant access to unpublished or restricted articles.

Reaction emojis and their counts appear beside the highlighted passage. The conversation count is separate, and clicking the marker opens the passage activity. In that activity view, **Add reaction** opens the same emoji choices available from the text-selection menu.

After the writer answers a passage question, the reader who asked it can open the highlighted passage and choose **Reply to writer**. The follow-up stays in the same conversation. It follows the publication’s comment approval policy, and the writer can approve and answer it in **Readers → Conversations**. The reader can send another follow-up after the writer answers the previous one.

Questions and article comments share **Readers → Conversations**, with server-side filters for pending/all submissions and each contribution type. Private notes are available only to the signed-in reader who wrote them. Email addresses are never included in public responses. The old `/admin/comments` URL still opens the shared inbox. Historical public-note records remain stored for data preservation but are excluded from public and moderation responses.

Readers can react to a selected passage with an emoji after signing in. The selected passage displays the reaction and its count. On desktop, count markers in the right margin open passage activity. On small screens, count chips at the end of the paragraph open a bottom sheet. Private notes open in the reader’s Notes sidebar for later review.

The **Poll** editor block accepts a multiple-choice poll or an agree/disagree poll. Each poll has a stable ID and allows one vote per signed-in reader. In the block picker, choose whether results appear after a reader votes or when voting closes; the latter needs a close date and time. The writer can view live counts and close voting early from the article's **Polls** details tab. Delayed results stay hidden from the public API until close. Agree/disagree polls may accept a reason. It is private feedback visible only in writer poll results; the public poll response contains no reasons. Writers can see a reaction map in Analytics, combining passage highlights, approved questions, votes, emoji reactions, and scroll reach.

**Readers → Subscribers** lists confirmed, pending, and unsubscribed addresses, with pagination. It never exposes private notes or confirmation/sign-in tokens. **Readers → Settings → Email delivery & reader access** configures the one managed or SMTP connection used for confirmations and subscriber sign-in. Pausing newsletter signups keeps sign-in available to existing subscribers when email delivery is ready. Appearance controls stay in Blog designer.

## Private notes for signed-in readers

Notes, comments, passage questions, reactions, and peer review use the same reader sign-in. Readers can choose Google when connected or request a one-use email link. Notes are private to the verified email address, so a reader can return through either sign-in method with the same address. Newsletter subscription is separate. Existing confirmed subscriber sessions continue to work.

Private notes are scoped to a verified reader email and are absent from public and author moderation APIs. Readers can save a note about the whole article or attach it to a selected passage; passage notes retain their original quote when the article changes. They can review, edit, and delete their notes from **Notes**. A newsletter subscription is not required. Reader sessions expire after 30 days and can be signed out from the notes panel.

## What happens when the author edits a passage

Choose the policy before saving article edits:

- **Keep the question with the original quote:** if the quoted text changes or disappears, preserve it in the question list with an explanation that the passage was edited.
- **Hide the question from readers:** remove the affected question from public responses while keeping it in moderation. The author can still delete it.

A selected passage records its occurrence and position, so repeated quotes attach to the selected copy. When an edit moves text, the anchor follows its closest matching location. If the quote changes or disappears, the marker stays near its former position and is labelled **On an earlier version**. The original revision remains in revision history. Changing only article metadata does not apply the policy.

Policy decisions are stored with the affected question in the same transaction as the article revision. Changing the setting later, or restoring earlier article text, never replays those decisions. Private notes are unaffected by this policy.

Closed and hidden conversation modes remove discussions from public articles and stop new submissions while retaining them in moderation. Reopening conversations with spam protection configured restores approved discussions. Disabling notes stops new notes; signed-in readers can still read and delete their saved notes. The database adds the required tables on server startup; rebuild and restart the server when deploying this change.
