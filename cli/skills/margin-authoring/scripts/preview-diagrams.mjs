#!/usr/bin/env node
// Render with the selected checkout's actual Markdown, Mermaid, and layout code.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const usage = `Usage: node preview-diagrams.mjs --repo CHECKOUT --file ARTICLE.md --out NEW_DIRECTORY
       [--playwright PACKAGE_DIRECTORY] [--browser CHROMIUM_EXECUTABLE] [--title TITLE]

Requires Node.js, a Margin source checkout with its npm dependencies, Playwright,
and a Chromium browser. Uses installed dependencies; never downloads or publishes.
--playwright selects an existing playwright or playwright-core package directory.
Otherwise Playwright is resolved from the checkout. --browser selects an installed
Chromium executable; otherwise Playwright uses its managed Chromium installation.

Writes default-zoom 1100px/390px diagram crops, full-page screenshots, a local HTML
preview, the input snapshot, and report.json. The output directory must not exist.
HTTP(S) requests are blocked. A fresh browser profile is used, without credentials.
Exit 0 means capture completed, not that the diagrams are readable or correct.
Exit 2 means a rendering error or no diagram blocks; exit 1 means setup failed.
`;
const hash = value => createHash('sha256').update(value).digest('hex');
const escapeHTML = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));

function options(args) {
  const result = {};
  const allowed = new Set(['repo', 'file', 'out', 'playwright', 'browser', 'title']);
  for (let i = 0; i < args.length; i++) {
    const name = args[i].slice(2);
    if (!args[i].startsWith('--') || !allowed.has(name) || name in result || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error(`Invalid or missing option: ${args[i]}. Use --help.`);
    }
    result[name] = args[++i];
  }
  for (const name of ['repo', 'file', 'out']) {
    if (!result[name]) throw new Error(`--${name} is required. Use --help.`);
    result[name] = path.resolve(result[name]);
  }
  return result;
}

async function main() {
  if (process.argv.slice(2).includes('--help')) { console.log(usage); return; }
  const opt = options(process.argv.slice(2));
  const fromRepo = createRequire(path.join(opt.repo, 'package.json'));
  let esbuild, chromium;
  try { esbuild = fromRepo('esbuild'); }
  catch { throw new Error('Missing checkout dependencies. Install the Margin checkout dependencies using its documented setup, then retry.'); }
  try {
    const packageName = opt.playwright ? path.resolve(opt.playwright) : 'playwright';
    ({ chromium } = fromRepo(packageName));
    if (!chromium) throw new Error('Not a Playwright package');
  } catch { throw new Error('Playwright unavailable. Supply --playwright with an installed playwright or playwright-core package directory. See --help.'); }
  const source = await fs.readFile(opt.file, 'utf8');
  const rendererHashes = {};
  for (const file of ['src/Markdown.tsx', 'src/blocks/Diagram.tsx', 'src/blocks/diagram-theme.ts', 'src/blocks/blocks.css']) {
    rendererHashes[file] = hash(await fs.readFile(path.join(opt.repo, file)));
  }
  await fs.mkdir(path.dirname(opt.out), { recursive: true });
  await fs.mkdir(opt.out); // Refuse reuse so earlier evidence cannot be silently overwritten.
  await fs.writeFile(path.join(opt.out, 'input.md'), source);
  await esbuild.build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import '@fontsource/inter/400.css'; import '@fontsource/inter/600.css';
        import Markdown from './src/Markdown';
        createRoot(document.getElementById('article')).render(React.createElement(Markdown,{content:window.__ARTICLE__}));`,
      resolveDir: opt.repo, loader: 'tsx',
    },
    bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', minify: true,
    loader: { '.woff': 'dataurl', '.woff2': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.BASE_URL': '"/"' },
    outfile: path.join(opt.out, 'article.js'), logLevel: 'warning',
  });
  const title = escapeHTML(opt.title || path.basename(opt.file));
  await fs.writeFile(path.join(opt.out, 'input.js'), `window.__ARTICLE__=${JSON.stringify(source).replace(/</g, '\\u003c')};\n`);
  await fs.writeFile(path.join(opt.out, 'index.html'), `<!doctype html><html lang="en"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title><link rel="stylesheet" href="article.css">
    <style>body{margin:0;background:#faf9f6;color:#242424;font:17px/1.65 Inter,sans-serif}
    main{max-width:760px;margin:48px auto;padding:0 24px}h1{font-size:2.3rem;line-height:1.15}pre{overflow-x:auto}</style>
    </head><body><main><h1>${title}</h1><div id="article"></div></main>
    <script src="input.js"></script><script src="article.js"></script></body></html>`);
  const report = {
    input: opt.file, inputSHA256: hash(source), repo: opt.repo, rendererHashes,
    node: process.version, browser: '',
    scope: 'Actual Margin Markdown/Diagram components in a neutral article shell; default zoom, isolated browser, external requests blocked. Not a full editor, screen-reader, print, or RSS test.',
    views: [],
  };
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(opt.browser ? { executablePath: path.resolve(opt.browser) } : {}) });
    report.browser = browser.version();
    for (const width of [1100, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
      const page = await context.newPage();
      const view = { width, errors: [], blockedRequests: [], diagrams: [] };
      page.on('pageerror', error => view.errors.push(error.message));
      await context.route(/^https?:/, route => { view.blockedRequests.push(route.request().url()); return route.abort(); });
      await page.goto(pathToFileURL(path.join(opt.out, 'index.html')).href);
      await page.waitForSelector('.markdown-body');
      const blocks = page.locator('.rich-block').filter({ has: page.getByText('SYSTEM DIAGRAM', { exact: true }) });
      const count = await blocks.count();
      if (!count) view.errors.push('No Margin diagram blocks found.');
      for (let i = 0; i < count; i++) {
        const block = blocks.nth(i);
        await block.scrollIntoViewIfNeeded();
        try { await block.locator('.block-diagram svg, .block-error').first().waitFor({ state: 'attached', timeout: 15000 }); }
        catch { view.errors.push(`Diagram ${i + 1} did not finish rendering within 15 seconds.`); }
        await page.evaluate(() => document.fonts.ready);
        await block.evaluate(el => {
          el.scrollIntoView({ block: 'start' });
          const scroller = el.querySelector('.block-diagram-scroll');
          if (scroller) { scroller.scrollTop = 0; scroller.scrollLeft = 0; }
        });
        await page.waitForTimeout(150);
        const diagram = await block.evaluate(el => {
          const svg = el.querySelector('.block-diagram svg');
          const scroller = el.querySelector('.block-diagram-scroll');
          const errors = [...el.querySelectorAll('.block-error')].map(node => node.textContent);
          if (!svg || !scroller) return { errors, rendered: false };
          const labels = [...svg.querySelectorAll('text')].filter(node => node.textContent.trim()).map(node => {
            const matrix = node.getScreenCTM();
            const screenFontPx = parseFloat(getComputedStyle(node).fontSize) * Math.hypot(matrix.a, matrix.b);
            return { text: node.textContent.trim(), screenFontPx: Number(screenFontPx.toFixed(2)) };
          });
          const rect = svg.getBoundingClientRect();
          const sizes = labels.map(label => label.screenFontPx).sort((a, b) => a - b);
          return {
            rendered: true, errors, title: svg.querySelector('title')?.textContent || '',
            description: svg.querySelector('desc')?.textContent || '', labels,
            minScreenFontPx: sizes[0] ?? null, medianScreenFontPx: sizes[Math.floor(sizes.length / 2)] ?? null,
            svgWidth: rect.width, svgHeight: rect.height,
            viewportWidth: scroller.clientWidth, viewportHeight: scroller.clientHeight,
            scrollWidth: scroller.scrollWidth, scrollHeight: scroller.scrollHeight,
            verticalScroll: scroller.scrollHeight > scroller.clientHeight + 1,
            horizontalScroll: scroller.scrollWidth > scroller.clientWidth + 1,
          };
        });
        diagram.index = i + 1;
        diagram.screenshot = `diagram-${i + 1}-${width}.png`;
        diagram.diagnostics = [];
        if (diagram.minScreenFontPx !== null && diagram.minScreenFontPx < 10) diagram.diagnostics.push('Some labels are below 10 CSS pixels at default zoom; inspect readability.');
        if (diagram.verticalScroll || diagram.horizontalScroll) diagram.diagnostics.push('The initial diagram viewport requires internal scrolling; inspect whether essential steps or states are hidden.');
        if (!diagram.title || !diagram.description) diagram.diagnostics.push('Accessible title or description is absent; inspect the prose fallback.');
        if (diagram.rendered && diagram.svgHeight < diagram.viewportHeight / 2) diagram.diagnostics.push('The frame is much taller than its SVG; inspect wasted space.');
        await block.screenshot({ path: path.join(opt.out, diagram.screenshot) });
        view.diagrams.push(diagram);
      }
      view.horizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      await page.screenshot({ path: path.join(opt.out, `page-${width}.png`), fullPage: true });
      report.views.push(view);
      await context.close();
    }
  } catch (error) {
    throw new Error(`Preview failed: ${error.message}\nIf the browser is missing, supply --browser. If the sandbox blocks browser launch, request the narrowly scoped execution permission through your agent environment; do not bypass a rejection. Partial output: ${opt.out}`);
  } finally { if (browser) await browser.close(); }
  await fs.writeFile(path.join(opt.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Preview saved to ${opt.out}. Open every diagram crop at native size and inspect report.json; capture success is not a quality verdict.`);
  if (report.views.some(view => view.errors.length || view.diagrams.some(diagram => !diagram.rendered || diagram.errors.length))) process.exitCode = 2;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
