# Preview and repair diagrams

Use this workflow for new or substantially changed diagrams. Check the real Margin rendering: Mermaid parsing alone misses tiny text, hidden endings, and labels accidentally rendered as extra states. Prefer an available Margin editor preview. The local helper below provides repeatable screenshots without uploading a draft or connecting an account.

## Local setup

The installed skill includes `scripts/preview-diagrams.mjs`. It needs Node.js, a Margin source checkout with its documented npm dependencies installed, Playwright (or playwright-core), and a Chromium browser. The CLI can install the skill without these dependencies; only the preview helper needs them. It uses the checkout's actual renderer and fonts, rather than maintaining a second diagram implementation.

From the directory where you installed the skill:

```sh
node .agents/skills/margin-authoring/scripts/preview-diagrams.mjs \
  --repo /path/to/margin-checkout \
  --file article.md --out previews/first --title 'Article title'
```

Use the actual installed skill location if you selected another `--dir`. The output directory must be new, so each capture preserves its input and evidence. The helper resolves dependencies from `--repo`, not the current directory. If Playwright or Chromium lives elsewhere in your agent environment, supply the existing paths:

```sh
node /path/to/skill/scripts/preview-diagrams.mjs \
  --repo /path/to/margin-checkout --file article.md --out previews/revised \
  --playwright /path/to/playwright-package \
  --browser /path/to/chromium-executable
```

`--help` describes the flags. The helper downloads nothing, blocks HTTP(S) requests, uses a fresh browser profile, and does not modify the article. Source links and remote media are not verified. It captures the real Markdown/Diagram components in a neutral article shell; also check the actual editor/site layout when it differs. It does not certify screen-reader, RSS, or print behavior.

If a prerequisite is missing, first look for the environment's installed dependency/browser paths. Use the project's documented setup when installation is within scope. If a sandbox blocks the isolated browser, request the narrowly scoped execution permission through the environment's normal approval mechanism. Do not treat a sandbox failure as invalid Mermaid, change security settings to mask it, or bypass a denied action. Without a working preview, report the specific blocker outside the article and leave visual verification explicitly incomplete.

## Inspect, repair, recapture

1. Preserve the pre-preview draft. Run the helper before polishing the rest of a diagram-heavy article, while changing its visual structure is inexpensive.
2. Open **every** `diagram-N-1100.png` and `diagram-N-390.png` at native size. Read the labels at the initial Fit view. Check the complete beginning-to-end path, state/edge meaning, clipped endings, excessive blank space, and accessible title/description plus nearby prose. Do not approve a diagram based on the full-page thumbnail or the best-looking diagram in the pair.
3. Read `report.json` alongside the images. It records rendered label text, scaled font sizes, scrolling, errors, and the input hash. Text below 10 CSS pixels is a diagnostic prompt to inspect, not a universal accessibility threshold; larger text can still be unusable. Compare the rendered states and edges with the intended model. A parser can accept punctuation as new statements and produce an incorrect graph without an error.
4. Fix the cause in the article. Shorten labels and move endpoint details into prose; group shared transitions; change orientation or diagram type; split a crowded visual when the assignment permits. Preserve the actors, ordering, branches, and boundary conditions the reader needs. Increasing frame height does not enlarge scaled text. Automatic height still has a 640px content cap in the current renderer; a tall diagram may hide essential steps behind internal scrolling. Check the selected checkout because renderer behavior can change. Do not modify application CSS or use unsupported Mermaid configuration to make the draft pass.
5. Capture into a new output directory after changes, then reopen all affected desktop and phone crops. Confirm the final article matches the capture's `input.md` or `inputSHA256`. Keep a short note outside the article identifying the observed defect, the repair, and the final evidence. If no change was needed, record what was checked instead of inventing a repair.

Finish when both views communicate the intended relationships comfortably without requiring zoom or unexplained scrolling to discover an essential outcome. If a visual still fails, simplify it again or report the unresolved issue; do not claim it is ready. Exit 0 means captures completed, not that this editorial check passed. Exit 2 preserves evidence for rendering errors or a missing diagram; exit 1 indicates setup/execution failure.
