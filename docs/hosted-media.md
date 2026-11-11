# Hosted audio and video

Creators can upload and edit at a supported provider, then publish its player in Margin. Margin stores the link in the article; the recording stays at the provider. Uploading the same file to Margin is optional.

Use a published viewing link or the URL inside the provider's embed code. Private editing, project, and review URLs are not playback links. Provider access permissions, embedding settings, subscription availability, and continued hosting still apply.

| Provider | Supported published URL | Margin presentation |
| --- | --- | --- |
| Descript | `https://share.descript.com/view/ID` or `/embed/ID` | Provider player for audio or video; supports an audio cover |
| Riverside | `https://api.riverside.fm/embeddable-components/embedded-assets/public/ID` | Provider player for exported video or podcast audio; supports an audio cover |
| VEED | `https://www.veed.io/view/UUID` or `/embed/UUID` | Provider player; supports audio published in the provider player |
| Spotify / SoundCloud | Existing episode, track, show, or playlist links | Compact or artwork preview player |
| YouTube / Vimeo | Existing watch/share/player links | Provider video player |
| Mux / Cloudinary | Existing hosted player or delivery URLs | Provider player, direct video, or HLS stream |
| Any media host | Direct MP3/M4A/AAC/WAV/Ogg/FLAC or MP4/WebM/M4V/HLS URL | Margin player using the remote file |

Descript: publish the composition, then copy the published viewing link. [Descript publishing](https://www.descript.com/publishing) and [embedding audio and video](https://www.descript.com/tools/embed-video).

Riverside: open the exported recording's **Share → Embed**, or choose **Embed** on a published podcast episode. Create/save the embed and copy the code. Its `src` URL is the supported player link; the ordinary studio/project URL is not. Riverside documents stable embeds, provider-managed thumbnails, and its own embed analytics. [Riverside embed instructions](https://support.riverside.com/hc/en-us/articles/35318358388381-Embed-a-video-or-podcast-episode).

VEED: finish the export, then **Share → Embed**. Choose access settings suitable for your audience. VEED currently documents embedding on Pro and higher plans. [VEED sharing instructions](https://support.veed.io/en/articles/11029688-how-to-share-your-videos).

```text
[Video src="https://share.descript.com/view/YOUR_PUBLISHED_ID" title="Our conversation"]

[Audio src="https://api.riverside.fm/embeddable-components/embedded-assets/public/YOUR_EMBED_ID" title="Listen to the episode"]
```

These are URL-shape examples; replace the identifiers with links copied from your own published recording. The same URL can be selected as audio or video according to the recording. Hosted player layout and artwork remain controlled by the provider; Margin's compact/artwork setting applies to Spotify and SoundCloud.

## Cleanup services that need a publishing destination

Auphonic is a post-production service rather than permanent media storage. Its production files expire; use its publishing/export destination and paste the resulting stable hosting link into Margin. Do not use a temporary production download as a permanent episode URL. [Auphonic data retention](https://us.auphonic.com/privacy).

Adobe Podcast Enhance Speech provides a processed download. Publish the finished file to your chosen media host, then paste that host's public media or player link into Margin. Adobe documents a limited retention period for enhanced files. [Adobe Enhance Speech workflow](https://podcast.adobe.com/en/guides/enhance-speech-for-video).

No account connection, processor credential, or automatic copy of provider media is required for these embeds.

## Measurement boundaries

An embed becoming visible is not a play. Descript, Riverside, and VEED embeds do not currently have a playback callback adapter in Margin, so Margin can count their article visits with a rendered player but must not report estimated plays, completion, or listening time. Use provider analytics for those playback details. Native remote files can be measured by the browser player without hosting those files in Margin. Other provider adapters expose only the events supported by their documented player APIs.

Only exact provider domains and known public-player paths are embedded. URL credentials and nonstandard ports are rejected, and unrelated query parameters—including autoplay flags—are discarded. Provider iframe paste is reduced to a validated URL; arbitrary iframe HTML is never rendered.
