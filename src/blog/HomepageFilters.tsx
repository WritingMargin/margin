import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { publicationCopy } from "../../shared/publication";
import { feedSearchFirst, feedTopicLabel } from "../../shared/feed-design";
import { feedRowStyle } from "./feed-style";
import type { BlogHomepageController } from "./useHomepage";

export default function HomepageFilters({ state }: { state: BlogHomepageController }) {
  const { design, search, setSearch, selectedTags, setTags } = state;
  return <>
    {(design.showSearch !== false || design.showTopicFilters !== false) && <FilterRow state={state} />}
    {(search || selectedTags.length > 0) && <button className="journal-clear-filters" onClick={() => { setSearch(""); setTags([]); }}>Clear filters</button>}
  </>;
}

function FilterRow({ state }: { state: BlogHomepageController }) {
  const { design } = state;
  const filters = design.feedFilters ?? {};
  const first = feedSearchFirst(design.searchPosition, filters);
  return <div className={`journal-filters search-position-${design.searchPosition ?? "inline"}`}
    data-feed-layout={filters.layout} data-feed-mobile-layout={filters.mobileLayout}
    data-feed-border={filters.border} style={feedRowStyle(filters)}>
    {first && <HomepageSearch state={state} />}
    {design.showTopicFilters !== false && <HomepageTopics state={state} />}
    {!first && <HomepageSearch state={state} />}
  </div>;
}

function HomepageTopics({ state }: { state: BlogHomepageController }) {
  const { design, selectedTags, setTags, tags, topTags } = state;
  const words = publicationCopy(state.theme.publicationType);
  const topics = design.feedFilters?.topics;
  return <div className="journal-topic-navigation">
    <div className="journal-tag-filters" aria-label="Filter by topic" tabIndex={0}>
      <button className={!selectedTags.length ? "selected" : ""} aria-pressed={!selectedTags.length} onClick={() => setTags([])}>
        {topics?.allLabel ?? `All ${words.plural}`}
      </button>
      {topTags.map(value => <button className={selectedTags.includes(value) ? "selected" : ""} aria-pressed={selectedTags.includes(value)}
        key={value} onClick={() => setTags(selectedTags.includes(value) ? selectedTags.filter(tag => tag !== value) : [...selectedTags, value])}>{feedTopicLabel(value, topics?.labels)}</button>)}
    </div>
    <TopicMenu state={state} tags={tags} />
  </div>;
}

function TopicMenu({ state, tags }: { state: BlogHomepageController; tags: string[] }) {
  const { design, selectedTags, setTags } = state;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const options = design.feedFilters?.topics;
  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); menu.current?.querySelector<HTMLButtonElement>(".journal-topic-menu-trigger")?.focus(); }
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  const visible = tags.filter(value => feedTopicLabel(value, options?.labels).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <div ref={menu} className="journal-topic-menu">
    <button className="journal-topic-menu-trigger" type="button" aria-expanded={open} aria-haspopup="true"
      onClick={() => setOpen(value => !value)}>
      Topics{selectedTags.length ? ` (${selectedTags.length})` : ""}<ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <div className="journal-topic-menu-panel" role="group" aria-label="Select topics">
      <label className="journal-topic-menu-search">
        <Search size={14} aria-hidden="true" />
        <input aria-label="Find a topic" placeholder="Find a topic…" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      <div className="journal-topic-menu-options">
        {visible.map(value => <label key={value} className="journal-topic-menu-option">
          <input type="checkbox" checked={selectedTags.includes(value)} onChange={() => setTags(selectedTags.includes(value) ? selectedTags.filter(tag => tag !== value) : [...selectedTags, value])} />
          <span>{feedTopicLabel(value, options?.labels)}</span>
        </label>)}
        {!visible.length && <p className="journal-topic-menu-empty">No topics found.</p>}
      </div>
      {selectedTags.length > 0 && <button className="journal-topic-menu-clear" type="button" onClick={() => setTags([])}>Clear topics</button>}
    </div>}
  </div>;
}

function HomepageSearch({ state }: { state: BlogHomepageController }) {
  const { design, search, setSearch } = state;
  const words = publicationCopy(state.theme.publicationType);
  const options = design.feedFilters?.search;
  if (design.showSearch === false) return null;
  return <label className="journal-search" style={{ maxWidth: options?.maxWidth }}>
    <Search aria-hidden="true" size={14} />
    <input aria-label={`Search ${words.plural}`} placeholder={options?.placeholder ?? `Find a ${words.singular}…`}
      maxLength={200} value={search} onChange={event => setSearch(event.target.value)} />
  </label>;
}
