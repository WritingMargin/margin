# Margin blog customisation

Read `margin://design/schema` for the complete field names, allowed values, limits and defaults. It is generated from the design editor's schema. Use only supported configuration fields: arbitrary JavaScript, JSX, React components, CSS and HTML cannot be uploaded as templates. JSON selects the React components already shipped with Margin.

## Read, check and save

These tools require an owner API token. Start with `get_blog_design` to read `design` and `revision`. Use `validate_blog_design` with `input.changes` to check a partial edit against the current design without saving it. The response includes the candidate design and the revision of the saved design it was based on. Validation is not a visual preview. Use the existing Customise preview to inspect layout with published content.

To save, use `update_blog_design` with `input.revision` and the same `input.changes`. Saving immediately affects the live blog. A concurrent editor or API update returns 409: reread and reconcile before retrying. Never substitute a new revision onto an outdated full design.

Changes use JSON merge patch semantics: omitted fields stay unchanged; nested objects merge; arrays replace entirely; `null` removes an optional override. Required fields cannot be removed. The full merged result is checked by Margin's existing backend validation, including cross-field rules not expressible in JSON Schema. To apply a template, patch only its intended sections; keep the other sections intact.

## Design format

The API uses storage JSON: `name`, `description`, `logo`, `publicationType`, `background`, `text`, `accent`, `imageBorder`, `videoBorder`, `footerTitle`, `showFooterTitle`, `showFooterLogo`, `footerDescription`, `footerLinks`, `footerLayout`, `footerBackground`, `footerText`, `footerFont`, and the nested `homepage`, `article`, optional `guide`, and `comments` objects. This differs from the grouped JSON export in the Customize editor (`publication`, `style`, `footer`, etc.). Do not send grouped editor exports to these tools.

Homepage and article templates are separate. Article and guide designs are independent too. Patch only the requested object. A title such as `homepage.title` means the field `title` inside the `homepage` JSON object, not a literal dotted key.

For example, a homepage layout change that preserves article typography:

```json
{
  "input": {
    "changes": {
      "homepage": {
        "layout": "grid",
        "gridColumns": "three",
        "cardStyle": "flat",
        "sectionSpacing": "compact",
        "showSearch": true,
        "searchPosition": "inline"
      }
    }
  }
}
```

Pass this to `validate_blog_design`. Add `input.revision` from its response before passing it to `update_blog_design`.

`homepage` supports list/grid/magazine layouts, hero placement, pagination, images, excerpts, tags, filters, search and section spacing. `article` and `guide` support opening layout, fonts, reading width, body size, line spacing, heading and quote styles, cover/excerpt visibility and table-of-contents styling. Publication fields control branding and colours; footer fields control its title, optional logo, description, links, layout, colours and typeface. `footerLinks` is an array of up to eight `{ "label": "About", "url": "/post/about" }` objects; paths must begin with `/`, or use HTTP(S) URLs. `comments` controls the comments section presentation. Use the schema for exact fields and enums.

## Homepage components and dynamic variables

`homepage.sections` is an optional ordered array of one to three components. IDs must be unique and match `^[a-z][a-z0-9-]{0,63}$`. Each component type can appear only once, and one `post-feed` is required. Supported components are `hero`, `featured-posts`, and `post-feed`. Hero variants are `split`, `centered`, and `image-background`.

An example replacement for the sections array:

```json
[
  {
    "id": "welcome",
    "component": "hero",
    "variant": "image-background",
    "props": {
      "source": "latest",
      "title": { "bind": "content.title", "fallback": "From the journal" },
      "description": { "bind": "content.description", "fallback": "Stories and ideas." },
      "image": { "bind": "content.cover" },
      "buttonLabel": "Read the story",
      "buttonHref": { "bind": "content.url", "fallback": "#posts" }
    }
  },
  { "id": "stories", "component": "post-feed" }
]
```

Pass this as `input.changes.homepage.sections`. Since arrays replace, include every component you want to keep. Set `homepage.sections` to `null` to return to the built-in layout controlled by ordinary homepage fields.

Hero fields accept literal strings or `{ "bind": "VARIABLE", "fallback": "optional text" }`. Supported variables:

- Text: `blog.title`, `blog.description`, `homepage.title`, `homepage.description`, `content.title`, `content.description`.
- Images: `blog.logo`, `homepage.image`, `content.cover`.
- Links: `blog.url`, `content.url`.

Use each variable only in its matching field type. `props.source` selects `latest` or `featured` from published content; featured falls back to the latest published post. Draft content is never selected. Missing values use the fallback or an empty string. These are explicit bindings, not `{{...}}` interpolation or executable expressions. Images accept HTTP(S) or supported uploaded-image paths; links accept HTTP(S), local site paths, and anchors. Credentials, unsafe schemes and backslashes are rejected. Logo/artwork paths have separate rules in the schema and backend validator.

## Feed heading and filters

The feed heading and filter bar have independent settings. They apply to both the
built-in homepage and the `post-feed` component. In storage/API JSON use
`homepage.feedHeader` and `homepage.feedFilters`. In the designer's grouped JSON
export these are `homepage.feed.header` and `homepage.feed.filters`.

For example, pass this partial change to `validate_blog_design`, then use its
revision to save with `update_blog_design`:

```json
{
  "input": {
    "changes": {
      "homepage": {
        "feedHeader": {
          "title": "Latest writing",
          "showArrow": false,
          "border": "bottom",
          "paddingBlock": 20,
          "gap": 16
        },
        "feedFilters": {
          "layout": "inline",
          "mobileLayout": "stacked",
          "border": "bottom",
          "paddingBlock": 16,
          "gap": 24,
          "topics": {
            "allLabel": "All posts",
            "labels": { "unified-apps": "Unified apps" }
          },
          "search": {
            "placeholder": "Search the blog…",
            "position": "end",
            "maxWidth": 280
          }
        }
      }
    }
  }
}
```

Existing visibility flags remain authoritative: `showFeedHeading`, `showPostCount`,
`showTopicFilters`, and `showSearch`. The count reflects the currently filtered
feed, rather than the number of cards on the current page. Topic label keys match
the exact stored tag; display labels never change filter values or URLs. The
available topics still come from published posts.

Borders accept `none`, `top`, `bottom`, or `top-and-bottom`. Vertical padding is
0–80px, gap is 0–64px, and search maximum width is 160–800px, constrained by the
available space. Desktop layout accepts `inline` or `stacked`; mobile layout
accepts `wrap` or `stacked` below 680px of publication width. Existing
`searchPosition: above` or `below` takes precedence over inline start/end order.
Omitted options retain the existing appearance and publication-specific wording.
Set optional API overrides to `null` to remove them; do not send grouped editor
JSON to the API.

## Table of contents

Patch `article.tableOfContents` or `guide.tableOfContents` to style the panel: title, plain/outlined/filled style, numbering, heading depth, sticky positioning, width, corner radius and colours. For example, `{"article":{"tableOfContents":{"style":"outlined","maxDepth":3,"sticky":true}}}`.

Visibility and placement belong to each post, separately from template styling. Use `update_post` with its current post revision and `input.tableOfContents` set to `off`, `top`, `left` or `right`.

## Central templates

These tools do not fetch or refresh Margin Central's catalog. Central checks remain tied to visits to the Templates page. Apply an available template by editing its validated JSON configuration with the tools above; do not invent a central-template fetch or refresh operation.
