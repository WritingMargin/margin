# Video in posts

To use video as the article hero, open **Post details → Cover media → Video cover**. Upload an MP4 or WebM, select a previous upload, or paste a supported video or player URL. The article opening shows a playable video under the post title, or before it when the design uses **cover first**. Homepage and related story cards show **Watch & read**. A video cover needs a separate image in **SEO & sharing** if you want a custom social preview; otherwise the publication default is used. Uploaded videos remain private until the post is published.

Open **Insert media → From a link** and paste a video URL. Recognized links automatically select **Video or embed**. Add a caption, choose a width and frame, preview, then insert.

The same video blocks work in columns, widgets, tabs, and the public article:

Video layout is configurable in Insert media or directly in the tag. `width` accepts `full`, `wide`, `small`, `two-thirds`, `half`, `third`, or a percentage from `25%` to `100%`. Use `align="left"` or `align="right"` with `wrap="true"` to let following paragraphs continue alongside a smaller video. `ratio` accepts `auto`, `16:9`, `4:3`, `1:1`, `9:16`, or `21:9`. Native video preserves the whole picture inside the chosen ratio; hosted players control their own picture fit. Wrapped video layouts expand to full width on narrow screens. The optional corner player is described below.

```text
[Video src="https://res.cloudinary.com/demo/video/upload/dog.mp4" width="full" ratio="16:9"]

[Video src="https://vimeo.com/76979871" width="40%" align="right" wrap="true" ratio="4:3"]
Your article continues beside the video, then below it.

[Clear]

[Columns]
[Column]
[Video src="https://youtu.be/aqz-KE-bpKQ" width="full"]
[/Column]
[Column]
[Video src="https://vimeo.com/76979871" width="full"]
[/Column]
[/Columns]
```

```text
[Video src="https://www.youtube.com/watch?v=aqz-KE-bpKQ" caption="A video walkthrough" width="full" frame="border"]

[Video src="https://vimeo.com/76979871"]

[Video src="https://player.mux.com/YOUR_PLAYBACK_ID"]

[Video src="https://stream.mux.com/YOUR_PLAYBACK_ID.m3u8"]

[Video src="https://player.cloudinary.com/embed/?cloud_name=demo&public_id=elephants"]

[Video src="https://res.cloudinary.com/demo/video/upload/dog.mp4"]
```

YouTube watch, share, Shorts, live, and embed links are normalized to a privacy-enhanced player; timestamps are preserved. Vimeo unlisted hashes are preserved. Mux player URLs use its hosted player; stream URLs use HLS.js in browsers with Media Source support and native HLS in browsers that require it. Cloudinary hosted players, image delivery URLs, video delivery URLs, and the existing media library are supported. Direct MP4, WebM, Ogg, M4V, and HLS files can come from other hosts.

Video blocks never autoplay. Hosted players load lazily; HLS.js loads near the viewport and playback starts on interaction. Only recognized player hosts are framed; pasted iframe HTML is not accepted. Feed readers receive a watch link for hosted or streaming video. Provider privacy settings, embedding permissions, and token expiry still apply; this integration does not generate access tokens or bypass restrictions.

Provider references: [YouTube player parameters](https://developers.google.com/youtube/player_parameters), [Vimeo embed options](https://developer.vimeo.com/player/sdk/embed), [Mux player integration](https://www.mux.com/docs/guides/player-integrate-in-your-webapp), and [Cloudinary hosted player](https://cloudinary.com/documentation/video_player_how_to_embed).


Hosted Descript, Riverside, and VEED players are also supported. See [Hosted audio and video](hosted-media.md) for publishing links and [playback analytics](audio-blogs.md#hosted-recordings-and-playback-analytics) for measurement coverage.

Video and audio use the same analytics pipeline. **Analytics → Media** reports playback visits, actual playback time, unique progress, and completions; **Player activity** shows timestamped actions, their playback positions, and actual viewing time before each pause, end, or page exit. Expand a recording’s replay summary for the most replayed 5% section and full replay timeline, with measured zero replays distinguished from unavailable history. Replay time counts only sections played again during the same page visit. Exit delivery is best effort; hiding a tab alone does not stop the playback session. Native and HLS video support the same actions as native audio. Hosted players depend on their available APIs; see the [audio and video coverage table](analytics.md#audio-and-video) for capabilities and current limits.

## Keep a video visible while reading

Select a video in the media picker and enable **Keep video visible while scrolling**, or add `sticky="true"` to its tag:

```text
[Video src="https://example.com/walkthrough.mp4" title="Follow along" sticky="true"]
```

For uploaded videos, direct files and HLS, the existing player becomes a small corner player after playback starts and the reader scrolls past it. Hosted embeds offer **Keep visible** so readers can opt in without depending on provider event support. Videos never start automatically. Scrolling back restores the inline player; **Back to video** jumps to its original position. **Dismiss floating video** (or Escape while focusing its controls) keeps it inline until the reader pins it again. Only one player floats at a time. Fullscreen temporarily suspends floating playback.

The player remains mounted, preserving playback and analytics. Without `sticky="true"`, videos keep their existing inline behavior. This option applies to article content, not homepage heroes or authoring previews.
