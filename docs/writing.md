# Writing in Margin

Write Markdown with live preview, save a draft, and publish when ready. Choose Blog, Articles, or Research papers during setup or in Settings to match the language used across your publication.

## Publication teams

For a publication managed by Margin Central, open **Settings → Team** to invite someone by email. They accept with their Margin account; new users create an account and verify their email first. The same email and password work across publications, while each publication grants its own access. Being an Owner on one publication does not grant access to another.

Members and Pending invitations have separate page controls and page-size selectors. Central counts and selects each requested page in SQL; the browser loads only that page. Removing the last item on a page returns that list to its last available page.

| Role | Publication access |
| --- | --- |
| Owner | Content, team management and publication settings. The primary owner retains account ownership and credential delegation. |
| Writer | Create and edit drafts, upload media, and save proposed changes to published articles. Cannot publish, archive or delete content. |
| Publisher | Writer access plus publishing, archiving and deleting content. |
| Peer reviewer | Read and annotate only assigned articles, compare addressed notes and approve a review. Cannot edit article content or browse the workspace. |

Invitations expire and can be resent or revoked. Resending replaces the old link. Owners can change a member's role or remove access; Central checks the current membership on subsequent requests. Removing someone from one publication leaves their Margin account and other publication memberships intact. Central must be reachable to validate team sessions.

Peer-review access is granted per article. Invite from the article's review panel or choose **Peer reviewer** and an article in Team. A person can review several assigned articles. Inviting an existing Writer, Publisher or Owner to review an article adds that review assignment without replacing their publication role. Reviewer access to private media and source documents is restricted to the assigned draft.

Existing reader-based review invitations on a Central-managed publication must be sent again through the review panel to grant Central access; this reuses their review history. Self-hosted publications without a Central ownership connection retain the existing owner and reader sign-in flows.

Team edits identify the member in revision history. Public bylines remain the publication's shared author profile. Concurrent editing uses revision checks and conflict review; it does not merge keystrokes live.

## Articles and guides

Choose **New** in the workspace or content list, then select your publication’s **Post**, **Article**, or **Paper** option or **Guide**. All formats use the Markdown editor, media tools, draft/publish controls, and revision history. Guides provide user-guide and playbook outlines. The workspace lists the content type beside each title. The keyboard shortcut **⌘/Ctrl+N** starts an article.

Guides are standalone pages with heading navigation. A new guide starts with a left table of contents; change its placement in Post details. Local backups keep new drafts of each type separately, and revision restoration and conflict review preserve the content type. Existing content remains an article. API clients use `contentType: "article" | "guide"`.

## Table of contents

In the post editor, open **Post details → Article navigation** and enable **Table of contents**. Choose **Above the article**, **Left sidebar**, or **Right sidebar**, then save the post. The choice is per post and appears in both editor/designer previews and the published article. Sidebars stack above the text on narrow screens. Every Markdown heading has a section link, including when the contents panel is off. Use the # beside a heading to open its section, or right-click it to copy its address. Links use the heading text, so inserting an unrelated heading keeps existing section addresses. Repeated headings get numbered suffixes. Renaming the linked heading changes its address. The reader view uses the same section IDs. RSS section links open the public article. No contents box appears when the post has no headings.

The post API accepts `tableOfContents: "off" | "top" | "left" | "right"`. Existing posts default to `off`; omitted values are preserved during edits. This belongs to the post, independently of the publication’s article template.

### Design the contents panel in JSON

In **Publication designer → JSON**, add `tableOfContents` inside `article` or `guide`. This optional object is also supported inside a Central template's `design` or per-type `designs` entry. For example, merge this into your existing article config:

```json
{
  "tableOfContents": {
    "title": "In this article",
    "style": "filled",
    "numbered": true,
    "maxDepth": 3,
    "sticky": true,
    "width": 240,
    "radius": 12,
    "background": "#f1f4ed",
    "text": "#293b30",
    "accent": "#396548"
  }
}
```

