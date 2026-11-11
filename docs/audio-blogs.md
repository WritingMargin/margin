# Voice blogs, Spotify, SoundCloud, and link previews

Publish a recording with an article, transcript, or show notes. Audio can replace the article cover or sit between paragraphs. Existing articles and image covers continue to work.

## Cover audio

Open **Article details → Cover media → Audio, Spotify or SoundCloud**. Paste a direct audio URL, Spotify/SoundCloud link, or published Descript/Riverside/VEED player and choose **Use as cover**. Uploading a recording to Margin is optional. Save the post to apply it. The cover player follows the article design’s cover visibility and header position. Homepage and related-content cards show **Listen & read** instead of an image.

Audio replaces the cover image. Set a separate image in **SEO & sharing** if needed; otherwise the publication’s default sharing image is used.

## Audio within the article

Open **Insert media → From a link → Audio or podcast**. Recognized audio links automatically select audio. You can also choose **Uploads → Audio** to store a file in Margin. Preview the player, then insert it at the cursor. Add paragraphs, a transcript, and other blocks before and after it. The writer also offers Audio, Spotify, and SoundCloud completions. Choose **Compact player** or **Artwork preview** before inserting.

```text
An introduction to the conversation.

[Audio src="https://example.com/episode.mp3" title="Listen to the conversation" caption="Transcript follows below."]

## Transcript

Your article continues here.

[Spotify src="https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5" title="Listen on Spotify"]
```

`Audio`, `Spotify`, and `SoundCloud` tags use the same validated player. Attributes: `src`, `title`, `caption`, `width` (`full`, `wide`, `small`), `align` (`left`, `center`, `right`), and `mode` (`player`, `preview`). Blocks also work inside columns, widgets, and tabs.

## Sources and playback

- Native uploads: MP3, M4A, WAV, Ogg, and FLAC, up to 50 MiB per binary upload. Files are stored unchanged; browser codec support still applies. M4A uploads require an M4A/M4B container signature.
- Remote files: HTTP(S) MP3, M4A, AAC, WAV, Ogg/OGA, and FLAC URLs, including signed query parameters.
- SoundCloud: full track, playlist (`/artist/sets/playlist`), API track/playlist, and widget URLs. Private share tokens are preserved. Open shortened share links first to obtain the full URL.
- Spotify: episode, show, track, album, playlist, and artist links from `open.spotify.com`, including embed and localized links. Paste the URL, not iframe HTML. Spotify short links must first be opened to obtain the full `open.spotify.com` link.

