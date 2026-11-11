import { contentTypeLabel, resolveContentType } from "../../shared/content-types";
import { ArrowUpRight } from "lucide-react";
import { publicationCopy } from "../../shared/publication";
import { sitePath } from "../base-path";
import SearchHighlight from "../SearchHighlight";
import CoverMedia, { hasCover } from "../CoverMedia";
import EmptyStories from "./EmptyStories";
import { date } from "./theme";
import type { BlogHomepageController } from "./useHomepage";

export default function HomepageStories({ state }: { state: BlogHomepageController }) {
  const { design, search, filtered, searchState, offset } = state;
  return <>
      {searchState.loading ? <p className="journal-search-status" role="status">Searching…</p> : searchState.error ? (
        <div className="journal-search-status" role="alert">{searchState.error} <button className="button" onClick={searchState.retry}>Try again</button></div>
      ) : !filtered.length ? (
        <HomepageEmpty state={state} />
      ) : (
        <div className={`journal-posts journal-layout-${design.layout}`}>
          {filtered.map((p, i) => (
            <a
              key={p.id}
              href={sitePath(`/post/${encodeURIComponent(p.slug)}`)}
              className="journal-post"
            >
              <span className="post-index">
                {String(offset + i + 1).padStart(2, "0")}
              </span>
              <div className="journal-post-body">
                {design.showImages && hasCover(p.cover) && (
                  <CoverMedia src={p.cover} thumbnail />
                )}
                {design.showTags && p.tags.length > 0 && (
                  <span className="eyebrow">
                    <SearchHighlight text={p.tags.slice(0, 3).join(" / ")} matches={p.searchMatches} />
                  </span>
                )}
                <h2><SearchHighlight text={p.title} matches={p.searchMatches} /></h2>
                {search.trim() && p.searchSnippet ? <p><SearchHighlight text={p.searchSnippet} matches={p.searchMatches} /></p> : design.showExcerpts && <p><SearchHighlight text={p.excerpt} matches={p.searchMatches} /></p>}
                <div className="journal-post-meta">
                  {design.showDates ? (
                    <time dateTime={p.createdAt}>{date(p.createdAt)}</time>
                  ) : (
                    <span />
                  )}
                  <span>
                    Read {contentTypeLabel(resolveContentType(p.contentType), state.theme.publicationType).toLowerCase()}
                    <ArrowUpRight size={16} />
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
  </>;
}

function HomepageEmpty({ state }: { state: BlogHomepageController }) {
  if (state.data.featured?.length && state.design.showFeatured !== false) return null;
  return <EmptyStories words={publicationCopy(state.theme.publicationType)} hasPosts={state.hasPosts} onReset={() => { state.setSearch(""); state.setTag(""); }} />;
}
