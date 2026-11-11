import assert from "node:assert/strict";
import test from "node:test";
import { galleryImageURL } from "./media/gallery-images";

test("gallery covers preserve stored images and convert Cloudinary videos to still images", () => {
  const asset = {
    public_id: "margin/my.article",
    secure_url:
      "https://res.cloudinary.com/demo/video/upload/v123/margin/my.article.mp4",
    resource_type: "video",
    format: "mp4",
  };
  assert.equal(
    galleryImageURL(asset),
    "https://res.cloudinary.com/demo/video/upload/v123/margin/my.article.jpg",
  );
  for (const url of [
    "https://images.example.test/cover.jpg",
    "/api/public/covers/00000000-0000-4000-8000-000000000001",
    "/api/assets/00000000-0000-4000-8000-000000000001.png",
  ]) {
    assert.equal(
      galleryImageURL({
        public_id: "image",
        secure_url: url,
        resource_type: "image",
      }),
      url,
    );
  }
  assert.equal(
    galleryImageURL({
      ...asset,
      secure_url:
        "https://res.cloudinary.com/demo/video/upload/v123/movie.webm",
      format: undefined,
    }),
    "https://res.cloudinary.com/demo/video/upload/v123/movie.jpg",
  );
});

test("gallery covers reject unsafe URLs, audio and unsupported video hosts", () => {
  for (const secure_url of [
    "javascript:alert(1)",
    "data:image/png;base64,test",
    "https://user:secret@example.test/image.jpg",
    "/api/private/file",
  ]) {
    assert.equal(
      galleryImageURL({
        public_id: "unsafe",
        secure_url,
        resource_type: "image",
      }),
      undefined,
    );
  }
  for (const secure_url of [
    "https://example.test/video.mp4",
    "https://res.cloudinary.com.evil.test/demo/video/upload/movie.mp4",
    "https://res.cloudinary.com/demo/video/authenticated/movie.mp4",
  ]) {
    assert.equal(
      galleryImageURL({
        public_id: "video",
        secure_url,
        resource_type: "video",
        format: "mp4",
      }),
      undefined,
    );
  }
  assert.equal(
    galleryImageURL({
      public_id: "audio",
      secure_url: "https://res.cloudinary.com/demo/video/upload/song.mp3",
      resource_type: "video",
      format: "mp3",
    }),
    undefined,
  );
});
