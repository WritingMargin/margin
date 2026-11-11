// Opt-in integration test: real Nginx/Apache containers, synthetic upstream only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isIP } from "node:net";
const dir = await mkdtemp(path.join(tmpdir(), "margin-deploy-proxy-"));
const binary = path.join(
  dir,
  process.platform === "win32" ? "margin.exe" : "margin",
);
const containers = [];
const exec = (bin, args) =>
  execFileSync(bin, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const docker = (...args) => exec("docker", args);
const upstream = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (Buffer.byteLength(body) > 52428800) {
    res.writeHead(413, { "X-Test-Upstream-Limit": "true" });
    res.end("Upstream body limit");
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      path: req.url,
      method: req.method,
      body,
      headers: req.headers,
    }),
  );
});
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const send = url.startsWith("https:") ? httpsRequest : httpRequest;
    const req = send(
      url,
      { rejectUnauthorized: false, timeout: 5000, ...options },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(Error("proxy timed out")));
    req.end(options.body);
  });
}
async function ready(url) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      return await request(url);
    } catch (error) {
      if (attempt === 29) throw error;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
async function apacheBase() {
  let base = docker(
    "run",
    "--rm",
    "httpd:2.4-alpine",
    "cat",
    "/usr/local/apache2/conf/httpd.conf",
  );
  for (const module of [
    "proxy_module",
    "proxy_http_module",
    "headers_module",
    "ssl_module",
    "socache_shmcb_module",
    "alias_module",
  ])
    base = base.replace(
      new RegExp("^#(LoadModule " + module + " .+)$", "m"),
      "$1",
    );
  base +=
    "\nListen 443\nServerName blog.example.test\nInclude /tmp/site.conf\n";
  await writeFile(path.join(dir, "httpd.conf"), base);
}
async function testProxy(server, tls, upstreamPort, mount = "") {
  const tag = `${server}-${tls ? "tls" : "http"}${mount ? "-mounted" : ""}`;
  const config = path.join(dir, tag + ".conf");
  const args = [
    "deploy",
    server,
    "--domain",
    "blog.example.test",
    "--upstream",
    `http://host.docker.internal:${upstreamPort}`,
    "--output",
    config,
  ];
  args.push(
    ...(tls && !mount
      ? ["--tls-cert", "/tmp/test-cert.pem", "--tls-key", "/tmp/test-key.pem"]
      : tls ? [] : ["--http-only"]),
  );
  if (mount) args.push("--base-path",mount);
  exec(binary, args);
  if (mount) {
    const snippet=await readFile(config,"utf8");
    if (server === "nginx") {
      const ssl=tls?'listen 443 ssl; ssl_certificate /tmp/test-cert.pem; ssl_certificate_key /tmp/test-key.pem;':'listen 80;';
      const redirect=tls?'server { listen 80; return 308 https://blog.example.test$request_uri; }':'';
      await writeFile(config,`${redirect} server { ${ssl} server_name blog.example.test; location = / { return 200 "Existing main site"; } ${snippet} }`);
    } else {
      const ssl=tls?'SSLEngine on\nSSLCertificateFile /tmp/test-cert.pem\nSSLCertificateKeyFile /tmp/test-key.pem':'';
      const redirect=tls?'<VirtualHost *:80>\nServerName blog.example.test\nRedirect 308 "/" "https://blog.example.test/"\n</VirtualHost>':'';
      await writeFile(config,`${redirect}\n<VirtualHost *:${tls?443:80}>\nServerName blog.example.test\n${ssl}\n${snippet}\n</VirtualHost>`);
    }
  }
  const image = server === "nginx" ? "nginx:stable-alpine" : "httpd:2.4-alpine";
  const mounts = [
    "-v",
    `${config}:${server === "nginx" ? "/etc/nginx/conf.d/default.conf" : "/tmp/site.conf"}:ro`,
    "-v",
    `${dir}/cert.pem:/tmp/test-cert.pem:ro`,
    "-v",
    `${dir}/key.pem:/tmp/test-key.pem:ro`,
  ];
  if (server === "apache")
    mounts.push(
      "-v",
      `${dir}/httpd.conf:/usr/local/apache2/conf/httpd.conf:ro`,
    );
  const hosts =
    process.platform === "linux"
      ? ["--add-host=host.docker.internal:host-gateway"]
      : [];
  docker(
    "run",
    "--rm",
    ...hosts,
    ...mounts,
    image,
    ...(server === "nginx" ? ["nginx", "-t"] : ["httpd", "-t"]),
  );
  const id = docker(
    "run",
    "--rm",
    "-d",
    ...hosts,
    ...mounts,
    "-p",
    "127.0.0.1::80",
    "-p",
    "127.0.0.1::443",
    image,
  );
  containers.push(id);
  const port = docker("port", id, (tls ? "443" : "80") + "/tcp")
    .split(":")
    .at(-1);
  const origin = `${tls ? "https" : "http"}://127.0.0.1:${port}`;
  await ready(origin + "/");
  const response = await request(origin + mount + "/api/check?x=one%20two", {
    method: "POST",
    headers: {
      Host: "blog.example.test",
      "X-Forwarded-For": "203.0.113.9",
      "X-Forwarded-Proto": "malicious",
      Forwarded: "for=malicious",
      "Content-Type": "text/plain",
    },
    body: "A test body: <>&",
  });
  assert.equal(response.status, 200, response.body);
  const echoed = JSON.parse(response.body);
  assert.equal(echoed.path, mount + "/api/check?x=one%20two");
  assert.equal(echoed.method, "POST");
  assert.equal(echoed.body, "A test body: <>&");
  assert.equal(echoed.headers.host, "blog.example.test");
  assert.equal(echoed.headers["x-forwarded-proto"], tls ? "https" : "http");
  assert.equal(echoed.headers["x-forwarded-host"], "blog.example.test");
  assert.equal(echoed.headers["x-forwarded-port"], tls ? "443" : "80");
  assert.notEqual(echoed.headers["x-forwarded-for"], "203.0.113.9");
  assert(isIP(echoed.headers["x-forwarded-for"]));
  assert.equal(echoed.headers.forwarded, undefined);
  const tooBig = await request(origin + mount + "/upload", {
    method: "POST",
    body: "x".repeat(52428801),
  });
  assert.equal(tooBig.status, 413);
  assert.equal(
    tooBig.headers["x-test-upstream-limit"],
    server === "apache" ? "true" : undefined,
  );
  if(mount) {
    const discoveryPaths = [
      "/.well-known/oauth-authorization-server" + mount,
      "/.well-known/oauth-protected-resource" + mount + "/mcp",
      "/.well-known/oauth-protected-resource" + mount + "/api",
    ];
    for (const discoveryPath of discoveryPaths) {
      const discovery = await request(origin + discoveryPath, {
        headers: { "X-Forwarded-Proto": "malicious" },
      });
      assert.equal(discovery.status, 200, discovery.body);
      const metadata = JSON.parse(discovery.body);
      assert.equal(metadata.path, discoveryPath);
      assert.equal(metadata.headers.host, "blog.example.test");
      assert.equal(metadata.headers["x-forwarded-proto"], tls ? "https" : "http");
      assert.equal((await request(origin + discoveryPath + "-other")).status, 404);
      assert.equal((await request(origin + discoveryPath + "/other")).status, 404);
    }
    assert.equal((await request(origin + "/.well-known/oauth-authorization-server/other")).status, 404);
    const homepage=await request(origin+"/");
    assert.equal(homepage.status,200);
    assert(homepage.body.includes(server === "nginx" ? "Existing main site" : "It works!"));
    const exact=await request(origin+mount+"?x=1");
    assert.equal(exact.status,200);
    assert.equal(JSON.parse(exact.body).path,mount+"?x=1");
    assert.equal((await request(origin+mount+"ger")).status,404);
  }
  if (tls) {
    const httpPort = docker("port", id, "80/tcp").split(":").at(-1);
    const redirect = await request(
      `http://127.0.0.1:${httpPort}/admin?test=1`,
      { method: "POST", body: "test" },
    );
    assert.equal(redirect.status, 308);
    assert.equal(
      redirect.headers.location,
      "https://blog.example.test/admin?test=1",
    );
  }
  docker("stop", id);
  containers.splice(containers.indexOf(id), 1);
  console.log(
    `${tag}: syntax, forwarding, spoofed headers, upload limit${tls ? ", HTTPS and redirect" : ""} passed.`,
  );
}
try {
  exec("go", ["-C", "cli", "build", "-o", binary, "./cmd/margin"]);
  exec("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-subj",
    "/CN=blog.example.test",
    "-keyout",
    path.join(dir, "key.pem"),
    "-out",
    path.join(dir, "cert.pem"),
  ]);
  upstream.listen(0, "0.0.0.0");
  await once(upstream, "listening");
  await apacheBase();
  for (const server of ["nginx", "apache"])
    for (const tls of [false,true]) await testProxy(server,tls,upstream.address().port,"/blog");
  for (const server of ["nginx", "apache"])
    for (const tls of [false, true])
      await testProxy(server, tls, upstream.address().port);
} finally {
  for (const id of containers) {
    try {
      docker("stop", id);
    } catch {}
  }
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