`style` supports `plain`, `outlined` (default), and `filled`. An empty `title` hides the heading; omission uses “On this page”. `maxDepth` includes headings up to the specified HTML heading level (1–6; default 6). Numbering follows reading order and defaults to off. `width` sets desktop sidebar width (160–320px; default 210); `radius` sets corners (0–32px; default 8). Sticky sidebars default to on; small screens always stack the panel above the text. Colours accept six-digit hex values and otherwise follow the article/template palette. Plain style removes the panel border and padding; filled style adds a subtle background.

The post’s on/off and placement choices remain independent. An omitted config preserves the original contents appearance. A template replaces this object as a unit; templates without it reset to the default appearance. The JSON editor offers field suggestions and validation, and the design is shared by the editor, full preview, and published page.

## Themes and templates

Open **Publication designer → Templates** to browse complete page templates in a dedicated gallery. Each includes layout, colors, typography, width, borders, and corners. The **Homepage** gallery offers Journal, Magazine, Notebook, Midnight, Spotlight, Cover story, and Publication. The **Articles** and **Guides** galleries show only templates compatible with the selected content type, with compatibility labels for article-only, guide-only, and combined support. For example, Handbook supports guides, and Publication suite supports articles and guides. Choose each target independently: applying a guide template changes the guide design only.

Choose **Use template**, then **Preview & customize** to review the live desktop or mobile preview and adjust individual settings. **Save design** publishes your changes. Your publication name, welcome text, posts, pagination, and comment permissions are preserved. Each content template applies to every item of its selected type. Existing designs keep their appearance until you choose a template or customize a setting.

For starter content, choose a content type from **New**, then **Browse templates**. The picker filters outlines to the selected type. Essay, Research note, Engineering write-up, Tutorial, and Release notes provide editable Markdown outlines. Select a template card, review its outline preview, and choose **Use this outline**, or start writing on the blank page. Templates are available only for new drafts with an empty body; your title and post details stay intact. Save and publish through the usual editor controls.

Page templates populate the same design JSON used by the **JSON** editor. Optional `background`, `text`, and `accent` fields inside `homepage.style.colors`, `article.style.colors`, and `guide.style.colors` override the publication’s `style.colors` for that section. Omitting them preserves inheritance from the publication colors. No preset ID is required: exported JSON fully describes the design and remains editable.

In **Design → JSON**, type a setting or value to see supported completions with short descriptions. Related settings are grouped into objects such as `homepage.search`, `homepage.feed`, `homepage.hero`, and `article.body`. Expand or collapse objects with the gutter arrows. Optional display blocks are enabled by their presence: include `homepage.hero.artwork: {"type":"emoji","emoji":"✳"}` to show artwork, or omit `artwork` to hide it. `{}` enables a block with default options. This also applies to the hero, tagline, search, featured stories, card images, footer title, and comments. These blocks have no separate visibility field. Suggestions follow the current object and include allowed values. Existing flat configurations are still accepted and are shown in grouped form after previewing. Use **Ctrl+Space** or **Suggest** to open them, arrow keys to choose, **Enter** or **Tab** to insert, and **Esc** to dismiss. Help beneath the editor describes the setting at the caret, including limits and fallbacks. Choose **Preview changes** to validate, then **Save design** to publish.

The galleries load their catalog from Margin Central **only when you enter Templates or open the writing-template picker**. There is no background polling. Each visit revalidates Central’s version using its ETag; an unchanged catalog reuses the cached copy. If Central is unavailable or returns an incompatible catalog, Margin keeps the last valid catalog in memory, or uses included templates after a restart. A catalog update never changes your saved design or draft automatically.

Template catalogs do not require an AI subscription or a Central account. The engine requests `GET /v1/templates?schemaVersion=5` from its configured `AI_SERVICE_URL` and exposes the validated result through the owner-only `GET /api/settings/templates` endpoint. No credentials, publication settings, or post content are sent to Central. Public pages render entirely from their saved local design.

