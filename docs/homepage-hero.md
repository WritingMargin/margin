# Homepage hero images and videos

In **Design → Homepage → Customize → Content**, choose **Video** as the hero media source, then select a video from the **Hero video** dropdown. It lists videos already uploaded to Margin. You can also upload an MP4/WebM file up to 50 MiB here; it is selected automatically and added to the dropdown. Save the design to publish your choice. Existing image, logo, and emoji options remain available.

Both the original welcome section and composed Hero components support video. Composed heroes retain their title, introduction, and button bindings independently of the media. Split and centered layouts keep playback controls visible. Choosing video with the Image background layout uses a split layout instead, as explained in the designer.

Open the Hero video dropdown and type in **Search uploaded videos** to filter by name. Use the arrow keys and Enter to select a result, or Escape to close without changing your selection.

Videos use the same player as article videos: native files and uploads, HLS streams, YouTube, Vimeo, Descript, Riverside, VEED, Mux, and Cloudinary. Visitors start playback themselves; the hero does not autoplay. Third-party playback still depends on the provider allowing embedding and access. HLS uses the browser's native support or the existing JavaScript HLS player.

Uploads are private until the saved, visible homepage hero references them (or they appear in published article content). Uploading, changing an unsaved preview, or keeping a video URL in an inactive image setting does not publish the upload. Hiding or removing its last published reference makes it private again.

## Settings contract

The original homepage uses `homepage.artworkType: "video"` and optional `homepage.artworkVideo: "URL"`, alongside the existing `showHero` and `showArtwork` switches. The grouped design editor exposes this as `homepage.hero.artwork.type` and `.video`.

A composed hero accepts optional `props.mediaType: "image" | "video"` and `props.video: "URL"`. Missing `mediaType` preserves existing image behavior. When video mode is selected and `video` is omitted, it uses `homepage.artworkVideo`; an explicitly empty string clears the video. Image bindings are preserved when switching media types.

Use canonical `/api/public/videos/<UUID>` paths for Margin uploads; the application applies any mount prefix when loading media. Arbitrary iframe HTML and unsupported player URLs are rejected.

## Playback analytics

Hero playback appears under **Analytics → Media** and **Player activity**, labeled **Homepage**. Choose the Homepage page filter to separate it from article playback, even when the same recording appears in both places. Uploaded/native videos, HLS, YouTube, and Vimeo use the existing playback metrics, including played time, progress, completion, replay segments, and supported player actions. Hosts without playback callbacks show measurement as unavailable.

Only videos referenced by the saved, visible hero are accepted. Signed-in owner visits, authoring previews, bots, Do Not Track, and Global Privacy Control remain excluded. Raw media URLs and access tokens are not stored in analytics. Changes to the hero affect future collection; past measurements stay available for the normal retention period.
