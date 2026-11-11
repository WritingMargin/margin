/** Explicit manual integration check: MARGIN_DOCKER_TEST=true node --import tsx tests/docker-smoke.ts */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

if (process.env.MARGIN_DOCKER_TEST !== 'true') throw new Error('Set MARGIN_DOCKER_TEST=true to create disposable Docker test resources.');
const execute = promisify(execFile);
const image = process.env.MARGIN_DOCKER_IMAGE || 'margin-blog:local';
const docker = async (...args: string[]) => { try { return (await execute('docker', args, { maxBuffer: 1024 * 1024 })).stdout.trim(); } catch (error: any) { throw new Error(`Docker ${args[0]} failed: ${error.stderr || 'command failed'}`); } };
const suffix = randomBytes(5).toString('hex');
const network = `margin-smoke-${suffix}`;
const containers: string[] = [];
const accessKey = 'margin-smoke';
const secretKey = randomBytes(24).toString('hex');
const encryptionKey = randomBytes(32).toString('hex');
const ownerPassword = randomBytes(24).toString('hex');
const bucket = `margin-smoke-${suffix}`;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check: () => Promise<boolean>, label: string) {
  for (let i = 0; i < 45; i++) { try { if (await check()) return; } catch {} await pause(1000); }
  throw new Error(`Timed out: ${label}`);
}
async function start(name: string, args: string[]) {
  containers.push(name);
  return docker('run', '-d', '--name', name, '--network', network, ...args);
}
async function port(name: string, containerPort: string) {
  const binding = JSON.parse(await docker('inspect', '--format', '{{json .NetworkSettings.Ports}}', name));
  assert(binding[containerPort]?.length, `${name} has no published port: ${await docker('logs', name)}`);
  return binding[containerPort][0].HostPort as string;
}
let networkCreated = false;
try {
  await docker('network', 'create', network); networkCreated = true;
  const minio = `${network}-s3`;
  await start(minio, ['--network-alias', 's3', '--tmpfs', '/data', '-p', '127.0.0.1::9000', '-e', `ROOT_ACCESS_KEY_ID=${accessKey}`, '-e', `ROOT_SECRET_ACCESS_KEY=${secretKey}`, 'versity/versitygw@sha256:30292fc2eeacc67a36993b01f7a7a5e3361a19cced0e80c1d71cfa2a4b0a2499', '--port', ':9000', '--health', '/health', 'posix', '/data']);
  const endpoint = `http://127.0.0.1:${await port(minio, '9000/tcp')}`;
  await waitFor(async () => (await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(2000) })).ok, 'Versity S3 readiness');
  const s3 = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: accessKey, secretAccessKey: secretKey } });
  const initializer = `${network}-initialize`; containers.push(initializer);
  await docker('run', '--rm', '--name', initializer, '--network', network, '-e', 'S3_ENDPOINT=http://s3:9000', '-e', 'S3_REGION=us-east-1', '-e', 'S3_FORCE_PATH_STYLE=true', '-e', `S3_BUCKET=${bucket}`, '-e', `S3_ACCESS_KEY_ID=${accessKey}`, '-e', `S3_SECRET_ACCESS_KEY=${secretKey}`, image, 'margin', 'init-bucket');
  containers.pop();
  console.log('Versity S3 ready; private test bucket created.');
  const postgres = `${network}-postgres`;
  await start(postgres, ['--network-alias', 'db', '--tmpfs', '/var/lib/postgresql/data', '-e', `POSTGRES_PASSWORD=${secretKey}`, '-e', 'POSTGRES_USER=margin', '-e', 'POSTGRES_DB=margin', 'postgres:17-alpine']);
  await waitFor(async () => { await docker('exec', postgres, 'pg_isready', '-U', 'margin', '-d', 'margin'); return true; }, 'Postgres readiness');
  const central = `${network}-central`;
  await start(central, ['--network-alias', 'central', 'node:22-bookworm-slim', 'node', '-e', "require('node:http').createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({entitlements:{active:false,planId:null,expiresAt:null}}));}).listen(3010,'0.0.0.0')"]);
  for (const database of ['sqlite', 'postgres']) {
    const name = `${network}-app-${database}`;
    const args = ['-p', '127.0.0.1::3001', '-e', 'MARGIN_ENV=development', '-e', 'AI_SERVICE_URL=http://central:3010', '-e', 'AI_SERVICE_TOKEN=fixture', '-e', `CONTENT_ENCRYPTION_KEY=${encryptionKey}`, '-e', 'S3_ENDPOINT=http://s3:9000', '-e', 'S3_REGION=us-east-1', '-e', 'S3_FORCE_PATH_STYLE=true', '-e', `S3_BUCKET=${bucket}`, '-e', `S3_ACCESS_KEY_ID=${accessKey}`, '-e', `S3_SECRET_ACCESS_KEY=${secretKey}`];
    if (database === 'postgres') args.push('-e', `DATABASE_URL=postgresql://margin:${secretKey}@db:5432/margin?sslmode=disable`);
    await start(name, [...args, image]);
    const origin = `http://127.0.0.1:${await port(name, '3001/tcp')}`;
    await waitFor(async () => (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) })).ok, `${database} app readiness`);
    let cookie = '';
    async function request(url: string, method = 'GET', body?: unknown) {
      const response = await fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const result = await response.json();
      assert(response.ok, `${database} ${method} ${url}: ${response.status} ${JSON.stringify(result)}`);
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return result;
    }
    assert.equal((await request('/api/health')).database, database);
    await request('/api/setup', 'POST', { email: 'smoke@example.test', password: ownerPassword });
    assert.equal((await request('/api/storage')).reachable, true);
    const created = await request('/api/posts', 'POST', { title: `Real S3 with ${database}`, slug: `real-s3-${database}`, content: `# Draft ${database}\n\nStored in a real S3 service.\n` });
    assert.equal((await request(`/api/posts/${created.id}`)).content, created.content);
    assert.deepEqual(await request('/api/public/posts'), []);
    const content = `# Published ${database}\n\nSaved through the Docker image to Versity S3.\n`;
    const published = await request(`/api/posts/${created.id}`, 'PUT', { revision: created.revision, status: 'published', content });
    assert.equal((await request(`/api/public/posts/real-s3-${database}`)).content, content);
    const html = await (await fetch(`${origin}/post/real-s3-${database}`)).text();
    assert.match(html, /Saved through the Docker image to Versity S3/);
    const script = html.match(/src="([^"]+\.js)"/)?.[1];
    assert(script, 'embedded public script missing');
    assert.equal((await fetch(origin + script)).status, 200);
    const workspace = await fetch(`${origin}/admin`);
    assert.equal(workspace.status, 200);
    const objects = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `posts/${created.id}/` }));
    assert.equal(objects.KeyCount, 2);
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `posts/${created.id}/${published.revision}.md` }));
    const stored = Buffer.from(await object.Body!.transformToByteArray());
    assert.ok(!stored.includes(Buffer.from(content)));
    assert.equal(stored.subarray(0, 8).toString(), 'MRGSEC01');
    console.log(`PASS ${database}: owner setup, S3 health, draft creation/read, revision update, publication, and actual S3 object verification.`);
    await docker('stop', '--time', '5', name);
  }
  s3.destroy();
} finally {
  for (const name of containers.reverse()) { try { await docker('rm', '-f', '-v', name); } catch (error) { console.error(`Cleanup failed for ${name}:`, (error as Error).message); } }
  if (networkCreated) await docker('network', 'rm', network);
  console.log('Removed disposable test containers and network.');
}