### Components and dynamic hero content

Spotlight, Cover story, and Publication compose a homepage from React components backed by matching server-rendered HTML. **Customize → Layout** lets you add a hero or featured section, reorder components, and choose a split, centered, or image-background hero. The post feed is required. Existing templates keep their previous structure until you choose **Compose with components** or a component template.

Under **Content → Hero content**, expand a field and choose **Custom value** or a dynamic source. Text sources include the blog title/description, welcome headline/introduction, and the selected content title/description (its excerpt). Image sources include the blog logo, an uploaded hero image, or the selected content cover. A button can link to the homepage or selected content. Set a fallback for empty sources; a missing image is omitted without breaking the hero. An empty button label or destination hides the button.

The content source can be the latest published post, or the latest featured post with a fallback to the latest published post. Selection stays independent of feed pagination, search, and topic filters. Drafts and archived posts are excluded. New published content and publication-name edits update bindings automatically; previews resolve them against the current unsaved design and existing published posts.

JSON stores literals or explicit bindings, for example `"title": {"bind": "blog.title", "fallback": "My publication"}` and `"buttonHref": {"bind": "content.url", "fallback": "#posts"}` inside a hero's `props`. Bindings read only the supported public fields; they do not evaluate JavaScript or arbitrary property paths. `homepage.sections` lists ordered components with unique `id` values and `component` values of `hero`, `featured-posts`, or `post-feed`. Hero sections also have `variant` and `props` fields. Downloadable templates are JSON compositions of components shipped with Margin. New component code requires an engine update; new compositions can come from Central.

## Sources and quotations

Select a passage and choose **Attach citation**, or write a citation tag:

```markdown
[Citation url="https://example.com/article" title="Original article"]The words being cited.[/Citation]

[Citation url="https://example.com/report.pdf" title="Research report" page="12" quote="Original wording."]A supported observation.[/Citation]
```

Keep the tag on one source line. Readers click the highlighted text for a quotation preview, then open the source in a new tab. Website text links depend on browser support and matching destination text; external PDF page links depend on the viewer.

For a precise PDF location, upload or select a document through **Attach citation → PDF library**, choose its page, and mark the cited area. Margin's PDF viewer highlights that area. PDFs can be up to 20 MB. Scanned documents support area selection, without OCR. Uploaded sources become public only while cited by a published post.

## Technical and visual content

Choose **Code block** in the writing toolbar to paste or edit code with syntax highlighting. Margin detects the language, or you can select it yourself (including Plain text). Put the cursor inside an existing fenced block and choose **Code block** to edit it. Changes apply only when you choose **Insert code** or **Apply changes**; Cancel leaves the article untouched.

In **Write** and **Split** views, code and non-text embeds appear as small descriptive labels flowing inline with the writing. Adjacent labels share the available line width; ordinary paragraph breaks stay readable. Double-click a label (or focus it and press Enter) to reveal and edit the original source; **Hide code** collapses it again. This covers fenced and indented code, notebooks, charts, diagrams, scenes, polls, images, video, audio, link cards, social embeds and image carousels. Prose, font markup, citations and text containers remain visible. Folding changes only the editor display; saved and published source stays intact. Incomplete blocks remain visible while you type.

