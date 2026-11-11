import assert from "node:assert/strict";
import test from "node:test";
import { resolveVideo } from "../shared/video";

test("YouTube watch, short, Shorts, live and embed links use the privacy-enhanced player", () => {
  const id = "aqz-KE-bpKQ";
  for (const url of [
    `https://youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ]) {
    assert.deepEqual(resolveVideo(url), {
      kind: "embed",
      provider: "YouTube",
      src: `https://www.youtube-nocookie.com/embed/${id}`,
    });
  }
  assert.equal(
    resolveVideo(`https://youtu.be/${id}?t=1m30s&autoplay=1`)?.src,
    `https://www.youtube-nocookie.com/embed/${id}?start=90`,
  );
});
test("Vimeo keeps unlisted hashes and timestamps", () => {
  assert.equal(
    resolveVideo("https://vimeo.com/123456/abc123")?.src,
    "https://player.vimeo.com/video/123456?h=abc123",
  );
  assert.equal(
    resolveVideo("https://player.vimeo.com/video/123456?h=abc123#t=1m")?.src,
    "https://player.vimeo.com/video/123456?h=abc123#t=60s",
  );
  assert.equal(
    resolveVideo("https://vimeo.com/channels/staffpicks/123456")?.src,
    "https://player.vimeo.com/video/123456",
  );
});
test("Mux and Cloudinary support hosted players and direct streaming links", () => {
  assert.deepEqual(
    resolveVideo("https://player.mux.com/abc123?autoplay=true"),
    { kind: "embed", provider: "Mux", src: "https://player.mux.com/abc123" },
  );
  const signed =
    "https://stream.mux.com/abc123.m3u8?token=existing-playback-token";
  assert.deepEqual(resolveVideo(signed), {
    kind: "hls",
    provider: "Mux",
    src: signed,
  });
  const cloud = resolveVideo(
    "https://player.cloudinary.com/embed/?cloud_name=demo&public_id=folder%2Fvideo",
  );
  assert.equal(cloud?.kind, "embed");
  assert.equal(
    new URL(cloud!.src).searchParams.get("public_id"),
    "folder/video",
  );
  assert.equal(
    new URL(cloud!.src).searchParams.get("player[autoplay]"),
    "false",
  );
  assert.equal(
    resolveVideo(
      "https://res.cloudinary.com/demo/video/upload/sp_auto/video.m3u8",
    )?.kind,
    "hls",
  );
  assert.equal(
    resolveVideo("https://res.cloudinary.com/demo/video/upload/f_auto/video")
      ?.kind,
    "video",
  );
  assert.equal(
    resolveVideo("https://cdn.example.com/video.webm?signature=abc")?.kind,
    "video",
  );
});
test("unsafe, unsupported and malformed player URLs cannot become embeds", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//youtube.com/watch?v=aqz-KE-bpKQ",
    "https://youtube.com.evil.example/watch?v=aqz-KE-bpKQ",
    "https://user:pass@vimeo.com/1234",
    "https://www.youtube.com/watch?v=bad",
    "https://player.mux.com/",
    "https://player.cloudinary.com/embed/?cloud_name=demo",
    "https://vimeo.com/1234?h=%3Cscript%3E",
    "https://example.com/page",
    '<iframe src="https://example.com"></iframe>',
  ])
    assert.equal(resolveVideo(url), undefined, url);
});

 test("native video URLs allow only canonical stored video paths", () => {
  const path = "/api/public/videos/12345678-1234-1234-1234-123456789abc";
  assert.deepEqual(resolveVideo(path), {kind: "video", provider: "Margin", src: path});
  for (const value of ["/api/private", path + "/../secret", path + "?token=secret", path.replace("videos", "covers")])
    assert.equal(resolveVideo(value), undefined);
 });

 test("native video preview grants retain their URL", () => {
 const src = `/api/public/videos/12345678-1234-1234-1234-123456789abc?preview=${"a".repeat(43)}`;
 assert.deepEqual(resolveVideo(src), {kind: "video", provider: "Margin", src});
 assert.equal(resolveVideo(src + "&extra=bad"), undefined);
 });
