---
name: margin-authoring
description: Write, revise, and publish articles in Margin, using citations, code, diagrams, charts, and layouts to improve reader understanding. Use for Margin posts and CLI/API/MCP authoring, not changes to the Margin application.
---

# Margin authoring

Make the article useful before choosing its presentation. Margin features should answer a reader's question, expose evidence, or make an example easier to follow. Do not turn an engineering article into a tour of Margin or require rich blocks in every post.

## Start from the reader and the evidence

Identify what the reader should understand or be able to do after reading, their assumed knowledge, and the source material available. For an existing post, read its argument and surrounding context before changing a passage. Preserve the author's voice and the requested editing scope.

Build around a concrete problem, an explanation of the mechanism, a worked example, and the conditions under which the conclusion holds. Adapt this shape to the article; a short correction does not need a new outline. Keep measured results, source-backed behavior, and illustrative examples distinct. Do not invent benchmarks, citations, or the author's experience.

For substantial engineering writing, the separately bundled `engineering-writing` skill provides a deeper editorial workflow when available. This skill also works alone: the reader should be able to trace each important claim to evidence and follow the explanation without interacting with a widget.

## Choose features by the job they do

Read [content formats](references/content.md) before authoring or changing a rich block. For a connected engine, `getAuthoringGuide` (`GET /api/public/authoring`) returns the version-matched guide, generated schemas, rules and examples; use it when the engine differs from the installed skill. Use the exact supported syntax; raw HTML, JavaScript, JSX, and arbitrary tag properties are not an extension mechanism.

| Reader need | Useful form | Editorial constraint |
| --- | --- | --- |
| Check a specific claim | Inline citation or ordinary source link | Cite the passage that supports the claim; retain qualifications. Use PDF pages or marked areas only when verified. |
| Follow a request or state transition | Mermaid sequence, flow, or state diagram | Match names to the prose and code. Explain the relevant branch or failure path; omit unrelated architecture. |
| Compare measured outcomes | Chart plus methodology and prose interpretation | Identify units, workload, statistic, baseline, and data source. Label illustrative data in the visible description. |
| Reproduce a technique | Language-tagged code fence | Explain inputs and observable output. Margin highlights code; it does not execute or validate it. |
| Choose among equivalent implementations | Tabs, such as Python and Go | Keep shared prerequisites and the main conclusion outside tabs. Sequential steps belong in reading order. |
| Notice a consequential condition | Note, tip, or warning callout | State the condition and its consequence. Repeated callouts weaken emphasis. |
| Compare two short artifacts | Columns or a captioned image | Preserve a sensible order when stacked on a narrow screen. Put long code and dense diagrams at full width. |
| Understand a spatial relationship | 3D scene | Use when geometry or spatial arrangement matters. A service topology usually needs a diagram. |

Prefer theme typography and ordinary Markdown unless custom styling has a clear editorial purpose. Do not add handwriting, highlights, tabs, galleries, or scenes simply because they are available.

## Compose a readable article

Store the title separately from the body; avoid repeating the same H1. Choose a title that names the engineering problem or result, and headings that advance the explanation.

Introduce each visual with the question it answers. Follow it with the observation the reader should take away and any limitation. Keep essential conclusions in prose: toggling a series, opening a tab, or orbiting a scene must not be required to discover the argument. Give images descriptive alt text, diagrams meaningful labels, and charts titles and units. Link the actual source or data where useful.

Start diagrams at full width with automatic height. Add a fixed height or wrapped layout only when it improves a checked composition; increasing the frame height does not make scaled labels larger. Use short labels and a meaningful accessible title and description where the diagram type supports them. Split an overcrowded diagram or use a simpler visual if its relationships cannot be read comfortably.

Citations support claims; they do not establish that code was tested or a performance improvement was measured. Do not upload private source documents merely to add citations. Referenced PDF uploads can become public when the post is published; use only sources intended for that audience.

## Review the reader's experience

Check the technical argument before polishing layout: does the example demonstrate the claim, do numbers agree with the data, and are limitations stated beside the relevant conclusion?

For diagram-heavy articles, use the [diagram preview workflow](references/preview.md). It includes an installed helper that captures the actual Margin renderer at desktop and phone widths. Keep a first draft, inspect every diagram's screenshots and rendered labels, repair the source, and recapture the final version. A successful render is not a readability or semantic check.

When preview access is available, inspect complex or interactive content in the editor at wide and narrow widths. At the initial zoom, read the diagram labels and check for clipped content and empty frames; valid syntax and absence of page overflow do not establish readability. Check code indentation, chart units and values, citation targets, and tab reading order. For changed rich content, inspect print or RSS output when available; these readers need the same explanation even where interactivity becomes source or static content. Fix rendering errors in the source. If preview access is unavailable, validate what can be checked locally and report the unverified rendering briefly outside the article; do not claim a visual review occurred.

## Save or publish within the requested scope

Read [the CLI workflow](references/cli.md) when using the CLI to read or write a Margin post. For API or MCP, follow the API workflow in [content formats](references/content.md) and the connected engine’s OpenAPI contract. It covers connection, search, line edits, whole-document replacement, and publication. Embedded references and helper scripts are available through `margin skills show margin-authoring --json`; installing the skill writes them to disk.

Keep a local Markdown draft until a destination is known. Creating a post defaults to draft. For an existing post, use its actual ID and the revision from the content you reviewed; a write to a published post changes live content immediately. On `REVISION_CONFLICT`, reread and reconcile rather than forcing the stale edit through. A request to draft does not authorize publication, and publishing does not send a newsletter.

Return the article or a link to the saved result, its confirmed draft/published status if saved, and any material verification gaps. Keep editorial notes outside the article unless the reader needs them.
