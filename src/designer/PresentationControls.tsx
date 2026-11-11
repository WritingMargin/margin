import Select from "../components/Select";
import { fontIds, typography } from "../../shared/typography";
import type { ArticleDesign, HomepageDesign, SectionAppearance } from "../../shared/types";
import { Toggle } from "./controls";

type Choice = readonly [string, string];
function ChoiceControl({ label, value, options, onChange }: { label: string; value: string; options: readonly Choice[]; onChange: (value: string) => void }) {
  return <label>{label}<Select value={value} onChange={event => onChange(event.target.value)}>{options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</Select></label>;
}

export function TypographyControls({ design, onChange }: { design: SectionAppearance; onChange: (patch: Partial<SectionAppearance>) => void }) {
  return <>
    <ChoiceControl label="Heading typeface" value={design.headingFont ?? "inherit"} options={[["inherit", "Same as body"], ...fontIds.map(id => [id, typography[id].name] as const)]} onChange={value => onChange({ headingFont: value === "inherit" ? undefined : value as SectionAppearance["headingFont"] })} />
    <ChoiceControl label="Heading size" value={design.headingScale ?? "standard"} options={[["compact", "Compact"], ["standard", "Standard"], ["display", "Oversized"]]} onChange={value => onChange({ headingScale: value as SectionAppearance["headingScale"] })} />
    <ChoiceControl label="Spacing" value={design.spacing ?? "standard"} options={[["compact", "Compact"], ["standard", "Standard"], ["airy", "Airy"]]} onChange={value => onChange({ spacing: value as SectionAppearance["spacing"] })} />
  </>;
}

export function HomePresentationControls({ design, onChange }: { design: HomepageDesign; onChange: (patch: Partial<HomepageDesign>) => void }) {
  return <>
    <ChoiceControl label="Story card style" value={design.cardStyle ?? "classic"} options={[["classic", "Layout default"], ["flat", "Open / no frame"], ["outlined", "Outlined cards"], ["filled", "Filled cards"]]} onChange={value => onChange({ cardStyle: value as HomepageDesign["cardStyle"] })} />
    <ChoiceControl label="Image proportions" value={design.imageRatio ?? "auto"} options={[["auto", "Layout default"], ["landscape", "Landscape"], ["square", "Square"], ["portrait", "Portrait"]]} onChange={value => onChange({ imageRatio: value as HomepageDesign["imageRatio"] })} />
    {design.layout === "grid" && <ChoiceControl label="Grid columns" value={design.gridColumns ?? "two"} options={[["two", "Two columns"], ["three", "Three columns"]]} onChange={value => onChange({ gridColumns: value as HomepageDesign["gridColumns"] })} />}
    {design.layout === "list" && <Toggle label="Story numbers" value={design.showNumbers !== false} onChange={showNumbers => onChange({ showNumbers })} />}
  </>;
}

export function HomepageCompositionControls({ design, onChange }: { design: HomepageDesign; onChange: (patch: Partial<HomepageDesign>) => void }) {
  return <fieldset className="page-layout-controls"><legend>Homepage sections</legend>
    <Toggle label="Feed heading" description="The heading above your latest stories." value={design.showFeedHeading !== false} onChange={showFeedHeading => onChange({ showFeedHeading })} />
    <Toggle label="Post count" description="The total beside the feed heading." value={design.showPostCount !== false} onChange={showPostCount => onChange({ showPostCount })} />
    <Toggle label="Topic filters" value={design.showTopicFilters !== false} onChange={showTopicFilters => onChange({ showTopicFilters })} />
    <Toggle label="Search bar" value={design.showSearch !== false} onChange={showSearch => onChange({ showSearch })} />
    {design.showSearch !== false && <ChoiceControl label="Search placement" value={design.searchPosition ?? "inline"} options={[["inline", "Beside topics"], ["above", "Full width above topics"], ["below", "Full width below topics"]]} onChange={value => onChange({ searchPosition: value as HomepageDesign["searchPosition"] })} />}
    <Toggle label="Featured section" description="When hidden, featured posts appear in the main feed." value={design.showFeatured !== false} onChange={showFeatured => onChange({ showFeatured })} />
    {!design.sections && design.showFeatured !== false && <ChoiceControl label="Featured placement" value={design.featuredPosition ?? "before"} options={[["before", "Before the main feed"], ["after", "After the main feed"]]} onChange={value => onChange({ featuredPosition: value as HomepageDesign["featuredPosition"] })} />}
  </fieldset>;
}

export function ArticlePresentationControls({ design, onChange }: { design: ArticleDesign; onChange: (patch: Partial<ArticleDesign>) => void }) {
  return <>
    <ChoiceControl label="Reading column" value={design.measure ?? "auto"} options={[["auto", "Follow opening layout"], ["focused", "Focused · 60 characters"], ["reading", "Reading · 72 characters"], ["wide", "Wide · full content width"]]} onChange={value => onChange({ measure: value as ArticleDesign["measure"] })} />
    <ChoiceControl label="Body text size" value={design.bodySize ?? "small"} options={[["small", "Small · 15px"], ["regular", "Regular · 17px"], ["large", "Large · 20px"]]} onChange={value => onChange({ bodySize: value as ArticleDesign["bodySize"] })} />
    <ChoiceControl label="Line spacing" value={design.lineSpacing ?? "loose"} options={[["compact", "Compact"], ["relaxed", "Relaxed"], ["loose", "Loose"]]} onChange={value => onChange({ lineSpacing: value as ArticleDesign["lineSpacing"] })} />
    <ChoiceControl label="Section headings" value={design.headingStyle ?? "plain"} options={[["plain", "Plain"], ["ruled", "Underlined"], ["accent", "Accent color"]]} onChange={value => onChange({ headingStyle: value as ArticleDesign["headingStyle"] })} />
    <ChoiceControl label="Block quotes" value={design.quoteStyle ?? "border"} options={[["border", "Side rule"], ["pull", "Large centered quote"], ["panel", "Shaded panel"]]} onChange={value => onChange({ quoteStyle: value as ArticleDesign["quoteStyle"] })} />
  </>;
}
