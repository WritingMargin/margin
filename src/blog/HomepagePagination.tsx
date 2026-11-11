import type { BlogHomepageController } from "./useHomepage";
import { homepageQuery, paginationPages } from "../../shared/homepage";
import { sitePath } from "../base-path";
import "./homepage-pagination.css";

export default function HomepagePagination({
  state,
}: {
  state: BlogHomepageController;
}) {
  const {
    data,
    design,
    preview,
    search,
    selectedTags,
    setPage,
    moreLoading,
    moreError,
    retry,
  } = state;
  if (data.pages <= 1) return null;
  const href = (page: number) => {
    const query = homepageQuery(page, search, selectedTags);
    return sitePath("/") + (query ? `?${query}` : "") + "#posts";
  };
  if (design.pagination === "more")
    return (
      <nav
        className="homepage-pagination homepage-load-more"
        aria-label="Pagination"
      >
        <span role="status">
          Showing {data.posts.length} of {data.total}
        </span>
        {moreError ? (
          <span role="alert">
            {moreError}{" "}
            <button className="button" onClick={retry}>
              Try again
            </button>
          </span>
        ) : (
          data.page < data.pages && (
            <button
              className="button"
              disabled={moreLoading}
              onClick={() => setPage(data.page + 1)}
            >
              {moreLoading ? "Loading…" : "Load more"}
            </button>
          )
        )}
      </nav>
    );
  const link = (page: number, label: string, rel?: string) => (
    <a
      key={label}
      href={href(page)}
      rel={rel}
      aria-label={rel ? undefined : `Page ${page}`}
      aria-current={page === data.page ? "page" : undefined}
      onClick={
        preview
          ? (event) => {
              event.preventDefault();
              setPage(page);
            }
          : undefined
      }
    >
      {label}
    </a>
  );
  return (
    <nav className="homepage-pagination" aria-label="Pagination">
      {data.page > 1 ? (
        link(data.page - 1, "← Previous", "prev")
      ) : (
        <span aria-disabled="true">← Previous</span>
      )}
      <div className="homepage-page-numbers">
        {paginationPages(data.page, data.pages).map((page, i) =>
          page === "gap" ? (
            <span key={`gap-${i}`} aria-hidden="true">
              …
            </span>
          ) : (
            link(page, String(page))
          ),
        )}
      </div>
      <span className="homepage-page-status" role="status">
        Page {data.page} of {data.pages}
      </span>
      {data.page < data.pages ? (
        link(data.page + 1, "Next →", "next")
      ) : (
        <span aria-disabled="true">Next →</span>
      )}
    </nav>
  );
}
