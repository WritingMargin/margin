import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import rehypeSanitize from 'rehype-sanitize';
import fontMarkup from '../shared/font-markup.ts';
import { markdownSchema } from '../src/markdown-schema.ts';

const render = (content: string) => renderToStaticMarkup(createElement(ReactMarkdown, {
  remarkPlugins: [remarkGfm, remarkDirective, fontMarkup],
  rehypePlugins: [[rehypeSanitize, markdownSchema]], skipHtml: true, children: content,
}));

test('font spans preserve Markdown, nested overrides, aliases, and adjacent plain text', () => {
  const html = render('Before [Font="cAvEaT"]One **bold** [Font="plex-mono"]code voice[/Font] end[/Font] after');
  assert.match(html, /Before <span data-font="caveat">One <strong>bold<\/strong> <span data-font="plex-mono">code voice<\/span> end<\/span> after/);
  assert.match(render('[Font="Source Serif 4"]Bookish[/Font]'), /data-font="source-serif"/);
});

test('font sections wrap headings, paragraphs, lists and nested sections without invalid paragraph wrappers', () => {
  const html = render('[Font="Caveat"]\n\n## Heading\n\nFirst paragraph.\n\n[Font="Kalam"]\n\n- One\n- Two\n\n[/Font]\n\nLast paragraph.\n\n[/Font]\n\nOutside.');
  assert.match(html, /^<div data-font="caveat"><h2>Heading<\/h2>/);
  assert.match(html, /<div data-font="kalam"><ul>/);
  assert.match(html, /Last paragraph\.<\/p><\/div>\n<p>Outside\.<\/p>$/);
  assert.doesNotMatch(html, /<p><div/);
});

test('a section closes before adjacent emphasis without leaking tags or its font', () => {
  const html = render('[Font="Source Serif 4"]\n\n## A different voice\n\nA paragraph.\n\n[/Font]_**Hello**_');
  assert.match(html, /^<div data-font="source-serif"><h2>A different voice<\/h2>/);
  assert.match(html, /<\/div>\n<p><em><strong>Hello<\/strong><\/em><\/p>$/);
  assert.doesNotMatch(html, /\[\/?Font|<p><div/);
  const adjacent = render('Before [Font="Caveat"]First\n\nSecond[/Font] after');
  assert.match(adjacent, /^<p>Before <\/p>\n<div data-font="caveat"><p>First<\/p>\s*<p>Second<\/p><\/div>\n<p> after<\/p>$/);
  const nested = render('[Font="Lora"]\n\nOuter\n\n[Font="Kalam"]\n\nInner\n\n[/Font]back to Lora\n\n[/Font]_**Hello**_');
  assert.match(nested, /<div data-font="kalam"><p>Inner<\/p><\/div>\s*<p>back to Lora<\/p><\/div>\n<p><em><strong>Hello<\/strong><\/em><\/p>$/);
  assert.equal(render('Before [Font="Caveat"]unclosed'), '<p>Before [Font=&quot;Caveat&quot;]unclosed</p>');
});

test('code, escaped and unmatched tags remain literal; unknown names cannot inject CSS', () => {
  const examples = ['`[Font="Caveat"]literal[/Font]`', '```text\n[Font="Caveat"]literal[/Font]\n```', '\\[Font="Caveat"]literal[/Font]', '[Font="Caveat"]unclosed'];
  for (const content of examples) { const html = render(content); assert.doesNotMatch(html, /data-font=/); assert.match(html, /Font=/); }
  assert.match(render('[Font="Bla"]Readable[/Font]'), /<span>Readable<\/span>/);
  const invalidFont = render('[Font="url(https://evil.example)"]Safe **text**[/Font]');
  // GFM may autolink literal URL text; it must never become a font or CSS attribute.
  assert.doesNotMatch(invalidFont, /style=|data-font=|onerror=|javascript:/);
  assert.match(invalidFont, /\[Font=&quot;url\(/);
  assert.match(invalidFont, /<strong>text<\/strong>\[\/Font\]/);
  assert.doesNotMatch(render('[Font="Caveat; color:red"]Safe[/Font]'), /style=|data-font=/);
  assert.match(render('Before [Font="Caveat"]ok[/Font] after `code`'), /<\/span> after <code>code<\/code>/);
});

test('highlight tags combine with font tags and retain inline Markdown', () => {
  assert.match(render('[Font="Kalam"]A [Highlight]**good** idea[/Highlight][/Font]'), /<span data-font="kalam">A <mark><strong>good<\/strong> idea<\/mark><\/span>/);
  assert.match(render('`[Highlight]literal[/Highlight]`'), /<code>\[Highlight\]literal\[\/Highlight\]<\/code>/);
});
