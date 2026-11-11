import VideoMedia from "../VideoMedia";
import { ArrowUpRight } from "lucide-react";
import { resolveHero, type HeroSection } from "../../shared/template-sections";
import type { BlogHomepageController } from "./useHomepage";
import { mediaPath, sitePath } from "../base-path";

export default function TemplateHero({ section, state }: { section: HeroSection; state: BlogHomepageController }) {
  if (!state.design.showHero) return null;
  const hero = resolveHero(section, state.theme, state.data.heroPosts ?? []);
  return <section className={`template-hero template-hero-${hero.variant} ${hero.image || hero.video ? "with-image" : "without-image"}`}>
    <HeroMedia hero={hero} />
    <div className="template-hero-copy">
      {hero.title && <h1>{hero.title}</h1>}
      {hero.description && <p>{hero.description}</p>}
      {hero.buttonLabel && hero.href && <a className="template-hero-link" href={hero.href.startsWith("/") ? sitePath(hero.href) : hero.href}>{hero.buttonLabel}<ArrowUpRight aria-hidden="true" size={16} /></a>}
    </div>
  </section>;
}

function HeroMedia({ hero }: { hero: ReturnType<typeof resolveHero> }) {
  if (hero.video) return <div className="template-hero-video"><VideoMedia src={hero.video} title={hero.title || "Homepage video"} ratio="16:9" /></div>;
  return hero.image ? <img className="template-hero-image" src={mediaPath(hero.image)} alt="" /> : null;
}
