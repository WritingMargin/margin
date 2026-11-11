import type { ContentType, Post } from "./types";

export type PostTemplate = { id: string; name: string; description: string; content: string; supportedContentTypes?: ContentType[] };
export const postTemplates: PostTemplate[] = [
  { id: "essay", name: "Essay", description: "Develop an idea from observation to conclusion.", content: "## The idea\n\nIntroduce the question or observation that started this piece.\n\n## A closer look\n\nDevelop your argument with examples and evidence.\n\n## What this means\n\nLeave the reader with a clear takeaway.\n" },
  { id: "research", name: "Research note", description: "Question, method, findings, and sources.", content: "## Research question\n\nState the question and why it matters.\n\n## Method\n\nDescribe your approach, data, and assumptions.\n\n## Findings\n\nPresent observations and supporting evidence.\n\n## Limitations\n\nExplain uncertainty and what remains untested.\n\n## Next steps\n\nOutline follow-up questions.\n\n## Sources\n\nAdd citations to the sources you used.\n" },
  { id: "engineering", name: "Engineering write-up", description: "Explain a problem, the solution, and its tradeoffs.", content: "## The problem\n\nDescribe the behavior or constraint that motivated this work.\n\n## Approach\n\nExplain the design and alternatives considered.\n\n## Implementation\n\nWalk through the key decisions. Add code or a diagram where helpful.\n\n## Validation\n\nDescribe how you tested the solution and what you observed.\n\n## Tradeoffs and next steps\n\nRecord limitations and future improvements.\n" },
  { id: "tutorial", name: "Tutorial", description: "Guide readers through a practical task.", content: "## What you’ll build\n\nDescribe the result readers will achieve.\n\n## Before you begin\n\nList prerequisites and any tools or materials needed.\n\n## Step 1: Get ready\n\nExplain the first step.\n\n## Step 2: Build it\n\nWalk through the main task.\n\n## Check your result\n\nShow how to verify that everything works.\n\n## Troubleshooting\n\nCover common problems and their solutions.\n" },
  { id: "release", name: "Release notes", description: "Share improvements, fixes, and upgrade steps.", content: "## Overview\n\nSummarize the release and who it helps.\n\n## What’s new\n\n- Describe a new feature and its benefit.\n\n## Improvements and fixes\n\n- Explain a change and its effect.\n\n## Upgrading\n\nList any required steps or compatibility changes.\n\n## Known issues\n\nDocument remaining issues and workarounds.\n" },
];

postTemplates.push(
  { id: "user-guide", name: "User guide", description: "Introduce a product and help readers use it.", supportedContentTypes: ["guide"], content: "## Overview\n\nExplain what readers will accomplish.\n\n## Getting started\n\nList requirements and the first steps.\n\n## Everyday tasks\n\nExplain common workflows.\n\n## Troubleshooting\n\nDescribe common problems and solutions.\n" },
  { id: "playbook", name: "Playbook", description: "Document a repeatable process and its completion checks.", supportedContentTypes: ["guide"], content: "## When to use this playbook\n\nDescribe the trigger and intended outcome.\n\n## Before you begin\n\nList prerequisites and responsibilities.\n\n## Steps\n\n1. Describe the first action.\n2. Describe the next action.\n\n## Decision points\n\nExplain alternatives and escalation paths.\n\n## Completion checks\n\n- [ ] Verify the intended outcome.\n" },
  { id: "procedure", name: "Procedure", description: "A practical procedure for a guide.", supportedContentTypes: ["guide"], content: "## Purpose\n\nDescribe the outcome.\n\n## Prerequisites\n\nList what is needed.\n\n## Procedure\n\n1. Describe an action.\n\n## Verify\n\nExplain how to check the result.\n" },
);

export function canUsePostTemplate(post: Pick<Post, "id" | "status" | "content">): boolean {
  return !post.id && post.status === "draft" && !post.content?.trim();
}
