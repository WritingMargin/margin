import assert from "node:assert/strict";
import test from "node:test";
import { resolveAudio, coverImage } from "../shared/audio";
import { postMetadata } from "../shared/post-seo";
import type { Post } from "../shared/types";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const episode = "7makk4oTQel546B0PZlDM5";
const local = "/api/public/audio/12345678-1234-1234-1234-123456789abc";
test("audio supports canonical uploads and signed direct files", () => {
  assert.equal(resolveAudio(local)?.src, local);
  for (const ext of ["mp3", "m4a", "aac", "wav", "ogg", "oga", "flac"]) {
    const url = `https://example.test/voice.${ext}?signature=abc`;
    assert.deepEqual(resolveAudio(url), { kind: "audio", src: url, url });
  }
});
test("Spotify links normalize to allowlisted non-autoplay embeds", () => {
  for (const kind of ["episode", "show", "track", "album", "playlist", "artist"]) {
    for (const prefix of ["", "embed/", "intl-en/"]) {
      assert.deepEqual(resolveAudio(`https://open.spotify.com/${prefix}${kind}/${episode}?si=secret&autoplay=1`), {
        kind: "spotify", src: `https://open.spotify.com/embed/${kind}/${episode}`, url: `https://open.spotify.com/${kind}/${episode}`, height: ["episode", "track"].includes(kind) ? 152 : 352,
      });
    }
  }
  for (const value of ["javascript:alert(1)", "data:audio/mp3,test", "//example.test/a.mp3", "https://user:pass@example.test/a.mp3", `https://open.spotify.com.evil.test/episode/${episode}`, `https://open.spotify.com:9000/episode/${episode}`, "https://open.spotify.com/episode/bad", "https://example.test/page", local+"?x=1", "/api/private/voice.mp3", '<iframe src="https://open.spotify.com"></iframe>']) assert.equal(resolveAudio(value), undefined, value);
});
test("audio and video covers never become social images", () => {
  const post: Post = { id: "voice", title: "Voice", slug: "voice", excerpt: "", status: "draft", tags: [], createdAt: "", updatedAt: "", seo: { title: "", description: "", image: "" }, cover: `https://open.spotify.com/episode/${episode}` };
  assert.equal(coverImage(post.cover), "");
  assert.equal(postMetadata(post, "Blog", "https://example.test/default.png").image, "https://example.test/default.png");
  post.seo.image = "https://example.test/share.png";
  assert.equal(postMetadata(post, "Blog", "").image, post.seo.image);
  post.cover = "/api/public/videos/00000000-0000-4000-8000-000000000001";
  post.seo.image = "";
  assert.equal(coverImage(post.cover), "");
  assert.equal(postMetadata(post, "Blog", "https://example.test/default.png").image, "https://example.test/default.png");
});
test("audio renders between text, in covers, and in editor previews under a mount", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".renderer-test-"));
  try {
    const outfile = path.join(dir, "audio.mjs");
    await build({ stdin: { contents: 'export { default as Markdown } from "./src/Markdown"; export { default as EditorCover } from "./src/editor/EditorCover"; export { default as CoverMedia } from "./src/CoverMedia"; export { default as CoverPicker } from "./src/media/CoverPicker";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty", ".svg": "dataurl" }, outfile, jsx: "automatic", define: { "import.meta.env": JSON.stringify({ BASE_URL: "/blog/" }) } });
    const { Markdown, EditorCover, CoverMedia, CoverPicker } = await import(pathToFileURL(outfile).href);
    const content = `Before the recording.\n\n[Audio src="${local}" title="Episode one" caption="Transcript below"]\n\nAfter the recording.\n\n[Spotify src="https://open.spotify.com/episode/${episode}"]`;
    const html = renderToStaticMarkup(createElement(Markdown, { content }));
    assert.match(html, /<audio[^>]*src="\/blog\/api\/public\/audio\//);
    assert.match(html, /preload="metadata"/);
    assert.ok(html.indexOf("Before the recording") < html.indexOf("<audio"));
    assert.ok(html.indexOf("<audio") < html.indexOf("After the recording"));
    assert.match(html, /<figcaption>Transcript below<\/figcaption>/);
    assert.match(html, new RegExp(`<iframe[^>]*src="https://open.spotify.com/embed/episode/${episode}"`));
    assert.doesNotMatch(html, /<audio[^>]*autoplay/);
    const cover = renderToStaticMarkup(createElement(EditorCover, { cover: local, showCover: true }));
    assert.match(cover, /<audio/);
    assert.doesNotMatch(cover, /<img/);
    assert.equal(renderToStaticMarkup(createElement(EditorCover, { cover: local, showCover: false })), "");
    const thumbnail = renderToStaticMarkup(createElement(CoverMedia, { src: local, thumbnail: true }));
    assert.match(thumbnail, /Listen &amp; read/);
    assert.doesNotMatch(thumbnail, /<img|<audio|<iframe/);
    const picker = renderToStaticMarkup(createElement(CoverPicker, { value: local, content: "", onChange: () => {} }));
    assert.match(picker, /Audio cover/);
    assert.doesNotMatch(picker, /Recording URL or embed code/);
    const cards = renderToStaticMarkup(createElement(Markdown, { content: '[Link url="https://example.com/story" mode="preview" title="An article" description="A useful summary" image="https://example.com/cover.jpg"]' }));
    assert.match(cards, /class="link-preview-card"/);
    assert.match(cards, /A useful summary/);
    assert.match(cards, /src="https:\/\/example.com\/cover.jpg"/);
    const plain = renderToStaticMarkup(createElement(Markdown, { content: '[Link url="https://example.com" title="Example" mode="link"]' }));
    assert.doesNotMatch(plain, /link-preview-card/);
    const soundcloud = renderToStaticMarkup(createElement(Markdown, { content: '[SoundCloud src="https://soundcloud.com/forss/flickermood" mode="preview"]' }));
    assert.match(soundcloud, /w.soundcloud.com\/player/);
    assert.match(soundcloud, /show_artwork=true/);
    assert.match(soundcloud, /height="450"/);
    const unsafe = renderToStaticMarkup(createElement(Markdown, { content: '[Audio src="javascript:alert(1)"]' }));
    assert.doesNotMatch(unsafe, /<audio|<iframe|javascript:/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("SoundCloud accepts tracks, playlists and widget URLs with explicit artwork modes", () => {
  for (const target of ["https://soundcloud.com/forss/flickermood", "https://soundcloud.com/artist/sets/album", "https://api.soundcloud.com/tracks/293"]) {
    const compact = resolveAudio(target)!;
    const preview = resolveAudio(target, "preview")!;
    assert.equal(compact.kind, "soundcloud");
    assert.equal(new URL(compact.src).searchParams.get("show_artwork"), "false");
    assert.equal(new URL(preview.src).searchParams.get("visual"), "true");
    assert.equal(new URL(preview.src).searchParams.get("show_artwork"), "true");
    assert.equal(new URL(preview.src).searchParams.get("auto_play"), "false");
    assert.equal(preview.height, 450);
    assert.equal(resolveAudio(compact.src, "preview")?.src, preview.src);
  }
  assert.equal(resolveAudio(`https://open.spotify.com/episode/${episode}`, "preview")?.height, 352);
  for (const url of ["https://soundcloud.com.evil.test/user/track", "https://w.soundcloud.com/player/?url=https://example.test/audio.mp3", "https://w.soundcloud.com/player/?url=https://w.soundcloud.com/player/", "https://soundcloud.com:8000/user/track"]) assert.equal(resolveAudio(url), undefined);
});

test("native audio preview grants retain their URL", () => {
 const src = `/api/public/audio/12345678-1234-1234-1234-123456789abc?preview=${"a".repeat(43)}`;
 assert.deepEqual(resolveAudio(src), {kind: "audio", src, url: src});
 assert.equal(resolveAudio(src + "&extra=bad"), undefined);
});
