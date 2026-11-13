import { build } from "esbuild";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultTheme, type Post } from "../shared/types";
import type { ReviewVisit } from "./review/types";

test("peer review shows private changes, approval eligibility and consent separately from publication", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".peer-review-test-"));
  try {
    const outfile = path.join(dir, "ui.mjs");
    await build({
      stdin: {
        contents: `export {default as ReviewDraft} from "./src/review/ReviewDraft"; export {default as AuthorReviews} from "./src/review/AuthorReviews"; export {default as ReviewerPage} from "./src/review/ReviewerPage"; export {default as AddressReviewNote} from "./src/review/AddressReviewNote"; export {ReviewNoteComposer} from "./src/review/ReviewPassages"; export {default as ReaderDialog} from "./src/blog/ReaderDialog";`,
        resolveDir: process.cwd(),
        loader: "ts",
      },
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      packages: "external",
      jsx: "automatic",
      loader: { ".css": "empty" },
    });
    const { ReviewDraft, AuthorReviews, ReviewerPage, AddressReviewNote, ReviewNoteComposer, ReaderDialog } = await import(
      pathToFileURL(outfile).href
    );
    const post: Post = {
      id: "draft",
      slug: "draft",
      title: "Field notes",
      content: "The estimate changed.",
      excerpt: "",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-02",
      status: "draft",
      tags: [],
      cover: "",
      seo: { title: "", description: "", image: "" },
      revision: "after",
    };
    const visit: ReviewVisit = {
      post,
      previous: { ...post, revision: "before", content: "Our first estimate." },
      notes: [
        {
          id: "n",
          body: "Double-check the estimate.",
          quote: "estimate",
          occurrence: 0,
          revision: "before",
          addressed_revision: "",
        },
      ],
      status: "In review",
      badgeName: "",
      canApprove: false,
      name: "Reviewer",
    };
    const render = (v: ReviewVisit) =>
      renderToStaticMarkup(
        createElement(ReviewDraft, {
          visit: v,
          theme: defaultTheme,
          path: "/public/reviews/only-this",
          loading: false,
          failure: null,
          refresh: async () => {},
          mutate: async () => {},
        }),
      );
    const review = render(visit);
    assert.match(review, /Changes since your last visit/);
    assert.match(review, /class="margin-accordion peer-changes"/);
    assert.match(review, /Double-check the estimate/);
    assert.match(
      review,
      /<button[^>]*disabled=""[^>]*>[^]*?Approve this revision<\/button>/,
    );
    assert.doesNotMatch(review, /<input type="checkbox"[^>]*checked/);
    const approved = render({
      ...visit,
      previous: null,
      status: "Approved",
      canApprove: true,
      badgeName: "Reviewer",
      notes: [{ ...visit.notes[0], addressed_revision: "after" }],
    });
    assert.match(approved, /Addressed · View revision after/);
    assert.match(approved, /<details class="margin-accordion"><summary><span>Addressed/);
    assert.match(approved, /Update approval/);
    assert.match(approved, /<input type="checkbox"[^>]*checked/);
    assert.doesNotMatch(
      approved,
      /Changes since your last visit|Approval is available once/,
    );
    const gate = renderToStaticMarkup(
      createElement(ReviewerPage, { invite: "only-this", theme: defaultTheme }),
    );
    assert.match(gate, /Opening invitation/);
    assert.doesNotMatch(
      gate,
      /Field notes|Double-check the estimate|Approve this revision/,
    );
    const unsaved = renderToStaticMarkup(
      createElement(AuthorReviews, { post: { ...post, id: "" } }),
    );
    assert.match(unsaved, /Save a draft to invite a reviewer/);
    assert.doesNotMatch(unsaved, /type="email"/);
    assert.match(unsaved, /class="empty"/);
    const empty = render({ ...visit, notes: [] });
    assert.match(empty, /class="empty"[^]*No review notes yet/);
    const picker = renderToStaticMarkup(createElement(AddressReviewNote, { path: "/notes/n", busy: false, address: async () => {} }));
    assert.match(picker, /class="margin-accordion"><summary><span>Choose fixing revision/);
    const composer = renderToStaticMarkup(createElement(ReviewNoteComposer, { anchor: { quote: "Selected passage", occurrence: 0, top: 0, left: 0 }, close: () => {}, saveNote: async () => {} }));
    assert.match(composer, /class="passage-dialog passage-modal-sheet"/);
    assert.match(composer, /Selected passage/);
    assert.match(composer, /Save review note/);
    const saving = renderToStaticMarkup(createElement(ReaderDialog, { open: true, title: "Review note", dismissDisabled: true, onClose: () => {}, children: "Saving…" }));
    assert.match(saving, /aria-label="Close" disabled=""/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
