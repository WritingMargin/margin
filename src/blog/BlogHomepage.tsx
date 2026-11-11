import TemplateHero from "./TemplateHero";
import type { HomepageSection } from "../../shared/template-sections";
import HomepageHeading from "./HomepageHeading";
import HomepagePagination from "./HomepagePagination";
import FeaturedPosts from "./FeaturedPosts";
import HomepageArtwork from "./HomepageArtwork";
import HomepageFilters from "./HomepageFilters";
import HomepageStories from "./HomepageStories";
import { publicationCopy } from "../../shared/publication";
import { blogThemeStyle } from "./theme";
import { useHomepage, type BlogHomepageController } from "./useHomepage";
import type { HomepageDesign } from "../../shared/types";
import "../blog-design.css";

export function BlogHomepage(props: Parameters<typeof useHomepage>[0]) {
  const state = useHomepage(props);
  const { design, theme } = state;
  if (design.sections) return <main {...presentationAttributes(design)} className="journal-home home-intro-none composed-home" style={blogThemeStyle(theme, "homepage")}><HomepageSections state={state} sections={design.sections} /></main>;
  return <main {...presentationAttributes(design)} className={`journal-home home-intro-${introLayout(design)}`} style={blogThemeStyle(theme, "homepage")}>
    <HomepageHero state={state} />
    <div className="journal-feed">
      <HomepageFeatured state={state} position="before" />
      <HomepageFeed state={state} />
      <HomepageFeatured state={state} position="after" />
    </div>
  </main>;
}

// A local registry resolves JSON component names; templates contain no executable code.
const homepageComponents = {
  hero: ({ state, section }: { state: BlogHomepageController; section: HomepageSection }) => section.component === "hero" ? <TemplateHero state={state} section={section} /> : null,
  "featured-posts": ({ state }: { state: BlogHomepageController }) => state.design.showFeatured !== false ? <FeaturedPosts posts={state.data.featured} theme={state.theme} /> : null,
  "post-feed": HomepageFeed,
};
function HomepageSections({ state, sections }: { state: BlogHomepageController; sections: HomepageSection[] }) {
  return <>{sections.map(section => { const Component = homepageComponents[section.component]; return <Component key={section.id} section={section} state={state} />; })}</>;
}
function HomepageFeed({ state }: { state: BlogHomepageController }) {
  return <section className="template-post-feed" aria-label="Stories">
      <div id="posts" />
      <HomepageHeading state={state} />
      <HomepageFilters state={state} />
      <HomepageStories state={state} />
      {state.showPagination && <HomepagePagination state={state} />}
  </section>;
}

function presentationAttributes(design: HomepageDesign) {
  return {
    "data-section-spacing": design.sectionSpacing ?? "standard",
    "data-heading-scale": design.headingScale ?? "standard",
    "data-spacing": design.spacing ?? "standard",
    "data-card-style": design.cardStyle ?? "classic",
    "data-image-ratio": design.imageRatio ?? "auto",
    "data-grid-columns": design.gridColumns ?? "two",
    "data-show-numbers": design.showNumbers !== false,
  };
}

function HomepageFeatured({ state, position }: { state: BlogHomepageController; position: "before" | "after" }) {
  if (state.design.showFeatured === false || (state.design.featuredPosition ?? "before") !== position) return null;
  return <FeaturedPosts posts={state.data.featured} theme={state.theme} />;
}

function HomepageHero({ state }: { state: BlogHomepageController }) {
  const { design, theme } = state;
  const words = publicationCopy(theme.publicationType);
  return <>
      {design.showHero && (
        <section
          className={`journal-hero ${design.showArtwork ? "" : "without-art"}`}
        >
          <div>
            <HomepageTagline design={design} fallback={words.eyebrow} />
            <h1>{design.title}</h1>
            <p>{design.description}</p>
          </div>
          {design.showArtwork && (
            <HomepageArtwork theme={theme} />
          )}
        </section>
      )}
  </>;
}

function HomepageTagline({ design, fallback }: { design: HomepageDesign; fallback: string }) {
  if (design.showTagline === false) return null;
  return <span className="eyebrow"><span className="live-dot" />{design.tagline || fallback}</span>;
}

function introLayout(design: HomepageDesign) {
  return design.showHero ? (design.heroLayout ?? "split") : "none";
}
