import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

test('mounted frontend keeps navigation, media, admin history and API inside /blog',async()=>{
 const bundle=await build({stdin:{contents:`export * from './src/base-path'; export {parseAdminRoute,adminUrl} from './src/admin-route'; export {safeMediaUrl} from './src/media'; export {api} from './src/api';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env':JSON.stringify({BASE_URL:'/blog/'})}});
 const app=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 assert.equal(app.sitePath('/admin/pricing'),'/blog/admin/pricing');
 assert.deepEqual(app.parseAdminRoute('/blog/admin/pricing'),{view:'pricing'});
 assert.deepEqual(app.parseAdminRoute('/blogger/admin/pricing'),{view:'not-found'});
 assert.equal(app.adminUrl({view:'editor',postId:'new'}),'/blog/admin/posts/new');
 const image='/api/assets/00000000-0000-4000-8000-000000000001.png';
 assert.equal(app.safeMediaUrl(image),'/blog'+image);
 assert.equal(app.safeMediaUrl('/api/assets/../private'),undefined);
 assert.equal(app.mediaPath('https://images.test/a.png'),'https://images.test/a.png');
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async(input)=>{assert.equal(input,'/blog/api/session');return new Response('{"authenticated":true}',{headers:{'Content-Type':'application/json'}});};
  assert.deepEqual(await app.api('/session'),{authenticated:true});
 } finally { globalThis.fetch=original; }
});
