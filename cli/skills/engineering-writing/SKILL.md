---
name: engineering-writing
description: Write or substantively revise engineering blog posts, technical explainers, tutorials, and narrative engineering docs from code, research, or notes. Use for evidence-based technical writing and editorial review, not routine code edits or copy-only formatting changes. Works with any publishing destination.
---

# Engineering writing

Produce writing a technically literate reader can reason from, check, and use. Optimize for an accurate explanation and a coherent argument, not a professional-sounding surface. This workflow needs no publishing platform.

## Establish the article's purpose

Infer the audience, the reader's question, and the intended takeaway from the request and existing material. Ask only when a missing fact would materially change the work. For a substantial new article, form a short working brief: who it serves, what it explains, what it assumes, and what evidence supports it. Keep the brief internal unless the user asks to collaborate on it.

Choose the shape that fits the reader's task:

- **Explainer:** establish the mental model, trace one concrete case, then examine the boundary where the model stops being sufficient.
- **Tutorial:** state prerequisites and the target result, walk through reproducible steps, show a success check, and cover likely failures.
- **Design account:** explain the constraint, the alternatives actually considered, the choice, and the resulting tradeoffs. Do not invent a team's decision history.
- **Experiment or incident:** distinguish observations from explanations; show method or timeline, evidence, uncertainty, and what follows from the result.

Use these as reasoning aids, not mandatory section templates. Preserve a user's chosen format, length, and voice. For a narrow revision, improve the requested passage without rebuilding the article.

## Establish what can be claimed

Read the relevant implementation, tests, specifications, measurements, and source documents before describing their behavior. A README can explain intent; the implementation and observations establish what actually happens. Inspect the code paths that affect the central claim, including failure handling when relevant. Do not infer system-wide guarantees from one happy-path example.

For claims central to the argument, keep a lightweight working record of the claim, supporting source or artifact, and qualification. This can be notes rather than a separate deliverable. Distinguish:

- **Observed:** reproduced or measured under stated conditions.
- **Documented:** supported by a source you inspected, scoped to the relevant version or context.
- **Inferred:** your explanation of the evidence, with the reasoning made explicit.
- **Illustrative:** invented inputs or simplified examples used to teach, clearly identified where a reader could mistake them for results.

Use primary sources for external technical claims. Read the supporting passage rather than citing a search snippet. Place links close to the claims they support; use stable code permalinks for public articles when available. Keep local paths and internal source notes out of public prose. If a source cannot be checked, qualify, omit, or flag the specific claim for the author; do not invent support.

Check what each link actually establishes. A nearby function or a guard does not support a paragraph describing an entire read, transform, and write path. Link the relevant implementation ranges, split the claim, or narrow the wording. Prefer a few precise links to a citation after every sentence.

For performance claims, state the baseline, workload, environment, statistic, and measurement method needed to interpret the result. Preserve units, sample size or run count when known, and meaningful variability. Distinguish a relative change from an absolute difference, and a latency percentile from an average. A small benchmark does not establish production capacity or causality. If measurements are missing, describe the expected mechanism without fabricating a result.

## Build the explanation

Open with the concrete problem, surprising behavior, or result and enough context to show why it matters. Avoid generic industry history, unsupported urgency, and promises that exceed the evidence.

Arrange sections in the order a reader needs the ideas. Make the argument visible in the headings. Introduce terminology when it becomes necessary, use consistent names for the same component, and show the causal steps between a design choice and its consequence. Replace abstractions such as “improves scalability” with the actual mechanism and the condition under which it helps.

Use a running example where it reduces mental work. Trace input, state changes, output, and the relevant failure or boundary case. Bring code, evidence, and diagrams into the explanation where the reader needs them, then interpret what they show. Do not make the reader reverse-engineer a large pasted implementation.

Give alternatives a fair account under the same constraints. State costs and failure modes beside the choice they qualify. Conclude with what the reader can now do or decide, and when the approach applies; avoid repeating every heading or adding a generic call to action.

## Make examples earn their space

Use the smallest example that preserves the important behavior. Include language labels, relevant versions, setup, inputs, and expected outputs when the reader is meant to reproduce it. Make placeholders unmistakable. Mark pseudocode and omitted plumbing; keep correctness-critical error handling, cleanup, and concurrency semantics in executable examples.

Run examples or targeted checks in an appropriate local environment when feasible. Check the behavior that supports the claim, including the relevant failure path. Do not run destructive or production-affecting commands just to validate a tutorial. If execution is unavailable, review against the source and say what remains untested outside the finished article, unless that limitation matters to readers too. Never imply that a plausible snippet was executed.

Choose a visual only when it answers a question more clearly than prose: a sequence diagram for ordering, a state diagram for transitions, a table for comparable choices, or a chart for quantitative evidence. Label units and relationships and provide an explanation that survives without interaction. A diagram should agree with the code, not merely look architectural. Do not invent measurements to fill a chart.

## Edit for substance, then clarity

Review in this order, scaling effort to the requested change:

1. **Argument:** does the article answer its reader's question, and does every major section advance that answer? Remove detours or move optional depth after the main explanation.
2. **Technical accuracy:** trace important claims back to the exact supporting passage or code range; check code, arithmetic, units, versions, and terminology. Preserve conditions that make a statement true, such as output mode, permissions, configuration, and failure path. For API or CLI behavior, check the actual returned representation rather than inferring it from an internal value. Narrow conclusions that exceed the evidence and distinguish correlation from a causal explanation.
3. **Reader experience:** check that prerequisites arrive before use, examples connect to the prose, and an unfamiliar reader can follow the transitions. Test the likely point of confusion with a concrete example.
4. **Sentence quality:** use direct verbs and specific nouns. Remove inflated adjectives, repeated conclusions, canned transitions, and unsupported words such as “seamless,” “robust,” or “blazing-fast.” Keep qualifications that change the reader's interpretation; remove review-process commentary and disclaimers about claims the article never makes. An already hypothetical scenario rarely needs a second label explaining that it is illustrative. Vary sentence length naturally; retain technical detail that carries the explanation.

For example, replace “Our robust retry mechanism seamlessly guarantees delivery” with a scoped explanation such as “The worker retries timed-out requests. If a timeout occurs after the server commits, the retry can repeat the operation; an idempotency key lets the server recognize that duplicate.” Use this wording only if the implementation supports it. The improvement comes from explaining behavior and limits, not substituting less exuberant adjectives.

Preserve the author's perspective. Do not fabricate “we discovered,” production incidents, customer outcomes, quotations, or personal experience to make a draft feel authentic. Avoid imposing the same opening, section count, or conclusion on every article.

## Deliver the work

Return the complete requested article or revision in the established format and destination. Keep research notes and editorial commentary outside the body unless requested. For review-only requests, give prioritized, passage-specific findings and concrete fixes rather than silently rewriting the whole document.

Mention only material open questions and verification gaps. A polished draft with an unsupported central claim is not ready: resolve it, narrow the claim, or identify the missing evidence plainly. Saving or publishing follows the user's request and the destination's tools; writing an article does not itself authorize publication.
