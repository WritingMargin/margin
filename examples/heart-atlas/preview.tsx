import { createRoot } from "react-dom/client";
import Markdown from "../../src/Markdown";
import article from "./article.md";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/lora/400.css";
import "./preview.css";

createRoot(document.getElementById("root")!).render(
  <>
    <header className="atlas-header">
      <a href="#" className="atlas-brand">
        <span aria-hidden="true">✳</span> The Living Atlas
        <span className="atlas-brand-note">A JOURNAL OF HUMAN BIOLOGY</span>
      </a>
      <nav aria-label="Main navigation">
        <a href="/post/inside-an-electric-car/">The car</a>
        <a href="#explore">Interactive atlas ↗</a>
      </nav>
    </header>
    <main>
      <section className="atlas-intro" aria-labelledby="page-title">
        <div className="atlas-eyebrow">
          <span>VOLUME 01</span>
          <span>THE CARDIOVASCULAR SYSTEM</span>
        </div>
        <div className="atlas-title-row">
          <h1 id="page-title">
            A closer look at
            <br />
            the <em>human heart.</em>
          </h1>
          <div className="atlas-deck">
            <p>
              Small enough to fit in your hand.
              <br />
              Complex enough to spend a lifetime exploring.
            </p>
            <a href="#explore">
              Start with the anatomy <span>↓</span>
            </a>
          </div>
        </div>
        <div className="atlas-meta">
          <span>ANATOMY & PHYSIOLOGY</span>
          <span>AN INTERACTIVE FIELD GUIDE</span>
          <span>16 OCTOBER 2026</span>
        </div>
      </section>
      <nav className="atlas-exports" aria-label="Article exports">
        <a href="/exports/rss-reader.html">RSS reading view</a>
        <a href="/exports/rss.xml">RSS feed</a>
        <a href="/exports/inside-the-human-heart.md" download>Download Markdown</a>
        <a href="/exports/print.html">Print / PDF</a>
      </nav>
      <article id="article">
        <div id="explore" />
        <Markdown content={article} />
      </article>
      <footer>
        <span className="atlas-brand">✳ The Living Atlas</span>
        <p>Stay curious about the world within.</p>
        <span>A science blog built with Margin.</span>
      </footer>
    </main>
  </>,
);
