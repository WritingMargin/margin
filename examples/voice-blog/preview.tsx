import { createRoot } from "react-dom/client";
import { BlogArticle } from "../../src/blog/BlogArticle";
import { defaultTheme, type Post } from "../../shared/types";
import content from "./article.md";
import "../../src/styles.css";
import "./preview.css";

const theme = structuredClone(defaultTheme);
theme.article.font = "serif";
const post: Post = {
  id: "voice-blog-sample", title: "Stories sound better with a little space.", slug: "stories-in-sound",
  excerpt: "A sample audio article, with a Spotify episode, room for your words, and a recording linked directly from the web.",
  status: "draft", tags: ["Audio journal"], cover: "", content,
  createdAt: "2026-10-28T12:00:00Z", updatedAt: "2026-10-28T12:00:00Z", seo: { title: "", description: "", image: "" },
};
createRoot(document.getElementById("root")!).render(<>
  <header className="sample-masthead"><a href="#">Margin<span>The audio journal</span></a><span>Sample article · 01</span></header>
  <div className="sample-shell redesigned-blog"><BlogArticle theme={theme} post={post} /></div>
  <aside className="sample-howto" aria-labelledby="direct-audio-heading">
    <span className="sample-kicker">Try it in your article</span>
    <h2 id="direct-audio-heading">Link your recording directly.</h2>
    <p>Choose <strong>Insert media → From a link</strong>, paste a public MP3, M4A, WAV, Ogg, AAC, or FLAC URL, preview it, then insert it. You can also paste this tag into the editor:</p>
    <pre><code>{'[Audio src="https://your-site.com/recordings/episode.mp3" title="Listen to my episode"]'}</code></pre>
    <p>The URL must point to the audio file itself. To use a file from your computer, choose <strong>Insert media → Uploads → Audio</strong>.</p>
    <a href="/article.md" download>Download this sample’s article content ↗</a>
  </aside>
  <footer className="sample-footer">Made with Margin · Local sample preview</footer>
</>);
