import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp,rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Bundle TSX with CSS omitted so the real public components can be rendered in Node.
test("canonical public design renders each section and preserves content visibility", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".renderer-test-"));
  try {
    const outfile = path.join(dir, "renderer.mjs");
    await build({
      stdin: {
        contents:
          'export { default as GuideStepReport } from "./src/blog/GuideStepReport"; export { CommentFields } from "./src/blog/CommentFields"; export { availableInteractions, canAnnotate } from "./shared/interactions"; export { PassageActions, PassageActivity, highlightAt } from "./src/blog/PassageInteractions"; export { default as PassageNotes } from "./src/blog/PassageNotes"; export { default as ReadPostLink } from "./src/admin/ReadPostLink"; export * from "./src/PublicBlog"; export * from "./shared/types"; export { default as RelatedPosts } from "./src/blog/RelatedPosts"; export { default as HomepageArtwork } from "./src/blog/HomepageArtwork";',
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      loader: { ".css": "empty", ".svg": "dataurl" },
      outfile,
      jsx: "automatic",
    });
    const {
      GuideStepReport,
      ReadPostLink,
      CommentFields,
      PassageActions,
      highlightAt,
      PassageNotes,
      PassageActivity,
      availableInteractions,
      canAnnotate,
      HomepageArtwork,
      RelatedPosts,
      BlogHomepage,
      BlogArticle,
      PublicBlog,
      CommentsView,
      PublicComments,
      BlogFrame,
      blogThemeStyle,
      safeLogoUrl,
      defaultTheme,
    } = await import(pathToFileURL(outfile).href);
    const theme = structuredClone(defaultTheme);
    const existingReaderFields = renderToStaticMarkup(createElement(CommentFields, {
      design: theme.comments,
      values: {name: "Alex", email: "", body: ""},
      hideEmail: true,
      hideName: true,
    }));
    assert.doesNotMatch(existingReaderFields, /<input/);
    assert.match(existingReaderFields, /<textarea/);
    const firstReaderFields = renderToStaticMarkup(createElement(CommentFields, {
      design: theme.comments,
      values: {name: "", email: "", body: ""},
      hideEmail: true,
    }));
    assert.match(firstReaderFields, /autoComplete="name"/);
    assert.match(firstReaderFields, /Choose once/);

    assert.deepEqual(Object.keys(theme).sort(), [
      "accent",
      "article",
      "background",
      "comments",
      "description",
      "footerBackground",
      "footerDescription",
      "footerFont",
      "footerLayout",
      "footerLinks",
      "footerText",
      "footerTitle",
      "homepage",
      "imageBorder",
      "logo",
      "name",
      "publicationType",
      "showFooterLogo",
      "showFooterTitle",
      "text",
      "videoBorder",
    ]);
    assert.equal("showDate" in theme.article, false);
    assert.equal("title" in theme.comments, false);
    const sample = {
      id: "one",
      title: "Visible story",
      slug: "visible",
      excerpt: "Story introduction",
      tags: ["Making"],
      cover: "https://example.com/cover.jpg",
      status: "published",
      content: "Hello **world**",
      createdAt: "2026-10-13T12:00:00Z",
      updatedAt: "2026-10-13T12:00:00Z",
    };
    theme.homepage = {
      ...theme.homepage,
      title: "Custom welcome",
      layout: "grid",
      showImages: false,
      showDates: false,
      showExcerpts: false,
      showArtwork: false,
    };
    const homepage = renderToStaticMarkup(
      createElement(BlogHomepage, {
        theme,
        posts: [
          sample,
          { ...sample, id: "draft", title: "Secret draft", status: "draft" },
        ],
      }),
    );
    assert.match(homepage, /Custom welcome/);
    assert.match(homepage, /journal-layout-grid/);
    assert.doesNotMatch(
      homepage,
      /Secret draft|<time|<img|Story introduction|class="journal-art"/,
    );
    theme.article = {
      ...theme.article,
      showDates: false,
      showTags: false,
      showCover: false,
      showExcerpt: false,
    };
    const article = renderToStaticMarkup(
      createElement(BlogArticle, { theme, post: sample }),
    );
    assert.match(article, /<strong>world<\/strong>/);
    assert.match(article, /href="\/posts\/visible.md\?download=1" download="visible.md"/);
    assert.match(article, /href="\/post\/visible\/print\?download=pdf"/);
    assert.match(article, /<details class="article-downloads"><summary aria-label="Save this post">/);
    assert.match(article, /Download Markdown/);
    assert.match(article, /class="article-share-button"/);
    const sharingArticle = renderToStaticMarkup(createElement(BlogArticle, {
      theme: { ...theme, publicUrl: "https://example.com/journal" }, post: sample,
    }));
    assert.equal((sharingArticle.match(/href="https:\/\/substack.com\/notes"/g) || []).length, 2);
    assert.match(sharingArticle, /Share a note · paste the article link/);
    assert.match(sharingArticle, /https%3A%2F%2Fexample.com%2Fjournal%2Fpost%2Fvisible/);

    const coloredTheme = { ...theme, background: "#17212b", text: "#edf2f7", imageBorder: "bold", videoBorder: "none" };
    const coloredStyle = blogThemeStyle(coloredTheme);
    assert.equal(coloredStyle["--blog-background"], "#17212b");
    assert.equal(coloredStyle["--blog-text"], "#edf2f7");
    assert.equal(coloredStyle["--image-border-width"], "2px");
    assert.equal(coloredStyle["--video-border-width"], "0px");
    const framedArticle = renderToStaticMarkup(createElement(BlogArticle, {
      theme: coloredTheme,
      post: { ...sample, content: '[Image src="https://example.com/auto.png"]\n\n[Image src="https://example.com/plain.png" frame="plain"]\n\n[Video src="https://example.com/movie.mp4" frame="border"]' },
    }));
    assert.match(framedArticle, /md-frame-auto/);
    assert.match(framedArticle, /md-frame-plain/);
    assert.match(framedArticle, /md-frame-border/);
    const readLink = renderToStaticMarkup(createElement(ReadPostLink, { post: sample }));
    assert.match(readLink, /href="\/post\/visible" target="_blank"/);
    assert.match(readLink, /Read Visible story/);
    const draft = { ...sample, status: "draft" };
    assert.equal(renderToStaticMarkup(createElement(ReadPostLink, { post: draft })), "");
    const draftPreview = renderToStaticMarkup(createElement(PublicBlog, {
      theme, post: draft, preview: true,
    }));
    assert.match(draftPreview, /Draft preview/);
    assert.match(draftPreview, /<strong>world<\/strong>/);
    assert.doesNotMatch(draftPreview, /public-comments|newsletter-signup|article-share-button|article-downloads/);

    assert.doesNotMatch(renderToStaticMarkup(createElement(BlogArticle, { theme, post: draft })), /article-share-button|article-downloads/);
    assert.match(article, /Download as PDF/);
    assert.match(article, /\/post\/visible\/print\?download=pdf/);
    assert.doesNotMatch(article, /<time|<img|article-tags|Story introduction/);
    const related = renderToStaticMarkup(createElement(RelatedPosts, { theme, posts: [sample, { ...sample, id: "two", slug: "next-story", title: "Next story" }] }));
    assert.match(related, /aria-label="Recommended posts"/);
    assert.match(related, /href="\/post\/visible"/);
    assert.match(related, /href="\/post\/next-story"/);
    assert.equal(renderToStaticMarkup(createElement(RelatedPosts, { theme, posts: [] })), "");
    for (const [type, singular, plural] of [["blog", "post", "posts"], ["article", "article", "articles"], ["research", "paper", "papers"]]) {
      const typedTheme = { ...theme, publicationType: type };
      const home = renderToStaticMarkup(createElement(BlogHomepage, { theme: typedTheme, posts: [sample] }));
      assert(home.includes(`All ${plural}`));
      assert(home.includes(`placeholder="Find a ${singular}…"`));
      assert(home.includes(`Read ${singular}`));
      assert(!home.includes("Read story"));
      const empty = renderToStaticMarkup(createElement(BlogHomepage, { theme: typedTheme, posts: [] }));
      assert(empty.includes(`The first ${singular} is still`));
      const typedArticle = renderToStaticMarkup(createElement(BlogArticle, { theme: typedTheme, post: sample }));
      assert(typedArticle.includes(`All ${plural}`));
      assert(typedArticle.includes(`Save this ${singular}`));
      const recommendations = renderToStaticMarkup(createElement(RelatedPosts, { theme: typedTheme, posts: [sample] }));
      assert(recommendations.includes(`Read ${singular}`));
    }
    theme.comments = {
      ...theme.comments,
      enabled: true,
      heading: "Your thoughts",
      showAvatars: false,
      showDates: false,
      layout: "cards",
      background: "#111111",
    };
    const comments = renderToStaticMarkup(
      createElement(
        CommentsView,
        {
          theme,
          comments: [
            {
              id: "one",
              name: "Reader",
              body: "An approved thought",
              createdAt: sample.createdAt,
            },
          ],
        },
        createElement("form"),
      ),
    );
    assert.match(comments, /id="comments"/);
    assert.match(comments, /Your thoughts/);
    assert.match(comments, /An approved thought/);
    assert.match(comments, /--comment-ink:#f5f5f5/);
    assert.match(comments, /<form/);
    assert.doesNotMatch(comments, /<time|reader-avatar/);
    assert.match(renderToStaticMarkup(createElement(PublicComments, {theme, postId: "one", siteKey: ""})), /id="comments"/);
    assert.match(renderToStaticMarkup(createElement(PublicComments, {theme, postId: "one", siteKey: "site"})), /id="comments"/);
    const passageComments = renderToStaticMarkup(createElement(CommentsView, {
      theme,
      comments: [
        {id: "ordinary", name: "Reader", body: "An ordinary comment", createdAt: "2026-10-23"},
        {id: "question", name: "Another reader", body: "How does this work?", quote: "One capability, every caller.", answer: "Here is how it works.", anchor_status: "active", createdAt: "2026-10-24"},
        {id: "edited", name: "Reader", body: "Earlier question", quote: "The original words", anchor_status: "detached", createdAt: "2026-10-24"},
      ],
    }));
    assert.match(passageComments, /An ordinary comment/);
    assert.match(passageComments, /On this passage/);
    assert.match(passageComments, /One capability, every caller/);
    assert.match(passageComments, /How does this work/);
    assert.match(passageComments, /<strong>Author<\/strong><span> replied<\/span>/);
    assert.match(passageComments, /Here is how it works/);
    assert.match(passageComments, /Original passage · text has changed/);
    assert.doesNotMatch(passageComments, /Questions \(|Select text to/);
    theme.comments.enabled = false;
    assert.equal(renderToStaticMarkup(createElement(CommentsView, {theme, comments: []})), "");
    assert.equal(renderToStaticMarkup(createElement(PublicComments, {theme, postId: "one", siteKey: "site"})), "");
    theme.comments.enabled = true;
    theme.comments.visible = false;
    assert.equal(renderToStaticMarkup(createElement(CommentsView, { theme, comments: [{ id: "hidden", name: "Reader", body: "Private comment" }] }, createElement("form"))), "");
    const storedInteractions = { enabled: true, questionMode: "open", notesEnabled: false, subscriber: false, questions: [{id: "saved", body: "Saved question"}] };
    for (const state of [
      { visible: false, enabled: true, captchaSiteKey: "site" },
      { visible: true, enabled: false, captchaSiteKey: "site" },
    ]) {
      const gatedTheme = { ...theme, captchaSiteKey: state.captchaSiteKey, comments: {...theme.comments, visible: state.visible, enabled: state.enabled} };
      const data = availableInteractions(storedInteractions, gatedTheme);
      assert.equal(data.questionMode, "hidden");
      assert.deepEqual(data.questions, []);
      assert.equal(canAnnotate(data), false);
      const actions = renderToStaticMarkup(createElement(PassageActions, {data, quote: "Selected passage", menuTop: 0, open() {}, dismiss() {}}));
      assert.doesNotMatch(actions, /Selected text|Ask a question|Questions \(/);
      const notes = availableInteractions({...storedInteractions, notesEnabled: true}, gatedTheme);
      assert.equal(canAnnotate(notes), true);
      const notesActions = renderToStaticMarkup(createElement(PassageActions, {data: notes, quote: "Selected passage", menuTop: 0, open() {}, dismiss() {}}));
      assert.match(notesActions, /Selected passage actions/);
      assert.match(notesActions, /> Note<\/button>/);
      assert.doesNotMatch(notesActions, /Private note|Public note/);
      assert.doesNotMatch(notesActions, /Ask a question/);
    }
    const openData = availableInteractions(storedInteractions, {...theme, comments: {...theme.comments, visible: true, enabled: true}, captchaSiteKey: "site"});
    const citationOnly = renderToStaticMarkup(createElement(PassageActions, {data: {enabled: false, questionMode: "hidden", notesEnabled: false, subscriber: false, questions: []}, quote: "Selected passage", menuTop: 0, open() {}, dismiss() {}, onCite() {}}));
    assert.match(citationOnly, /Create citation/);
    assert.doesNotMatch(citationOnly, /Ask a question|> Note<\/button>|React ❤️/);
    assert.equal(canAnnotate(openData), true);
    const idleActions = renderToStaticMarkup(createElement(PassageActions, {data: openData, quote: "", menuTop: 0, open() {}, dismiss() {}}));
    assert.doesNotMatch(idleActions, /Select text|Questions \(/);

    assert.match(renderToStaticMarkup(createElement(PassageActions, {data: openData, quote: "Selected passage", menuTop: 0, open() {}, dismiss() {}})), /Ask a question/);
    const reactionActions = renderToStaticMarkup(createElement(PassageActions, {data: {...openData, reactionsEnabled: true}, quote: "Selected passage", menuTop: 0, open() {}, dismiss() {}, react() {}}));
    assert.match(reactionActions, /role="group" aria-label="Choose a reaction"/);
    assert.match(reactionActions, /React ❤️/);
    const bothNotes = renderToStaticMarkup(createElement(PassageActions, {data: {...openData, notesEnabled: true}, quote: "Selected passage", menuTop: 0, open() {}, dismiss() {}}));
    assert.equal((bothNotes.match(/> Note<\/button>/g) || []).length, 1);
    assert.doesNotMatch(bothNotes, /Private note|Public note/);
    const highlights = [
      {quote: "A longer highlighted passage", rects: [{left: 0, top: 0, width: 100, height: 20}]},
      {quote: "passage", rects: [{left: 40, top: 0, width: 40, height: 20}]},
    ];
    assert.equal(highlightAt(highlights, 50, 10)?.quote, "passage");
    assert.equal(highlightAt(highlights, 10, 10)?.quote, "A longer highlighted passage");
    assert.equal(highlightAt(highlights, 150, 10), null);
    const privateTools = renderToStaticMarkup(createElement(PassageActions, {data: {...openData, questionMode: "hidden", notesEnabled: true}, quote: "", menuTop: 0, open() {}, dismiss() {}}));
    assert.match(privateTools, /Notes/);
    const signedIn = {reader: {name: "Alex", provider: "email"}, providers: [], loading: false, busy: false, message: "", signOut() {}};
    const noteProps = {postId: "one", revision: "rev", quote: "Selected passage", occurrence: 0, notesEnabled: true, auth: signedIn, publicationType: "blog", onSaved() {}};
    const noteComposer = renderToStaticMarkup(createElement(PassageNotes, noteProps));
    assert.match(noteComposer, /New note/);
    assert.match(noteComposer, /Save note/);
    assert.doesNotMatch(noteComposer, /public|Display name/i);
    const savedNotes = renderToStaticMarkup(createElement(PassageNotes, {...noteProps, quote: "", notesEnabled: false}));
    assert.match(savedNotes, /Private to you/);
    assert.doesNotMatch(savedNotes, /Add note|Public/);
    const noteLogin = renderToStaticMarkup(createElement(PassageNotes, {...noteProps, auth: {...signedIn, reader: null, providers: ["google"]}}));
    assert.match(noteLogin, /Continue with Google/);
    const guideReportProps = {step: {id: "section-start", title: "Start"}, postId: "guide", revision: "current", onBack() {}};
    const guideLogin = renderToStaticMarkup(createElement(GuideStepReport, {...guideReportProps, auth: {...signedIn, reader: null, providers: ["google"]}}));
    assert.match(guideLogin, /Continue with Google/);
    assert.match(guideLogin, /reader-auth-google/);
    assert.match(guideLogin, /Send sign-in link/);
    assert.doesNotMatch(guideLogin, /<dialog|passage-notes-sidebar/);
    const guideEmailOnly = renderToStaticMarkup(createElement(GuideStepReport, {...guideReportProps, auth: {...signedIn, reader: null, providers: []}}));
    assert.doesNotMatch(guideEmailOnly, /Continue with Google/);
    assert.match(noteLogin, /Send sign-in link/);
    const activityNotes = renderToStaticMarkup(createElement(PassageActivity, {quote: "Selected passage", occurrence: 0, initialSection: { entries: [{kind: "question", item: {id: "question", quote: "Selected passage", occurrence: 0, name: "Reader", body: "What does this mean?", answer: "It means this.", anchor_status: "active", createdAt: "2026-11-08", canReply: true, followups: [{id: "followup", body: "Can you explain more?", answer: "Of course.", approved: true, createdAt: "2026-11-09"}]}}], reactions: [] }, reactionsEnabled: true, onReact: async () => "Reaction added.", canAddNote: true, onAddNote() {}, postId: "one", onSaved() {}}));
    assert.match(activityNotes, /What does this mean\?/);
    assert.match(activityNotes, /It means this\./);
    assert.match(activityNotes, /Can you explain more\?/);
    assert.match(activityNotes, /Reply to writer/);
    assert.match(activityNotes, /Add reaction/);
    assert.match(activityNotes, /Add a note<\/button>/);
    assert.doesNotMatch(activityNotes, /Notes on this passage|Your private notes|<details/);
    const minimal = structuredClone(defaultTheme);
    Object.assign(minimal.homepage, { showHero: false, showSearch: false, showTopicFilters: false, showPostCount: false, showFeedHeading: false, showFeatured: false, showNumbers: false, cardStyle: "filled", imageRatio: "portrait", gridColumns: "three" });
    const minimalHome = renderToStaticMarkup(createElement(BlogHomepage, { theme: minimal, posts: [{ ...sample, featured: true }], preview: true }));
    assert.doesNotMatch(minimalHome, /journal-hero|journal-search|journal-tag-filters|journal-section-title|featured-posts/);
    assert.match(minimalHome, new RegExp(sample.title));
    assert.match(minimalHome, /data-card-style="filled"/);
    assert.match(minimalHome, /data-show-numbers="false"/);
    Object.assign(minimal.homepage, { showSearch: true, showTopicFilters: true, searchPosition: "above", showFeatured: true, featuredPosition: "after" });
    const composedHome = renderToStaticMarkup(createElement(BlogHomepage, { theme: minimal, posts: [sample, { ...sample, id: "featured", slug: "featured", title: "Featured story", featured: true }], preview: true }));
    assert.match(composedHome, /search-position-above/);
    assert.ok(composedHome.indexOf('class="journal-search"') < composedHome.indexOf('class="journal-tag-filters"'));
    assert.ok(composedHome.indexOf('class="featured-posts"') > composedHome.indexOf('journal-posts journal-layout-'));
    Object.assign(minimal.article, { headingFont: "plex-mono", bodySize: "large", lineSpacing: "compact", measure: "focused", headingStyle: "ruled", quoteStyle: "pull" });
    const customizedArticle = renderToStaticMarkup(createElement(BlogArticle, { theme: minimal, post: sample }));
    assert.match(customizedArticle, /data-measure="focused"/);
    assert.match(customizedArticle, /data-quote-style="pull"/);
    assert.match(customizedArticle, /--heading-font:&#x27;IBM Plex Mono/);
    assert.match(customizedArticle, /--body-size:20px/);
    assert.match(customizedArticle, /--body-leading:1.6/);

    theme.homepage.font = "caveat";
    theme.article.font = "sans";
    assert.match(blogThemeStyle(theme, "homepage")["--article-font"], /Caveat/);
    assert.match(blogThemeStyle(theme, "article")["--article-font"], /Inter/);
    theme.logo = "/api/public/logos/12345678-1234-1234-1234-123456789abc";
    assert.match(renderToStaticMarkup(createElement(HomepageArtwork, { theme })), /class="art-logo" src="\/api\/public\/logos\//);
    theme.homepage.artworkType = "emoji";
    theme.homepage.artworkEmoji = "🌿<script>";
    const emoji = renderToStaticMarkup(createElement(HomepageArtwork, { theme }));
    assert.match(emoji, /🌿&lt;script&gt;/);
    assert.doesNotMatch(emoji, /<img/);
    theme.homepage.artworkType = "image";
    theme.homepage.artworkImage = "https://images.example.test/art.png";
    assert.match(renderToStaticMarkup(createElement(HomepageArtwork, { theme })), /class="art-logo" src="https:\/\/images.example.test\/art.png"/);
    theme.homepage.artworkImage = "";
    assert.match(renderToStaticMarkup(createElement(HomepageArtwork, { theme })), /src="\/api\/public\/brand.svg"/);

    const frame = renderToStaticMarkup(
      createElement(BlogFrame, { theme }, "Stories"),
    );
    assert.match(frame, /class="blog-logo"/);
    assert.match(frame, /href="\/rss.xml"/);
    assert.doesNotMatch(frame, /feed.xml/);
    assert.match(homepage, /AN INDEPENDENT BLOG/);
    assert.match(frame, /class="footer-title">Margin/);
    theme.homepage.tagline = "Ideas <script>";
    theme.footerTitle = "Our <footer>";
    theme.footerDescription = "A closing <note>";
    theme.footerLinks = [{ label: "About us", url: "/about" }, { label: "Example", url: "https://example.test" }];
    theme.footerLayout = "centered";
    theme.footerBackground = "#112233";
    theme.showFooterLogo = true;
    assert.match(renderToStaticMarkup(createElement(BlogHomepage, { theme, posts: [] })), /Ideas &lt;script&gt;/);
    const customFooter = renderToStaticMarkup(createElement(BlogFrame, { theme }, "Stories"));
    assert.match(customFooter, /Our &lt;footer&gt;/);
    assert.match(customFooter, /A closing &lt;note&gt;/);
    assert.match(customFooter, /href="\/about"/);
    assert.match(customFooter, /data-layout="centered"/);
    assert.match(customFooter, /background-color:#112233/);
    assert.match(customFooter, /public-footer-brand/);
    theme.homepage.showTagline = false;
    theme.showFooterTitle = false;
    assert.doesNotMatch(renderToStaticMarkup(createElement(BlogHomepage, { theme, posts: [] })), /Ideas|live-dot|AN INDEPENDENT BLOG/);
    const hiddenFooter = renderToStaticMarkup(createElement(BlogFrame, { theme }, "Stories"));
    assert.doesNotMatch(hiddenFooter, /footer-title|Our &lt;footer&gt;/);
    assert.match(hiddenFooter, /Powered by/);
    assert.equal(safeLogoUrl(theme.logo), theme.logo);
    assert.equal(safeLogoUrl("/api/public/logos/../secret"), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