Players do not automatically start playback. Native audio uses a publication-styled player with a progress scrubber, ten-second skip controls, mute, and playback speeds from 0.75× to 2×. It requests metadata before playback; audio starts only when the reader presses play. Without JavaScript, the server-rendered page retains standard browser controls. Spotify and SoundCloud frames load lazily, with an ordinary source link underneath. Artwork preview uses the providers’ expanded players; SoundCloud enables its visual player and artwork. Compact mode uses the smaller player. The integration uses [Spotify’s supported embed player](https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed); no Spotify API key or account connection is needed to author an embed. Playback availability and any sign-in requirements are controlled by Spotify. SoundCloud uses its [supported widget](https://developers.soundcloud.com/docs/api/html5-widget). This feature embeds existing provider content; it does not publish recordings to Spotify or SoundCloud.

Uploaded recordings remain private until referenced by a published article’s cover or content. Delivery supports HEAD and byte-range requests for seeking. Removing all public references or unpublishing makes the recording private again. RSS and print views retain listening links alongside the text.

## API and MCP

`POST /api/media/audio` accepts raw audio bytes (50 MiB maximum) with an appropriate `Content-Type` and optional `title` query parameter. JSON uploads accept `contentType`, standard base64 `data` (10 MiB decoded maximum), and optional `title`. `GET /api/media/audio` lists uploads. Native MCP exposes `upload_audio` and `list_audio`.

Writers, publishers, and owners can upload; authenticated readers can list media. Uploading does not save or publish an article. Store the returned canonical `/api/public/audio/UUID` unchanged as `cover` or in `[Audio src="URL"]`, then save the post with its current revision. The normal draft, revision, and publishing controls apply. Mount prefixes are added only when fetching media.

## Preview preferences

In **Media → Defaults**, set **Audio display** to **Compact player** or **Artwork preview**, and **Link display** to **Plain link** or **Preview card**. These preferences apply to new inserts. Each inline block keeps its saved `mode`; changing defaults does not rewrite published content. Native audio files use the publication-styled player in either mode.

For a cover, use **Article details → Audio display**. Its `coverMode` (`player` or `preview`, default `player`) is saved with the post and preserved by drafts, revisions, and recovery.

```text
[SoundCloud src="https://soundcloud.com/forss/flickermood" mode="preview" caption="Read the show notes below."]

[Spotify src="https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5" mode="preview"]
```

## Website link cards

In **Insert media → From a link**, paste a webpage URL and choose **Link preview card**, then **Preview media**. Margin fetches the page’s Open Graph metadata (with title, description, and Twitter metadata fallbacks). Review or edit its title, description, and image URL, choose **Preview card** or **Plain link**, and insert it. Ordinary Markdown links remain ordinary links.

```text
[Link url="https://example.com/story" mode="preview" title="A story worth reading" description="A short introduction to the linked article." image="https://example.com/cover.jpg"]
```

Card details are saved in the article; publishing and viewing the article do not trigger metadata requests. Cards retain useful text when an image fails. RSS and print include the destination and saved preview. Sites that block metadata fetching can still be linked, or given manually authored card details. To refresh a snapshot, preview the URL again and replace the block.

`POST /api/media/preview` accepts `{ "url": "https://example.com/story" }` and returns `url`, `title`, `description`, and `image`. MCP exposes `preview_link`. Fetching is authenticated, bounded to 6 seconds, 1 MiB, and four requests; each destination must resolve to public addresses. No author-provided HTML or remote scripts are executed.


## Hosted recordings and playback analytics

See [Hosted audio and video](hosted-media.md) for Descript, Riverside, VEED, and cleanup-service publishing workflows. **From a link** is the default in the insertion dialog. It also accepts copied iframe code for those three providers, extracts only the validated URL, and discards all HTML. Choose **Audio or podcast** for an audio recording or **Video or embed** for a video, preview it, then insert it. Audio previews let you set a recording title. Existing compact/artwork preferences apply to Spotify and SoundCloud; other hosts control their own player layout.

**Analytics → Media** shows article/player visits, visits with playback, actual playback time, average unique portion played, completions, and measurement coverage. Open details for pagination and article/date filters. A visit with playback counts once per source per page visit, so the same recording used as both cover and inline content is one row. Replayed portions add listening time without inflating unique progress. Seeking ahead does not count as listening; completion requires at least 90% of the timeline played and reaching the end. Average progress excludes visits that never started playback.

Native audio/video and supported YouTube, Vimeo, Spotify, and SoundCloud player events feed these metrics. External-player availability and browser restrictions can limit measurement. Descript, Riverside, VEED, and unsupported iframe players report player visits with **Unavailable** playback values, rather than guessed plays or misleading zeros. These visits mean the article rendered a player; they do not prove that it was visible or played. Metrics cover playback on Margin, not the provider's total audience.

Spotify and SoundCloud collections can report plays and playback time, but average progress and completions are unavailable: separate tracks do not share one recording timeline. Those columns show dashes for collections, and collections have no stable replay timeline.

The existing analytics privacy rules apply: signed-in visits, Do Not Track, Global Privacy Control, and identified bots are excluded. Analytics stores an opaque source identifier and article-supplied title, not media URLs or signed access tokens. Cumulative updates are idempotent, and media rows expire with their page visits.

**Media → Player activity** separately lists timestamped play, pause, resume, seek, and end events from players on Margin, with the article, recording, and playback position. Events appear newest first in UTC; open details to paginate the history. Buffering does not count as a pause, seeking shows its destination, and reaching the end does not by itself mean the whole recording was heard. Available events depend on the provider’s callbacks. Historical totals are not converted into invented events.

Expand the replay summary below any measurable recording to see the most replayed 5% section and a timeline of replay time across the recording. **View all segment values** exposes exact durations in a table. Replay means a portion played again during the same page visit; audio and video use the same calculation, excluding buffering and seeking. **No replays recorded** is a measured zero; unavailable or historical measurements are labeled separately.

**Played before stop** in Player activity shows actual listening or viewing time since the last play or resume, attached to pause, end, and **Left page** events. It excludes pauses, buffering, and skipped time. Historical durations show a dash. Page exit reporting is best effort and may miss a browser shutdown or failed delivery; hiding the tab alone does not end a playback session. Provider callback availability still applies.
