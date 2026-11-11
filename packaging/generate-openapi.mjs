import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import converter from 'swagger2openapi';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, 'backend/internal/blog/openapi.json');
const stage = await mkdtemp(path.join(tmpdir(), 'margin-openapi-'));
function run(args, input) {
  const result = spawnSync('go', ['-C', path.join(root, 'backend'), ...args], { input, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}
try {
  run(['tool', 'swag', 'init', '-d', 'internal/blog', '-g', 'openapi_models.go', '--outputTypes', 'json', '-o', stage]);
  const swagger = JSON.parse(await readFile(path.join(stage, 'swagger.json'), 'utf8'));
  const { openapi } = await converter.convertObj(swagger, {});
  openapi.servers = [{ url: '/' }];
  openapi.externalDocs = { description: 'Margin content authoring guide for LLMs', url: '/authoring.md' };
  openapi.components.securitySchemes.BearerAuth = {
    type: 'http', scheme: 'bearer', description: 'Enter your Margin API key. Swagger UI adds the Bearer prefix.',
  };
  const operations = Object.entries(openapi.paths).flatMap(([url, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({ pattern: `${method.toUpperCase()} ${url}`, operation })));
  const contract = JSON.parse(run(['run', './cmd/openapi-contract'], JSON.stringify(operations.map(({ pattern }) => pattern))));
  for (const { pattern, operation } of operations) {
    const fields = contract.fields[pattern];
    if (fields) {
      operation.parameters ??= [];
      operation.parameters.push({ name: 'fields', in: 'query', required: false,
        description: 'Optional comma-separated top-level response fields. Omit to return all fields. Unknown or empty fields return 400.',
        style: 'form', explode: false,
        schema: { type: 'array', minItems: 1, items: { type: 'string', enum: fields.split(',') } },
      });
    }
    if (operation.security?.length) {
      const roles = contract.roles[pattern];
      operation['x-token-roles'] = roles;
      operation.description += `\n\nAllowed token roles: ${roles.join(', ')}.`;
      if (pattern === 'DELETE /api/tokens/{id}') {
        operation['x-self-revocation-roles'] = ['reader', 'writer', 'publisher', 'owner'];
      }
    }
  }
  for (const pattern of Object.keys(contract.fields)) {
    if (!operations.some(operation => operation.pattern === pattern)) throw new Error(`Undocumented fields route: ${pattern}`);
  }
  const schemas = openapi.components.schemas;
  for (const name of ['APICreatePost', 'APIUpdatePost']) {
    const properties = schemas[`blog.${name}`].properties;
    properties.slug.pattern = '^[a-z0-9]+(?:-[a-z0-9]+)*$';
    properties.tags.items = { type: 'string', minLength: 1, maxLength: 50 };
  }
  schemas['blog.APICreatePost'].properties.status.default = 'draft';
  schemas['blog.APICreatePost'].properties.contentType.default = 'article';
  schemas['blog.APISiteSEO'].properties.googleVerification.pattern = '^[A-Za-z0-9_-]*$';
  // Binary uploads are raw HTTP bodies, not form fields or base64 JSON strings.
  openapi.paths['/api/media/covers'].post.requestBody = {
    required: true,
    content: Object.fromEntries(['image/png', 'image/jpeg', 'image/webp', 'image/gif'].map(type =>
      [type, { schema: { type: 'string', format: 'binary' } }])),
  };
  openapi.paths['/api/media/models'].post.requestBody = {
    required: true, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
  };
  for (const type of ['video/mp4', 'video/webm']) {
    openapi.paths['/api/media/videos'].post.requestBody.content[type] = { schema: { type: 'string', format: 'binary' } };
  }
  for (const type of ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/flac']) {
    openapi.paths['/api/media/audio'].post.requestBody.content[type] = { schema: { type: 'string', format: 'binary' } };
  }
  for (const name of ['APIAuthorProfile', 'APIProfileLink', 'APILinkPreviewInput', 'APIUploadAudio', 'APICreateToken', 'APIUpdateToken', 'APISEO', 'APIRecommendations', 'APISiteSEO', 'APIUploadImage', 'APIUploadVideo']) {
    schemas[`blog.${name}`].additionalProperties = false;
  }
  openapi.paths['/api/posts'].post.requestBody.content['application/json'].example = {
    title: 'Release notes', slug: 'release-notes', content: '# Release notes\n\nInitial draft.', status: 'draft',
  };
  openapi.paths['/api/posts/{id}'].put.requestBody.content['application/json'].examples = {
    editDraft: { summary: 'Edit a draft', value: { revision: 'REPLACE_WITH_LATEST_REVISION', content: 'Updated draft.' } },
    updateSEO: { summary: 'Update post SEO without changing content', value: { revision: 'REPLACE_WITH_LATEST_REVISION', seo: { title: 'Search title', description: 'Search description', image: '' } } },
    insertImage: { summary: 'Insert an uploaded image and preserve the rest of the Markdown', value: { revision: 'REPLACE_WITH_LATEST_REVISION', content: 'Existing Markdown, preserved.\n\n![Descriptive alt text](/api/public/covers/REPLACE_WITH_UPLOAD_ID)' } },
    insertVideo: { summary: 'Insert a video stored in Margin', value: { revision: 'REPLACE_WITH_LATEST_REVISION', content: 'Existing Markdown, preserved.\n\n[Video src="/api/public/videos/REPLACE_WITH_UPLOAD_ID" title="A walkthrough"]' } },
    embedVideo: { summary: 'Insert an existing hosted video without uploading', value: { revision: 'REPLACE_WITH_LATEST_REVISION', content: 'Existing Markdown, preserved.\n\n[Video src="https://youtu.be/aqz-KE-bpKQ" title="A video"]' } },
    setCover: { summary: 'Set an uploaded image as the cover', value: { revision: 'REPLACE_WITH_LATEST_REVISION', cover: '/api/public/covers/REPLACE_WITH_UPLOAD_ID' } },
    publish: { summary: 'Publish (publisher or owner)', value: { revision: 'REPLACE_WITH_LATEST_REVISION', status: 'published' } },
    archive: { summary: 'Archive (publisher or owner)', value: { revision: 'REPLACE_WITH_LATEST_REVISION', status: 'archived' } },
  };
  // Validate the final OpenAPI document, including generated parameters and permissions.
  const candidate = path.join(stage, 'openapi.json');
  const output = JSON.stringify(openapi, null, 2) + '\n';
  await writeFile(candidate, output);
  const validation = spawnSync(process.execPath, [path.join(root, 'node_modules/swagger2openapi/oas-validate.js'), candidate], { encoding: 'utf8' });
  if (validation.status !== 0) throw new Error(validation.stderr || validation.stdout);
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== output) throw new Error('OpenAPI is out of date. Run npm run generate:openapi and commit openapi.json.');
    console.log(`OpenAPI is valid and up to date (${operations.length} operations).`);
  } else {
    await writeFile(target, output);
    console.log(`Generated OpenAPI (${operations.length} operations).`);
  }
} finally {
  await rm(stage, { recursive: true, force: true });
}
