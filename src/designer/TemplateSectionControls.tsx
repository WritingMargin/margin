import HeroVideoControls from "./HeroVideoControls";
import { ArrowUp, ArrowDown, X } from "lucide-react";
import { defaultHeroSection, imageVariables, linkVariables, textVariables, type HeroSection, type HomepageSection, type TemplateValue, type TemplateVariable } from "../../shared/template-sections";
import type { HomepageDesign } from "../../shared/types";
import Select from "../components/Select";
import "./template-section-controls.css";

type Props = { design: HomepageDesign; onChange: (patch: Partial<HomepageDesign>) => void };
const names = { hero: "Hero", "featured-posts": "Featured posts", "post-feed": "Post feed" };
const variables: Record<TemplateVariable, string> = {
  "blog.title": "Blog title", "blog.description": "Blog description", "blog.logo": "Blog logo", "blog.url": "Homepage link",
  "homepage.title": "Welcome headline", "homepage.description": "Welcome introduction", "homepage.image": "Uploaded hero image",
  "content.title": "Content title", "content.description": "Content description (excerpt)", "content.cover": "Content cover", "content.url": "Content link",
};

export function TemplateSectionLayout({ design, onChange }: Props) {
  const sections = design.sections;
  if (!sections) return <div className="template-section-intro"><button type="button" className="button" onClick={() => onChange({ sections: initialSections(design) })}>Compose with components</button><p>Arrange a hero, featured posts, and your story feed. Hero content can follow your publication or a published post.</p></div>;
  const hero = sections.find(section => section.component === "hero");
  return <fieldset className="page-layout-controls"><legend>Page components</legend>
    <ol className="template-section-list">{sections.map((section, index) => <li key={section.id}>
      <span>{names[section.component]}</span><div>
        <button type="button" aria-label={`Move ${names[section.component]} up`} disabled={index === 0} onClick={() => onChange({ sections: moveSection(sections, index, -1) })}><ArrowUp size={14} /></button>
        <button type="button" aria-label={`Move ${names[section.component]} down`} disabled={index === sections.length - 1} onClick={() => onChange({ sections: moveSection(sections, index, 1) })}><ArrowDown size={14} /></button>
        {section.component !== "post-feed" && <button type="button" aria-label={`Remove ${names[section.component]}`} onClick={() => onChange({ sections: sections.filter(item => item.id !== section.id) })}><X size={14} /></button>}
      </div>
    </li>)}</ol>
    {!hero && <button type="button" className="button" onClick={() => onChange({ showHero: true, sections: [defaultHeroSection(), ...sections] })}>Add hero</button>}
    {!sections.some(section => section.component === "featured-posts") && <button type="button" className="button" onClick={() => onChange({ showFeatured: true, sections: [...sections, { id: "featured", component: "featured-posts" }] })}>Add featured posts</button>}
    {hero && <label>Hero layout<Select value={hero.variant} onChange={event => onChange({ sections: sections.map(section => section.id === hero.id ? { ...hero, variant: event.target.value as HeroSection["variant"] } : section) })}>
      <option value="split">Split image</option><option value="centered">Centered masthead</option><option value="image-background">Image background</option>
    </Select></label>}
    <label>Section spacing<Select value={design.sectionSpacing ?? "standard"} onChange={event => onChange({ sectionSpacing: event.target.value as HomepageDesign["sectionSpacing"] })}>
      <option value="none">None</option><option value="compact">Compact</option><option value="standard">Standard</option><option value="airy">Spacious</option>
    </Select></label>
    <p>Section spacing controls the gaps between components. Choose None to join them together. Choose content sources in the Content tab.</p>
  </fieldset>;
}

function initialSections(design: HomepageDesign): HomepageSection[] {
  const hero = defaultHeroSection();
  hero.variant = design.heroLayout === "centered" ? "centered" : "split";
  hero.props = { ...hero.props, title: { bind: "homepage.title" }, description: { bind: "homepage.description" }, image: { bind: "homepage.image" }, mediaType: design.artworkType === "video" ? "video" : "image", video: design.artworkVideo, buttonLabel: "" };
  return [hero, { id: "featured", component: "featured-posts" }, { id: "stories", component: "post-feed" }];
}
function moveSection(sections: HomepageSection[], index: number, direction: number) {
  const next = [...sections];
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return next;
}