The code editor preserves pasted indentation and has **Indent** and **Outdent** controls for selected lines. Tab inserts two spaces at the cursor or indents selected lines; Shift+Tab outdents. Press Escape, then Tab (or Shift+Tab) to move focus out of the code field. Type `/python`, `/javascript`, or another language on a new line to insert a fenced block through autocomplete. Code blocks inside lists and quotations can be edited directly in the writing area. Article previews and public articles show highlighted code, its language, and a **Copy** button. Unknown languages remain readable as plain code. Code is never executed.
Article code wraps by default and grows to show every line. For code that must keep its original line breaks, choose **Keep lines unwrapped** in the code block editor or add `nowrap` after the language in the opening fence, for example `` ```python nowrap ``. Unwrapped blocks scroll horizontally when needed.

Use the editor's insert controls for charts, Mermaid diagrams, 3D scenes, tabs, callouts, images and video. Examples and supported properties are in the [interactive-content guide](interactive-content.md) and [video guide](video-embeds.md).

You can also drag image files from your computer into the writer’s pad in Write or Split view. Drop one or several PNG, JPEG, WebP, or GIF images (up to 10 MB each) to upload and insert them at the current cursor, using your saved image layout defaults. You can keep writing during upload. Upload progress and any file errors appear below the pad; successful images are also available in the uploaded media library.

```markdown
[Diagram width="half" height="360" align="right" wrap="true"]
flowchart LR
  A[Observe] --> B[Explain] --> C[Publish]
[/Diagram]

