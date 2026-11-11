import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('./offline-worker.js', import.meta.url), 'utf8');

function workerHarness(html = '<script src="/blog/assets/app.js"></script>') {
  const listeners = new Map();
  const stores = new Map();
  const failedAssets = new Set();
  let online = true;
  const caches = {
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        match: async key => entries.get(typeof key === 'string' ? key : key.url)?.clone(),
        put: async (key, response) => entries.set(typeof key === 'string' ? key : key.url, response.clone()),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
  };
  const fetch = async key => {
    const url = new URL(typeof key === 'string' ? key : key.url, 'https://margin.test');
    if (!online || failedAssets.has(url.pathname)) throw new TypeError('offline');
    return new Response(url.pathname === '/blog/admin' ? html : 'asset', { status: 200 });
  };
  vm.runInNewContext(source, {
    URL, Response, caches, fetch,
    self: {
      registration: { scope: 'https://margin.test/blog/' },
      addEventListener: (name, listener) => listeners.set(name, listener),
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
  });
  return {
    stores, failedAssets,
    setOnline: value => { online = value; },
    warm: async assets => {
      let task;
      listeners.get('message')({ data: { type: 'warm-writer', assets }, waitUntil: promise => { task = promise; } });
      await task;
    },
    navigate: async path => {
      let result;
      listeners.get('fetch')({
        request: { url: `https://margin.test${path}`, method: 'GET', mode: 'navigate' },
        respondWith: promise => { result = promise; },
      });
      return result;
    },
  };
}

test('writer shell and code remain available offline without caching APIs', async () => {
  const listeners = new Map();
  const entries = new Map();
  let online = true;
  const cache = {
    match: async key => entries.get(typeof key === 'string' ? key : key.url)?.clone(),
    put: async (key, response) => entries.set(typeof key === 'string' ? key : key.url, response.clone()),
  };
  const context = {
    URL, Response,
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async key => {
      if (!online) throw new TypeError('offline');
      return new Response(String(key).endsWith('/admin') ? '<script src="/blog/assets/editor.js"></script>' : String(key), { status: 200 });
    },
    self: {
      registration: { scope: 'https://margin.test/blog/' },
      addEventListener: (name, listener) => listeners.set(name, listener),
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
  };
  vm.runInNewContext(source, context);
  let warm;
  listeners.get('message')({ data: {
    type: 'warm-writer',
    assets: ['https://margin.test/blog/assets/editor.js', 'https://margin.test/blog/api/session'],
  }, waitUntil: promise => { warm = promise; } });
  await warm;
  assert.ok(entries.has('/blog/admin'));
  assert.ok(entries.has('https://margin.test/blog/assets/editor.js'));
  assert.ok(!entries.has('https://margin.test/blog/api/session'));

  online = false;
  async function dispatch(path, mode = 'navigate') {
    let result;
    listeners.get('fetch')({
      request: { url: `https://margin.test${path}`, method: 'GET', mode },
      respondWith: promise => { result = promise; },
    });
    return result;
  }
  assert.equal((await dispatch('/blog/admin/posts/new')).status, 200);
  assert.equal((await dispatch('/blog/')).headers.get('location'), 'https://margin.test/blog/admin/posts/new');
  assert.equal((await dispatch('/blog/assets/editor.js', 'cors')).status, 200);
  assert.equal(await dispatch('/blog/api/session', 'cors'), undefined);
});

test('a worker update keeps the previous shell until the new cache is ready', async () => {
  const listeners = new Map();
  const oldName = 'margin-writer-%2Fblog%2F-previous';
  const old = new Map([['/blog/admin', new Response('previous shell')]]);
  const names = new Set([oldName]);
  const context = {
    URL, Response,
    caches: {
      open: async name => {
        names.add(name);
        return {
          match: async key => name === oldName ? old.get(key)?.clone() : undefined,
          put: async () => {},
        };
      },
      keys: async () => [...names],
      delete: async name => names.delete(name),
    },
    fetch: async () => { throw new TypeError('offline'); },
    self: {
      registration: { scope: 'https://margin.test/blog/' },
      addEventListener: (name, listener) => listeners.set(name, listener),
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
  };
  vm.runInNewContext(source, context);
  let activation;
  listeners.get('activate')({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.ok(names.has(oldName));
  let navigation;
  listeners.get('fetch')({
    request: { url: 'https://margin.test/blog/admin/posts/new', method: 'GET', mode: 'navigate' },
    respondWith: promise => { navigation = promise; },
  });
  assert.equal(await (await navigation).text(), 'previous shell');
});

test('a failed asset fetch keeps the previous complete cache', async () => {
  const worker = workerHarness();
  const previous = 'margin-writer-%2Fblog%2F-previous';
  worker.stores.set(previous, new Map([['/blog/admin', new Response('previous shell')]]));
  worker.failedAssets.add('/blog/assets/app.js');
  await worker.warm([]);
  assert.ok(worker.stores.has(previous));
  worker.setOnline(false);
  assert.equal(await (await worker.navigate('/blog/admin/posts/new')).text(), 'previous shell');
  worker.setOnline(true);
  worker.failedAssets.clear();
  await worker.warm([]);
  assert.ok(!worker.stores.has(previous));
  worker.setOnline(false);
  assert.match(await (await worker.navigate('/blog/admin/posts/new')).text(), /app.js/);
});

test('a shell without usable code is not offered for offline navigation', async () => {
  const worker = workerHarness('<html>Incomplete build</html>');
  await worker.warm(['https://other.test/assets/foreign.js', 'https://margin.test/blog/api/session']);
  worker.setOnline(false);
  assert.equal((await worker.navigate('/blog/admin/posts/new')).status, 0);
  assert.equal(await worker.navigate('/blog/post/public'), undefined);
});