export function TemplateHeroContent({ design, onChange, upload, uploading, uploadVideo, uploadingVideo }: Props & { upload: React.ChangeEventHandler<HTMLInputElement>; uploading: boolean; uploadVideo: React.ChangeEventHandler<HTMLInputElement>; uploadingVideo: boolean }) {
  const hero = design.sections?.find(section => section.component === "hero");
  if (!hero) return <p className="muted">Add a hero in Layout to use dynamic content.</p>;
  const change = (props: Partial<HeroSection["props"]>) => onChange({ sections: design.sections!.map(section => section.id === hero.id ? { ...hero, props: { ...hero.props, ...props } } : section) });
  return <fieldset className="page-layout-controls"><legend>Hero content</legend>
    <label>Content source<Select value={hero.props.source} onChange={event => change({ source: event.target.value as "latest" | "featured" })}><option value="latest">Latest published post</option><option value="featured">Featured post, or latest published post</option></Select></label>
    <p>Content fields update as you publish. Private drafts are never used. Fallback values appear when a source is empty.</p>
    <BindingField label="Hero title" value={hero.props.title} options={textVariables} max={200} onChange={title => change({ title: title as HeroSection["props"]["title"] })} />
    <BindingField label="Hero description" value={hero.props.description} options={textVariables} max={1000} onChange={description => change({ description: description as HeroSection["props"]["description"] })} />
    <label>Hero media<Select value={hero.props.mediaType ?? "image"} onChange={event => change({ mediaType: event.target.value as "image" | "video" })}><option value="image">Image</option><option value="video">Video</option></Select></label>
    {hero.props.mediaType === "video" ? <><HeroVideoControls value={hero.props.video ?? design.artworkVideo ?? ""} onChange={video => change({ video })} upload={uploadVideo} uploading={uploadingVideo} />{hero.variant === "image-background" && <p className="muted">Video uses a split layout so its playback controls remain accessible.</p>}</> : <>
    <BindingField label="Hero image" value={hero.props.image} options={imageVariables} max={2048} onChange={image => change({ image: image as HeroSection["props"]["image"] })} />
    <details className="template-binding-field"><summary>Upload a hero image</summary><label>Hero image file<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={upload} /></label><p>Select Uploaded hero image as the image source to use it.</p></details></>}
    <BindingField label="Button label" value={hero.props.buttonLabel} options={textVariables} max={80} onChange={buttonLabel => change({ buttonLabel: buttonLabel as HeroSection["props"]["buttonLabel"] })} />
    <BindingField label="Button destination" value={hero.props.buttonHref} options={linkVariables} max={2048} onChange={buttonHref => change({ buttonHref: buttonHref as HeroSection["props"]["buttonHref"] })} />
  </fieldset>;
}

function BindingField({ label, value, options, max, onChange }: { label: string; value: TemplateValue; options: readonly TemplateVariable[]; max: number; onChange: (value: TemplateValue) => void }) {
  const custom = typeof value === "string";
  const text = custom ? value : value.fallback ?? "";
  return <details className="template-binding-field"><summary><span>{label}</span><small>{custom ? "Custom value" : variables[value.bind]}</small></summary>
    <label>{label} source<Select value={custom ? "custom" : value.bind} onChange={event => onChange(event.target.value === "custom" ? text : { bind: event.target.value as TemplateVariable, fallback: text })}>
      <option value="custom">Custom value</option>{options.map(key => <option key={key} value={key}>{variables[key]}</option>)}
    </Select></label>
    <label>{label} {custom ? "value" : "fallback"}<textarea rows={2} maxLength={max} value={text} onChange={event => onChange(custom ? event.target.value : { ...value, fallback: event.target.value })} /></label>
  </details>;
}