[Callout tone="note"]
Record the assumption behind the result.
[/Callout]
```

## Drafts and revisions

Editing a published article opens its working draft. **Save draft** saves proposed changes while leaving the live article unchanged. A Publisher or Owner uses **Publish changes** to make the reviewed draft public. Writers can save the draft but cannot publish it.

To unpublish a live post, a Publisher or Owner opens **Post options (⋯) → Post details** and chooses **Unpublish**. This removes public access and keeps the working content as a private draft for the publication team. The post remains live until that action succeeds. Archiving and restoring drafts also use explicit action labels.

Manage newsletter signups, article comments, passage questions, and private reader notes in **Readers → Settings**. **Comments & questions** controls both with one Open, Closed, or Hidden mode. Closed and hidden conversations are omitted from public articles; opening them also requires configured spam protection. **Readers → Conversations** is the shared moderation inbox; **Readers → Subscribers** shows subscription status. Email delivery and spam protection now live under Readers. Blog designer keeps the visual controls for comments.

- Edits are backed up to this browser after an 800 ms pause. Local recovery does not sync between devices or create server revisions.
- **Save draft** creates a server revision and clears the local backup; publishing is a separate action.
- **Revision history** shows previous versions, authors, additions and removals. Load an older version into the editor, review it, then save.
- Concurrent saves open a conflict review without discarding your edits. This is revision-based protection, not live co-editing.
- Saved changes from the CLI, API, or another editor update the open article through SSE as soon as the save commits. SQLite uses server notifications; PostgreSQL uses LISTEN/NOTIFY across server instances. No content polling is used. If you have unsaved edits, a **Review changes** notice keeps your draft intact and opens the existing conflict comparison. Updates wait while a dialog or save is in progress. Reconnecting catches up with the latest revision; deletion leaves your editor content available to copy. These updates follow saved revisions.
- Agents must pass the revision they reviewed when changing a post. Use a separately named token for each agent. See [the CLI guide](../cli/README.md).

## Appearance and discovery

Set an article cover in **Post details → Cover media**. Choose an image, audio player, or video. **Video cover** lets you upload an MP4 or WebM, select an existing upload, or paste a supported video link; the article opening plays it on request. **Media library** offers uploaded images and Cloudinary images or video still frames. Selecting a Cloudinary still frame uses its middle frame as an image. The writing pad shows the selected cover immediately; the preview follows **Design → Articles → Show cover**. Save the post to apply your selection.

Set your domain, logo and typography in Settings and Blog Designer. Configure DNS and HTTPS before saving a custom domain. Blog and post SEO settings allow separate search titles, descriptions and sharing images; images can be uploaded or selected from the media library.

Search covers saved titles, tags, excerpts and full content, with independent word matching, typo tolerance and relevance ranking. Public search excludes drafts. Matching words are highlighted.

Turn off **Show comments** to omit the entire comments section. Closing new submissions can instead leave approved comments visible.

## Helping readers continue

Related content can show recent posts, use AI to find relevant posts, or use up to two posts you select. An empty manual selection hides the section. AI recommendations require the optional Margin account feature; no provider setup is needed.

Readers can subscribe through RSS at `/rss.xml`. The **Save** menu at the end of a published article offers Markdown download and **Download as PDF**, which opens the browser’s print dialog on a clean print view. Choose **Save as PDF** there. Print expands tabbed content; interactive visuals retain readable source.

Article SEO, Open Graph, Twitter, and structured-data descriptions use the explicit post SEO description, then the excerpt, then up to 320 characters of readable article text. Articles without readable text use their title. These fallbacks also appear in the editor’s search preview and reading view; they do not change your saved excerpt or SEO fields.

RSS items include the full article and a separate summary. The summary uses your excerpt, then your SEO description if no excerpt is set, then up to 320 characters of readable article text. The feed identifies Margin as its generator, and the public blog footer includes a **Powered by Margin** link.

For publication-wide SEO, open **Settings → Blog SEO** (or **Configure blog SEO** in General settings). Set your homepage search title, blog meta description, default sharing image, search indexing, and Google site verification. The blog meta description also describes the RSS feed. Individual post SEO remains in the writer’s post settings.

## Optional AI assistance

Open **Writing assistant → Chat** to talk through an idea, ask a question or develop an outline. Send a message with **Enter**; use **Shift+Enter** for a new line. Replies stay together in this draft’s conversation. Each message includes the current title and draft, including unsaved edits. Selected text gives the assistant a passage to focus on. Long drafts use an excerpt from the beginning and end, up to 40,000 characters, and selected passages up to 12,000. The assistant can use a shorter excerpt when the combined context reaches the service limit. **Context options** lets you choose a planning mode or describe your audience.

In **Writing assistant → Chat**, choose **Create a 3D animation** or describe the animation in a message. For example, ask “Show a wheel rolling forward and returning to its starting point.” Select **Preview animation**, then **Play animation**. **Copy animation** copies the complete `[Scene]` block. Paste it on a new line in the Writer’s Pad. The scene uses built-in geometry and keyframes and travels with the Markdown.

On desktop, opening **Writing assistant** closes the left navigation so the assistant and the writing pad can sit side by side. Use **Open navigation** if you need it while writing. Closing the assistant restores the navigation to how you left it before opening the assistant.

Check **Research mode** to ask for papers or save a source or private thinking note. For example: “Find a paper about small sample sizes and save the original paper to this draft.” Replies show source cards with links to the publication. **Save source** keeps it with the draft; **Insert citation** adds a citation to the writing pad. Select **Use for research** to include that source in a later request. **Research library** is a review view for saved sources and notes, plus notebook attachments. Find publications, save source URLs and keep thinking notes by asking in the chatbox; the library has no separate entry forms. Turning Research mode off leaves the conversation readable.

Ask a follow-up in the same message box. **Writing suggestions** can be expanded to keep an insight with one click or ask about a specific suggestion. Failed requests keep your message for retrying. **Saved insights** holds private notes you chose to keep; the chat itself lasts for the current workspace session.

To use a website as a reference, paste its public HTTPS URL directly into the brief and ask the assistant to read it. This works for documentation and HTML research articles. The agent can call `read_url` for up to three URLs explicitly supplied in that brief. It reads bounded page text in memory, without browser automation, JavaScript, file downloads, attachments, cookies, or saved source files. Private-network addresses and redirects to them are blocked. PDF and other file URLs, download responses, oversized pages, and pages requiring sign-in or JavaScript are unavailable. Website text is treated as untrusted evidence, and the assistant is instructed to cite the source URL and acknowledge failed reads. Existing notes and copying controls are unchanged. This requires the updated Margin Central service and hosted AI Unified App version 1.1.0.

AI can also create images and social drafts for review. All AI requests use Margin's managed service and applicable account plan. Publishing a post does not automatically send a newsletter or publish to social accounts.

Publication colors are available in **Design → Homepage** and **Design → Articles**. Set the background, text, and link/accent colors, then save the design. Homepage colors apply to the homepage; article colors apply to articles and the writer preview. Automatic image/video borders apply to covers and media without an explicit frame. Use `frame="auto"` (or omit `frame`) to follow the publication design; `frame="plain"`, `frame="border"`, and `frame="polaroid"` override it for that item. Media insertion defaults remain available under **Media → Defaults**.

Under **Post details → SEO & sharing → Search indexing**, `noindex` requests removal of an individual post from search results, while `nofollow` asks crawlers not to follow its links. Both are optional and unchecked for existing posts. Save or publish the post to apply them. Blog-wide indexing restrictions take precedence. These controls do not make a published post private: it remains readable and available to subscribers. Noindex posts are omitted from the sitemap. HTML, readable HTML, Markdown, and print views honor the directives; RSS and aggregate text exports use the most restrictive directives of their included posts.

The homepage automatically includes linked `WebSite` and `CollectionPage` JSON-LD entities using your publication name, SEO title and description, public URL, and sharing image when configured. Individual articles retain their publication-type schema. These follow [Schema.org’s WebSite vocabulary](https://schema.org/WebSite) and [Google’s robots directive specification](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).

In **Design → Homepage**, edit **Homepage tagline** to replace the small label above the welcome headline, or turn off **Homepage tagline** to remove it and its dot. In the same panel, customize **Footer title** or turn off **Footer title** on all public pages. Blank text uses the publication-type label or publication name. Save the design to apply these settings.

### Social posts

Paste a public X, Instagram post or reel, or LinkedIn post URL in its own paragraph to show a link card. Readers can open the original or choose **Load embed**. No social platform is contacted until they load the embed. Inline links and URLs in code stay unchanged.

Use `/social` in the editor to insert a card with your own title:

```markdown
[Social url="https://x.com/username/status/123456789" title="A useful discussion"]
```

Use the full post URL, not a profile or shortened share link. Embedding depends on the original post being public and its author allowing embeds. The original link remains available alongside an embed. Cards are also readable links in RSS, print/PDF, and downloaded Markdown; they do not copy or archive the social post’s text or media.

Homepage pagination is configured in **Blog designer → Homepage → Homepage pagination**. New and existing blogs default to **10 posts per page** with numbered page links. Choose **Load more button** to append another batch, or set any whole-number page size from 1 to 100. Search and topic filters cover the whole publication and restart at the first page. Numbered page links can be bookmarked and work without JavaScript; Load more falls back to ordinary page links without JavaScript.

The workspace post list and manual related-post picker request pages from the server. The list defaults to ten posts per page and remembers the selected page size on the device; the picker shows ten at a time. The navigation sidebar fetches only the three most recently edited posts and has no pagination controls. Search covers all matching posts on the server and returns only the requested result page. Saving or deleting a post refreshes the affected lists and totals. The paginated workspace API is `GET /api/posts/page`, with `page`, `pageSize` (1–100), optional `q`, and `status` parameters. Existing array-based post endpoints remain available for API compatibility; workspace screens no longer use them to fetch the full collection.

### Featured articles

In **Post details → Details**, enable **Feature on homepage**, then save the post.
Published featured articles appear in a separate section above the regular feed on
every homepage page. Drafts and archived articles remain private. Search and topic
filters apply to both the featured section and the regular feed.

In **Designer → Homepage → Homepage pagination**, use **Also include featured
articles in the regular list** to choose whether featured articles may also appear
in the paginated feed. This is off by default, avoiding duplicates. The featured
section does not consume regular page slots. With it on, featured articles also
count toward the normal feed totals and page size. The JSON setting is
`homepage.featured.includeInFeed`.

API clients can set `featured: true` or `featured: false` when creating or updating
a post. Updates still require the current revision; omitting the flag preserves it.
Use `fields=featured,title` to select it in API responses. The usual role permissions
apply: changing a published article requires Publisher or Owner access. The public
homepage API returns `featured` separately from its paginated `posts` array.


Page templates also control structure. In **Customize**, use the inner **Layout**, **Content**, and **Style** tabs. Layout combines a homepage list, grid, or magazine feed with a top, centered, or sidebar introduction. Article openings can place the cover before the title, beside it, after it, or use a centered title. Missing covers fall back to a complete text opening; narrow screens stack columns. Content controls copy and visibility; Style controls type, colors, borders, and corners. Changes remain local until **Save design**.

The JSON fields are `homepage.feed.layout` (`list`, `grid`, `magazine`), `homepage.hero.layout` (`split`, `centered`, `sidebar`), and `article.header.layout` (`standard`, `cover-first`, `split`, `centered`). Existing configs without the new fields retain their original structure. **Explore layout** opens a scrollable desktop/mobile preview; **Use & customize** selects it and opens Layout controls.

Engines supporting component templates request Central catalog schema version 5 on entry to templates. Central continues serving older schema versions to older engines. Neither selecting an inner Customize tab nor editing a setting triggers a Central check.


**Open preview** in Customize opens the current unsaved design at full size, with desktop/mobile views and navigation between homepage, article, guide, and comments. It loads published posts from the local publication’s public endpoints; choose an article to load its full body and approved comments, or open a story from the homepage preview. Drafts and archived posts are excluded. Empty publications show an empty state, and failed reads offer Retry. Previewing never saves the design, edits posts, or submits reader interactions. Apply pending JSON edits before opening a new preview. Template gallery thumbnails illustrate layouts with sample stories; **Explore layout** uses your published content.


In **Homepage → Customize → Layout**, **Homepage sections** lets you independently hide the feed heading, post count, topic filters, search bar, or featured section. Put search beside the topics or across the full width above or below them. Move featured stories before or after the main feed. Hiding the featured section keeps those posts in the main feed, regardless of the separate “Also include featured” setting. Active search/topic links still work when their controls are hidden; **Clear filters** remains available.

Mix these choices with open, outlined, or filled story cards; landscape, square, or portrait images; two or three grid columns; and optional list numbers. Columns stack on small screens. **Style** adds an independent heading typeface, heading size, and spacing. Article Style also controls reading-column width, body size, line spacing, section headings, and quotes. The desktop/mobile preview and public server-rendered page use the same presentation settings.

These presentation overrides are optional. Both sections expose `style.typography.headingFont`, `style.typography.headingSize` (`standard`, `compact`, `display`), and `style.spacing` (`standard`, `compact`, `airy`). On the homepage, `search` controls position; `featured` controls position and inclusion in the feed. Omit either object to hide that feature. The `feed` object groups heading/count visibility, topic filters, numbers, columns, pagination, and `cards` appearance. Article reading options live inside `article.body`: `size`, `lineSpacing`, `measure`, `headings`, and `quotes`. Autocomplete describes the supported values for each field. Omitting these overrides retains the original appearance. Selecting a template replaces presentation choices while retaining your copy, posts, and pagination.


Content templates use catalog schema version 5. A catalog’s `content` entries contain `designs` keyed by `article` and/or `guide`; only declared targets are offered in their galleries. Each target has its own validated formatting configuration. Writing outlines declare `supportedContentTypes`; older outlines without that field remain article-only. Older catalogs remain readable, and bundled guide templates remain available when an older Central catalog is returned.

Saved design JSON contains independent `article` and `guide` objects using the same supported header, body, and style options. Missing guide configurations use their built-in defaults without changing the article appearance. New combinations of supported formatting can be distributed as JSON templates; a new interactive capability still needs an engine implementation.
