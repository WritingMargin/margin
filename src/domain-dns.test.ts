import assert from "node:assert/strict";
import test from "node:test";
import { cnameRecord, publicDNSName } from "./settings/domain-dns";

test("DNS records use hostnames without the publication mount or port", () => {
  assert.equal(
    publicDNSName("https://blog.example.com:443/journal"),
    "blog.example.com",
  );
  assert.deepEqual(
    cnameRecord("blog.example.com/journal", " SERVER.example.net. "),
    {
      name: "blog.example.com",
      target: "server.example.net",
      text: "blog.example.com. IN CNAME server.example.net.",
    },
  );
  assert.equal(
    publicDNSName("https://bücher.example/blog"),
    "xn--bcher-kva.example",
  );
});

test("CNAME guidance rejects IPs, self-reference, and URL components in targets", () => {
  for (const target of [
    "blog.example.com",
    "BLOG.example.com.",
    "127.0.0.1",
    "127.1",
    "[::1]",
    "https://server.example.net",
    "server.example.net:3001",
    "server.example.net/blog",
    "user@server.example.net",
    "server.example.net?x=1",
    "server.example.net\nIN A 1.2.3.4",
    "localhost",
  ]) {
    assert.ok(cnameRecord("https://blog.example.com", target).error, target);
  }
  for (const url of [
    "",
    "http://blog.example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://user:secret@blog.example.com",
    "https://blog.example.com?x=1",
    "https://blog.example.com#hash",
  ]) {
    assert.equal(publicDNSName(url), null, url);
  }
});
