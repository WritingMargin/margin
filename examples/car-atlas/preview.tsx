import { createRoot } from "react-dom/client";
import Markdown from "../../src/Markdown";
import article from "./article.md";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/lora/400.css";
import "../heart-atlas/preview.css";
import "./preview.css";

createRoot(document.getElementById("root")!).render(
  <>
    <header className="atlas-header">
      <a href="/" className="atlas-brand"><span aria-hidden="true">✳</span> The Living Atlas
        <span className="atlas-brand-note">SCIENCE & ENGINEERING, EXPLAINED</span>
      </a>
      <nav aria-label="Main navigation"><a href="/">The heart</a><a href="/post/inside-an-electric-car/" aria-current="page">The car</a></nav>
    </header>
    <main>
      <section className="atlas-intro" aria-labelledby="page-title">
        <div className="atlas-eyebrow"><span>VOLUME 02</span><span>THE ELECTRIC CAR</span></div>
        <div className="atlas-title-row">
          <h1 id="page-title">Under the skin of<br/><em>an electric car.</em></h1>
          <div className="atlas-deck"><p>One familiar shape.<br/>Six systems working together.</p><a href="#explore">Explore the geometry <span>↓</span></a></div>
        </div>
        <div className="atlas-meta"><span>DESIGN & ENGINEERING</span><span>AN INTERACTIVE FIELD GUIDE</span><span>16 OCTOBER 2026</span></div>
      </section>
      <nav className="atlas-exports" aria-label="Article exports">
        <a href="/exports/car/rss-reader.html">RSS reading view</a><a href="/exports/car/rss.xml">RSS feed</a>
        <a href="/exports/car/inside-an-electric-car.md" download>Download Markdown</a><a href="/exports/car/print.html">Print / PDF</a>
      </nav>
      <article id="article"><div id="explore"/><Markdown content={article}/></article>
      <footer><span className="atlas-brand">✳ The Living Atlas</span><p>Get to know the things that move us.</p><a href="/">Explore the heart →</a></footer>
    </main>
  </>
);
