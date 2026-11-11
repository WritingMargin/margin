import type { PageTemplate } from "./design-presets";
import { defaultHeroSection, type HeroSection, type HomepageSection } from "./template-sections";

export function componentHomepageTemplates(base: PageTemplate): PageTemplate[] {
  const hero = defaultHeroSection();
  const content: HeroSection["props"] = { source: "featured", title: { bind: "content.title", fallback: "Your next great story starts here." }, description: { bind: "content.description", fallback: "Ideas, stories, and discoveries from this publication." }, image: { bind: "content.cover" }, buttonLabel: "Read the story", buttonHref: { bind: "content.url", fallback: "#posts" } };
  const feed: HomepageSection = { id: "stories", component: "post-feed" };
  const featured: HomepageSection = { id: "featured", component: "featured-posts" };
  return [
    { id: "spotlight", name: "Spotlight", description: "A split hero follows your featured story, with its title, description, cover, and reading link. A grid of posts follows.", design: { ...base.design, layout: "grid", headingFont: "sans", font: "sans", showArtwork: false, sections: [{ ...hero, props: content }, featured, feed] } },
    { id: "cover-story", name: "Cover story", description: "An immersive image hero draws its content from your featured post, above a magazine feed.", design: { ...base.design, layout: "magazine", showArtwork: false, showNumbers: false, sections: [{ ...hero, variant: "image-background", props: content }, feed, featured] } },
    { id: "publication", name: "Publication", description: "A centered masthead uses your blog title and description. Featured stories and an editorial list sit beneath it.", design: { ...base.design, layout: "list", heroLayout: "centered", showArtwork: false, sections: [{ ...hero, variant: "centered", props: { ...hero.props, image: "" } }, featured, feed] } },
  ];
}
