# Voice blog sample

A local preview using Margin’s real article renderer, with a live Spotify episode and a public direct-MP3 sample from MDN. The article is example copy, not an episode transcript. Nothing is published to a blog.

From the repository root:

```sh
node examples/voice-blog/build-preview.mjs
python3 -m http.server 53249 --bind 127.0.0.1 --directory artifacts/voice-blog-sample
```

Open http://127.0.0.1:53249. Copy `article.md` into Margin to use the sample in a draft. Spotify and the MP3 sample require network access.

For your own recording, use **Insert media → From a link** with a publicly accessible audio file URL, or **Uploads → Audio** to upload a file. Direct audio tags use `[Audio src="https://your-site.com/episode.mp3" title="Listen to the episode"]`. To replace the cover, use **Article details → Cover media → Audio, Spotify or SoundCloud**.

## Writer’s pad demo

With the server and web build available, run `node examples/voice-blog/writer-demo.mjs`. This starts the real Margin writer at http://127.0.0.1:53250 with separate SQLite and encrypted object storage under `artifacts/voice-blog-writer-demo/`. It seeds an unpublished sample draft showing both Spotify display modes. The disposable local login is `demo@example.test` / `margin-local-demo-only`. The launcher prints the draft’s editor URL. It does not touch an existing publication. Restarting reseeds the demo draft from `article.md`.

In the writer, choose **Media → Insert media → From a link** for a Spotify or direct audio URL. Select **Compact player** or **Artwork preview** before inserting. For a file, choose **Uploads → Audio → Upload audio**; select the recording, preview it, and choose **Insert into post**. The writer’s Preview view renders the saved audio tag.
