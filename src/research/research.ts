import { citationTag } from "../../shared/citations";
import {
  writingRequest,
  writingExcerpt,
  writingLimits,
  type WritingSession,
  type ResearchSource,
  type ResearchContext,
} from "../../shared/writing";
import type { Post } from "../../shared/types";
import { api } from "../api";

export function discoverSources(postID: string, brief: string) {
  const path = postID
    ? "/posts/" + encodeURIComponent(postID) + "/research"
    : "/ai/research";
  const params = new URLSearchParams({
    q: Array.from(brief.trim()).slice(0, 500).join(""),
  });
  return api<ResearchSource[]>(path + "?" + params);
}
export function prepareWritingRequest(
  session: WritingSession,
  post: Post,
  feedback: string,
  followUp: boolean,
) {
  const request = {
    ...writingRequest(session, post, feedback),
    ...(session.research && post.id ? { postId: post.id } : {}),
  };
  if (!session.research) return { request, research: undefined };
  const sources = sourcesForWriting(session, followUp);
  if (!sources.length) {
    return {
      request,
      research: {
        sources,
        brief: request.brief,
        passage: request.passage || "",
      },
    };
  }
  const sourceBrief = [
    request.brief,
    "Consult these sources. Cite the URLs you use and identify uncertainties in your planning notes.",
    ...sources.map((s) => s.url),
  ].join("\n");
  // The structured selection preserves the URLs even when appending them
  // would push a valid author message over the brief limit.
  const brief =
    Array.from(sourceBrief).length <= 4000 ? sourceBrief : request.brief;
  const evidence = sources
    .map((s) => [s.url, s.title, s.excerpt].join("\n"))
    .join("\n\n");
  const passage = writingExcerpt(
    [request.passage, evidence].join("\n\n").trim(),
    writingLimits.passage,
  );
  const research: ResearchContext = { sources, brief, passage };
  return {
    request: {
      ...request,
      brief,
      passage,
      researchSources: sources.map(({ url, title, excerpt }) => ({
        url,
        title,
        excerpt,
      })),
    },
    research,
  };
}

function sourcesForWriting(session: WritingSession, followUp: boolean) {
  if (
    session.researchSelectionEdited ||
    session.researchSources.length ||
    !followUp
  )
    return session.researchSources;
  return session.lastResearch?.sources.slice(0, 3) ?? [];
}

export function researchResult(
  context: ResearchContext | undefined,
  found: ResearchSource[] = [],
  saved?: ResearchContext["saved"],
) {
  if (!context) return undefined;
  const byURL = new Map(context.sources.map((source) => [source.url, source]));
  for (const source of found) {
    if (!byURL.has(source.url)) byURL.set(source.url, source);
  }
  return { ...context, sources: Array.from(byURL.values()), saved };
}

export function citeSource(
  source: ResearchSource,
  selection: string,
  insert: (before: string, after?: string) => void,
) {
  const citation = {
    url: source.url,
    title: source.title,
    quote: "",
    page: "",
    rect: "",
  };
  if (!selection) {
    insert(citationTag(citation, source.title.replace(/[\r\n\[\]\\]/g, " ")));
    return;
  }
  if (/[\r\n]/.test(selection))
    throw new Error("Choose text on one line to attach a citation.");
  const close = "[/Citation]";
  insert(citationTag(citation, "").slice(0, -close.length), close);
}

export function selectResearchSource(
  session: WritingSession,
  source: ResearchSource,
  checked: boolean,
  onChange: (patch: Partial<WritingSession>) => void,
) {
  const selected = [...session.researchSources];
  const index = selected.findIndex((item) => item.url === source.url);
  if (checked && index < 0 && selected.length < 3) selected.push(source);
  if (!checked && index >= 0) selected.splice(index, 1);
  onChange({ researchSources: selected, researchSelectionEdited: true });
}
