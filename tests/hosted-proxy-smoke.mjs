// Opt-in: real Nginx, disposable network, synthetic HTTPS upstream only.
// Run: node tests/hosted-proxy-smoke.mjs (Docker and Go must be available).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { request as httpsRequest } from "node:https";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = await mkdtemp(path.join(tmpdir(), "margin-hosted-proxy-"));
const image = process.env.MARGIN_TEST_NGINX_IMAGE || "nginx:stable-alpine";
const network = `margin-hosted-proxy-${process.pid}-${Date.now()}`;
const containers = [];
let createdNetwork = false;
const exec = (bin, args, options = {}) => execFileSync(bin, args, {
  encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"], ...options,
}).trim();
const docker = (...args) => exec("docker", args);
const mount = (file, destination) => ["-v", `${path.join(dir, file)}:${destination}:ro`];
const assigned = "assigned.hosting.test";
const publicHost = "publication.example.test";

async function certificates() {
  await writeFile(path.join(dir, "ca.cnf"), `[req]\ndistinguished_name=dn\n[dn]\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n`);
  for (const name of ["ca", "untrusted"]) exec("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", `/CN=${name}`, "-config", path.join(dir, "ca.cnf"), "-extensions", "v3_ca", "-keyout", path.join(dir, `${name}.key`), "-out", path.join(dir, `${name}.pem`)]);
  exec("openssl", ["req", "-new", "-newkey", "rsa:2048", "-nodes", "-subj", `/CN=${assigned}`, "-keyout", path.join(dir, "server.key"), "-out", path.join(dir, "server.csr")]);
  await writeFile(path.join(dir, "leaf.cnf"), `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:${assigned}\n`);
  exec("openssl", ["x509", "-req", "-in", path.join(dir, "server.csr"), "-CA", path.join(dir, "ca.pem"), "-CAkey", path.join(dir, "ca.key"), "-CAcreateserial", "-days", "1", "-extfile", path.join(dir, "leaf.cnf"), "-out", path.join(dir, "server.pem")]);
}
async function generator() {
  await writeFile(path.join(dir, "go.mod"), `module hosted-proxy-fixture\n\ngo 1.27.4\n\nrequire margin-cli v0.0.0\nreplace margin-cli => ${JSON.stringify(path.join(repo, "cli"))}\n`);
  await writeFile(path.join(dir, "main.go"), `package main\nimport("fmt";"os"; margincli "margin-cli")\nfunc main(){config,err:=margincli.GenerateHostedProxy(os.Args[1],os.Args[2]);if err!=nil{panic(err)};fmt.Print(config)}\n`);
  const binary = path.join(dir, "generate");
  exec("go", ["build", "-o", binary, "."], { cwd: dir });
  return binary;
}
function startContainer(name, args) {
  containers.push(name);
  docker("run", "--rm", "-d", "--name", name, "--network", network, ...args, image);
}
async function startUpstream() {
  await writeFile(path.join(dir, "upstream.conf"), `server { listen 443 ssl; server_name ${assigned}; ssl_certificate /tmp/server.pem; ssl_certificate_key /tmp/server.key; default_type application/json; location / { return 200 '{"uri":"$request_uri","host":"$http_host","sni":"$ssl_server_name","tls":"$ssl_protocol","method":"$request_method","forwardedHost":"$http_x_forwarded_host","forwardedProto":"$http_x_forwarded_proto","forwardedPort":"$http_x_forwarded_port","forwardedFor":"$http_x_forwarded_for","forwarded":"$http_forwarded"}'; } }`);
  startContainer(`${network}-upstream`, ["--network-alias", assigned, "--network-alias", "wrong.hosting.test", ...mount("upstream.conf", "/etc/nginx/conf.d/default.conf"), ...mount("server.pem", "/tmp/server.pem"), ...mount("server.key", "/tmp/server.key")]);
}
function request(origin, uri, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(origin + uri, { rejectUnauthorized: false, timeout: 5000, method, headers: {
      Host: publicHost, "X-Forwarded-Host": "spoofed.test", "X-Forwarded-Proto": "http", "X-Forwarded-Port": "80", "X-Forwarded-For": "203.0.113.8", Forwarded: "for=spoofed",
    } }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("proxy request timed out")));
    req.end();
  });
}
async function ready(origin, uri) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { return await request(origin, uri); }
    catch (error) {
      if (attempt === 39) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
function checkEcho(response, uri, method = "GET") {
  assert.equal(response.status, 200, response.body);
  const echo = JSON.parse(response.body);
  assert.equal(echo.uri, uri);
  assert.equal(echo.host, assigned);
  assert.equal(echo.sni, assigned);
  assert.match(echo.tls, /^TLSv1\.[23]$/);
  assert.equal(echo.method, method);
  assert.equal(echo.forwardedHost, publicHost);
  assert.equal(echo.forwardedProto, "https");
  assert.equal(echo.forwardedPort, "443");
  assert.notEqual(echo.forwardedFor, "203.0.113.8");
  assert.equal(echo.forwarded, "");
}
async function proxy(binary, basePath, upstreamHost = assigned, trust = "ca.pem") {
  const tag = `${basePath ? "mounted" : "root"}-${upstreamHost === assigned ? "matched" : "mismatch"}-${trust}`;
  const configName = `${tag}.conf`;
  let config = exec(binary, [`https://${publicHost}${basePath}`, `https://${upstreamHost}`]);
  if (basePath) config = `server { listen 443 ssl; server_name ${publicHost}; ssl_certificate /tmp/server.pem; ssl_certificate_key /tmp/server.key; location = / { return 200 "Existing main site"; } location / { return 404; }\n${config}\n}`;
  await writeFile(path.join(dir, configName), config);
  const args = [...mount(configName, "/etc/nginx/conf.d/default.conf"), ...mount("server.pem", "/tmp/server.pem"), ...mount("server.key", "/tmp/server.key"), ...mount("server.pem", `/etc/letsencrypt/live/${publicHost}/fullchain.pem`), ...mount("server.key", `/etc/letsencrypt/live/${publicHost}/privkey.pem`), ...mount(trust, "/etc/ssl/certs/ca-certificates.crt")];
  docker("run", "--rm", "--network", network, ...args, image, "nginx", "-t");
  const name = `${network}-${tag}`;
  startContainer(name, [...args, "-p", "127.0.0.1::443"]);
  const port = docker("port", name, "443/tcp").split(":").at(-1);
  const origin = `https://127.0.0.1:${port}`;
  await ready(origin, basePath + "/");
  return { origin, name };
}
async function testValid(binary, basePath) {
  const { origin } = await proxy(binary, basePath);
  const uri = `${basePath}/api/check?x=one%20two&next=%2Farticle%3Fa%3D1`;
  checkEcho(await request(origin, uri, "POST"), uri, "POST");
  if (basePath) {
    checkEcho(await request(origin, basePath + "?exact=1"), basePath + "?exact=1");
    assert.equal((await request(origin, "/")).body, "Existing main site");
    assert.equal((await request(origin, basePath + "ger")).status, 404);
  }
  for (const endpoint of [`/.well-known/oauth-authorization-server${basePath}`, `/.well-known/oauth-protected-resource${basePath}/mcp`, `/.well-known/oauth-protected-resource${basePath}/api`]) {
    checkEcho(await request(origin, endpoint + "?discovery=1"), endpoint + "?discovery=1");
    if (basePath) assert.equal((await request(origin, endpoint + "/other")).status, 404);
  }
  console.log(`${basePath || "/"}: verified TLS, Host/SNI, complete URI/query, forwarding headers and root OAuth discovery passed.`);
}
async function testRejected(binary, upstreamHost, trust) {
  const { origin, name } = await proxy(binary, "/blog", upstreamHost, trust);
  assert.equal((await request(origin, "/blog/api/check")).status, 502);
  const logs = spawnSync("docker", ["logs", name], { encoding: "utf8", timeout: 10_000 });
  assert.equal(logs.status, 0);
  const diagnostic = upstreamHost === assigned ? /upstream SSL certificate verify error/ : /upstream SSL certificate does not match/;
  assert.match(logs.stdout + logs.stderr, diagnostic);
  console.log(`Rejected upstream ${upstreamHost === assigned ? "untrusted CA" : "certificate hostname mismatch"} with HTTP 502.`);
}
try {
  await certificates();
  const binary = await generator();
  docker("network", "create", network);
  createdNetwork = true;
  await startUpstream();
  await testValid(binary, "");
  await testValid(binary, "/blog");
  await testRejected(binary, "wrong.hosting.test", "ca.pem");
  await testRejected(binary, assigned, "untrusted.pem");
} finally {
  for (const name of containers.reverse()) {
    try { docker("rm", "-f", name); } catch { /* Cleanup all remaining fixtures. */ }
  }
  if (createdNetwork) { try { docker("network", "rm", network); } catch { /* Preserve original failure. */ } }
  await rm(dir, { recursive: true, force: true });
}
