import { useState } from "react";
import type { HomepageDesign } from "../../shared/types";
import type { FeedHeaderDesign, FeedFiltersDesign } from "../../shared/feed-design";
import { publicationCopy } from "../../shared/publication";
import type { PublicationType } from "../../shared/publication";
import Select from "../components/Select";
import { Toggle } from "./controls";

type Props = { design: HomepageDesign; publicationType: PublicationType; onChange: (patch: Partial<HomepageDesign>) => void };

export default function FeedControls({ design, publicationType, onChange }: Props) {
  const header = design.feedHeader ?? {};
  const filters = design.feedFilters ?? {};
  const words = publicationCopy(publicationType);
  const setHeader = (patch: Partial<FeedHeaderDesign>) => onChange({ feedHeader: { ...header, ...patch } });
  const setFilters = (patch: Partial<FeedFiltersDesign>) => onChange({ feedFilters: { ...filters, ...patch } });
  return <fieldset className="page-layout-controls"><legend>Feed header and filters</legend>
    <details className="template-binding-field"><summary>Feed header</summary>
      <label>Heading text<input maxLength={150} placeholder={words.heading} value={header.title ?? ""} onChange={event => setHeader({ title: event.target.value || undefined })} /></label>
      <Toggle label="Count arrow" value={header.showArrow !== false} onChange={showArrow => setHeader({ showArrow })} />
      <RowControls design={header} defaultBorder="top-and-bottom" defaultPadding={17} defaultGap={18} onChange={setHeader} />
      <p>The count follows the current topic and search results.</p>
    </details>
    <details className="template-binding-field"><summary>Filter bar layout</summary>
      <label>Arrangement<Select value={filters.layout ?? "inline"} onChange={event => setFilters({ layout: event.target.value as FeedFiltersDesign["layout"] })}><option value="inline">Topics beside search</option><option value="stacked">Stacked rows</option></Select></label>
      <label>Mobile arrangement<Select value={filters.mobileLayout ?? "wrap"} onChange={event => setFilters({ mobileLayout: event.target.value as FeedFiltersDesign["mobileLayout"] })}><option value="wrap">Wrap as needed</option><option value="stacked">Stacked rows</option></Select></label>
      <RowControls design={filters} defaultBorder="bottom" defaultPadding={18} defaultGap={16} onChange={setFilters} />
    </details>
    <TopicControls filters={filters} allLabel={`All ${words.plural}`} onChange={setFilters} />
    <SearchControls filters={filters} placeholder={`Find a ${words.singular}…`} onChange={setFilters} />
  </fieldset>;
}

function RowControls({ design, defaultBorder, defaultPadding, defaultGap, onChange }: {
  design: FeedHeaderDesign; defaultBorder: string; defaultPadding: number; defaultGap: number; onChange: (patch: Partial<FeedHeaderDesign>) => void;
}) {
  return <>
    <label>Dividers<Select value={design.border ?? defaultBorder} onChange={event => onChange({ border: event.target.value as FeedHeaderDesign["border"] })}>
      <option value="none">None</option><option value="top">Above</option><option value="bottom">Below</option><option value="top-and-bottom">Above and below</option>
    </Select></label>
    <label>Vertical padding · {design.paddingBlock ?? defaultPadding}px<input type="range" min={0} max={80} value={design.paddingBlock ?? defaultPadding} onChange={event => onChange({ paddingBlock: Number(event.target.value) })} /></label>
    <label>Gap · {design.gap ?? defaultGap}px<input type="range" min={0} max={64} value={design.gap ?? defaultGap} onChange={event => onChange({ gap: Number(event.target.value) })} /></label>
  </>;
}

type FilterProps = { filters: FeedFiltersDesign; onChange: (patch: Partial<FeedFiltersDesign>) => void };
function TopicControls({ filters, allLabel, onChange }: FilterProps & { allLabel: string }) {
  const topics = filters.topics ?? {};
  return <details className="template-binding-field"><summary>Topic labels</summary>
    <label>All topics label<input maxLength={100} placeholder={allLabel} value={topics.allLabel ?? ""} onChange={event => onChange({ topics: { ...topics, allLabel: event.target.value || undefined } })} /></label>
    <TopicLabels labels={topics.labels ?? {}} onChange={labels => onChange({ topics: { ...topics, labels } })} />
    <p>Use the exact topic value. Labels change the displayed text; filters still use the original topics.</p>
  </details>;
}
function SearchControls({ filters, placeholder, onChange }: FilterProps & { placeholder: string }) {
  const search = filters.search ?? {};
  const change = (patch: Partial<NonNullable<FeedFiltersDesign["search"]>>) => onChange({ search: { ...search, ...patch } });
  return <details className="template-binding-field"><summary>Search field</summary>
    <label>Placeholder<input maxLength={150} placeholder={placeholder} value={search.placeholder ?? ""} onChange={event => change({ placeholder: event.target.value || undefined })} /></label>
    <label>Inline position<Select value={search.position ?? "end"} onChange={event => change({ position: event.target.value as "start" | "end" })}><option value="start">Before topics</option><option value="end">After topics</option></Select></label>
    <p>Search placement above or below topics takes precedence.</p>
    <label>Maximum width · {search.maxWidth ?? 360}px<input type="range" min={160} max={800} step={1} value={search.maxWidth ?? 360} onChange={event => change({ maxWidth: Number(event.target.value) })} /></label>
    <button type="button" className="button" onClick={() => change({ maxWidth: undefined })}>Use layout width</button>
  </details>;
}
function TopicLabels({ labels, onChange }: { labels: Record<string, string>; onChange: (labels: Record<string, string>) => void }) {
  const [tag, setTag] = useState("");
  const [label, setLabel] = useState("");
  const add = () => { onChange({ ...labels, [tag.trim()]: label.trim() }); setTag(""); setLabel(""); };
  return <>
    {Object.entries(labels).map(([key, value]) => <div key={key}>
      <label>Label for {key}<input maxLength={100} value={value} onChange={event => onChange({ ...labels, [key]: event.target.value })} /></label>
      <button type="button" className="button" aria-label={`Remove label for ${key}`} onClick={() => onChange(Object.fromEntries(Object.entries(labels).filter(([name]) => name !== key)))}>Remove label</button>
    </div>)}
    <label>Topic value<input maxLength={100} value={tag} onChange={event => setTag(event.target.value)} /></label>
    <label>Display label<input maxLength={100} value={label} onChange={event => setLabel(event.target.value)} /></label>
    <button type="button" className="button" disabled={!tag.trim() || !label.trim() || Object.hasOwn(labels, tag.trim())} onClick={add}>Add topic label</button>
  </>;
}
