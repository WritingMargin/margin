import Select from "../components/Select";
import { paginationPages } from "../../shared/homepage";
import { postPageSizes, type usePostsPagination } from "./usePostsPagination";
import "./posts-pagination.css";
import PostsSearch from "./PostsSearch";

type Pagination = ReturnType<typeof usePostsPagination>;
export function PostsPageSize({ state, query, onSearch }: {
  state: Pagination;
  query: string;
  onSearch: (query: string) => void;
}) {
  return (
    <div className="posts-list-toolbar">
      <PostsSearch query={query} onChange={onSearch} />
      <span role="status">{state.loading ? "Loading…" : `Showing ${state.start}–${state.end} of ${state.total} posts`}</span>
      <label>
        Posts per page
        <Select value={state.pageSize} onChange={(event) => state.setPageSize(Number(event.target.value))}>
          {postPageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
        </Select>
      </label>
    </div>
  );
}
export default function PostsPagination({ state }: { state: Pagination }) {
  if (state.loading || state.error || state.pages <= 1) return null;
  const go = (page: number) => {
    state.setPage(page);
    requestAnimationFrame(() => document.querySelector(".posts-list-toolbar")?.scrollIntoView({ block: "start" }));
  };
  return (
    <nav className="posts-pagination" aria-label="Posts pagination">
      <button className="button" disabled={state.page === 1} onClick={() => go(state.page - 1)}>← Previous</button>
      <div className="posts-page-numbers">
        {paginationPages(state.page, state.pages).map((page, index) =>
          page === "gap" ? <span key={`gap-${index}`} aria-hidden="true">…</span> : (
            <button className="button" key={page} aria-label={`Page ${page}`} aria-current={page === state.page ? "page" : undefined} onClick={() => go(page)}>{page}</button>
          ),
        )}
      </div>
      <button className="button" disabled={state.page === state.pages} onClick={() => go(state.page + 1)}>Next →</button>
    </nav>
  );
}
