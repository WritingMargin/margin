import assert from "node:assert/strict";
import test from "node:test";
import { resolveHostedMedia, hostedMediaInput } from "../shared/hosted-media";
import { resolveAudio, coverImage } from "../shared/audio";
import { resolveVideo } from "../shared/video";

const samples = [
  ["Descript", "https://share.descript.com/view/TXEDniZ8UEM", "https://share.descript.com/embed/TXEDniZ8UEM"],
  ["VEED", "https://veed.io/view/3bb96100-cec4-4051-aa66-0363e0336094", "https://www.veed.io/embed/3bb96100-cec4-4051-aa66-0363e0336094"],
  ["Riverside", "https://api.riverside.fm/embeddable-components/embedded-assets/public/g8Ekqw_pE0Z_", "https://api.riverside.fm/embeddable-components/embedded-assets/public/g8Ekqw_pE0Z_"],
];

test("published hosted media works for both article video and audio covers without copying the file", () => {
  for (const [provider, input, src] of samples) {
    for (const raw of [input, src, `${input}/?autoplay=1&token=discard#secret`]) {
      assert.deepEqual(resolveVideo(raw), { kind: "embed", provider, src });
      const audio = resolveAudio(raw);
      assert.equal(audio?.kind, "embed");
      assert.equal(audio?.provider, provider);
      assert.equal(audio?.src, src);
      assert.equal(coverImage(raw), "");
    }
  }
});

test("hosted player allowlist rejects private editors, misleading hosts, credentials, ports, paths and HTML", () => {
  for (const raw of [
    "https://share.descript.com.evil.test/view/TXEDniZ8UEM",
    "https://share.descript.com:9000/view/TXEDniZ8UEM",
    "https://user:password@share.descript.com/view/TXEDniZ8UEM",
    "https://share.descript.com/view/TXEDniZ8UEM/other",
    "https://share.descript.com/view/%54XEDniZ8UEM",
    "https://web.descript.com/project/TXEDniZ8UEM",
    "https://www.veed.io/edit/3bb96100-cec4-4051-aa66-0363e0336094",
    "https://www.veed.io/view/bad-id",
    "https://riverside.com/dashboard/studios/project",
    "https://api.riverside.fm/embeddable-components/embedded-assets/private/g8Ekqw_pE0Z_",
    "javascript:alert(1)",
  ]) {
    assert.equal(resolveHostedMedia(new URL(raw)), undefined, raw);
    assert.equal(resolveAudio(raw), undefined, raw);
    assert.equal(resolveVideo(raw), undefined, raw);
  }
});

test("provider embed paste extracts one validated source and discards all executable markup", () => {
  const src = samples[2][2];
  assert.equal(hostedMediaInput(`<iframe src="${src}?autoplay=1&amp;foo=bar" onload="alert(1)" width="560"></iframe>`), src);
  assert.equal(hostedMediaInput(`<iframe src='${src}'></iframe>`), src);
  for (const raw of [
    `<iframe src="https://example.com"></iframe>`,
    `<iframe src="${src}" src="https://example.com"></iframe>`,
    `<iframe src="${src}"><script>alert(1)</script></iframe>`,
    `<iframe src="${src}"></iframe><script>alert(1)</script>`,
    `<iframe src="${src}"></iframe><iframe src="${src}"></iframe>`,
  ]) assert.equal(hostedMediaInput(raw), raw);
});
