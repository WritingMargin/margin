import assert from "node:assert/strict";
import test from "node:test";
import fixtures from "../shared/social-post-fixtures.json";
import { socialPost } from "../shared/social-posts";

test("social post URL normalization only permits supported posts", () => {
  for (const fixture of fixtures) {
    const post = socialPost(fixture.input);
    assert.equal(post?.provider || "", fixture.provider, fixture.input);
    if (post) {
      assert.equal(post.url, fixture.url);
      assert.ok(
        [
          "platform.twitter.com",
          "www.instagram.com",
          "www.linkedin.com",
        ].includes(new URL(post.embedUrl).host),
      );
      assert.equal(new URL(post.embedUrl).protocol, "https:");
    }
  }
});
