import PostsPagination from "../admin/PostsPagination";
import { postPageSizes } from "../admin/usePostsPagination";
import Select from "../components/Select";
import type { TeamPageController } from "./useTeamPage";

type Props<T> = { feed: TeamPageController<T>; label: string; id: string; busy: boolean };
export function TeamPageToolbar<T>({ feed, label, id, busy }: Props<T>) {
  return <div className="posts-list-toolbar team-list-toolbar" id={id}>
    <span role="status">{feed.loading ? `Loading ${label.toLowerCase()}…` : `Showing ${feed.start}–${feed.end} of ${feed.total} ${label.toLowerCase()}`}</span>
    <label>{label} per page<Select value={feed.pageSize} disabled={busy || feed.loading} onChange={event => feed.setPageSize(Number(event.target.value))}>{postPageSizes.map(size => <option key={size} value={size}>{size}</option>)}</Select></label>
  </div>;
}
export function TeamPageNavigation<T>({ feed, label, id, busy }: Props<T>) {
  return <>
    {feed.error && <p className="error-box" role="alert">{feed.error} <button className="button" disabled={busy} onClick={feed.retry}>Retry</button></p>}
    <PostsPagination state={{ ...feed, loading: feed.loading || busy }} label={`${label} pagination`} scrollSelector={`#${id}`} />
  </>;
}
