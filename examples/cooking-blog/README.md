# Supper Club — sample cooking blog

A complete Margin sample with two recipe articles, a video lesson page, and an interactive Guide. It uses the existing editor, publication theme, media embeds, tabs, clickable illustration, and analytics pipeline; no custom application code or new content type is required.

After building Margin, run from the repository root:

```sh
node examples/cooking-blog/demo.mjs
```

Open <http://127.0.0.1:53242>. `MARGIN_DEMO_PORT` overrides the port.

The demo runs the real Margin binary with isolated local storage and a local template catalog. State is saved under the ignored `artifacts/cooking-blog-demo/` directory. Restarting reseeds only these four sample pages and their design. The disposable local login is `demo@example.test` / `margin-local-demo-only`.

- `tomato-pasta.md`: tomato-and-basil pasta, variations, and a technique video.
- `chickpea-bowl.md`: a no-cook chickpea salad with ingredient swaps.
- `cook-along.md`: serving-size tabs, four cooking steps, a clickable pan diagram, and troubleshooting tabs.
- `videos.md`: two credited YouTube lessons, selectable in tabs.

The launcher verifies draft privacy, revision-aware publication, saved content types, public HTML, Markdown exports, and print views. The recipes are illustrative sample content, not kitchen-tested recipes. Time estimates vary with equipment and preparation. Guide tabs do not save progress or run timers.

## Media credits

Videos remain hosted on YouTube and have direct watch links:

- [Gennaro Contaldo / The Happy Foodie — How to Cook Pasta Like an Italian](https://www.youtube.com/watch?v=o14A4Iimlkg)
- [Food Busker / Jamie Oliver — How To Chop An Onion](https://www.youtube.com/watch?v=w5uJcb71Cyk)

Photos are displayed from their original providers and credited on each page:

- [Jakub Kapusnak / Unsplash — pasta ingredients](https://unsplash.com/photos/yellow-pasta-and-cherry-tomatoes-tEVisOXz26Y)
- [Anna Pelzer / Unsplash — illustrative salad bowl](https://unsplash.com/photos/bowl-of-vegetable-salads-IGfIGP5ONV0)
- [Kampus Production / Pexels — kitchen preparation](https://www.pexels.com/photo/a-person-cutting-tomatoes-on-the-cutting-board-8629044/)

The pan illustration is an original schematic built with Margin's existing Illustration block. External images and video playback require internet access.
