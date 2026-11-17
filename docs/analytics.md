# Analytics

Open **Analytics** in the workspace sidebar (`/admin/analytics`). Reports cover the homepage and published articles and guides, with 7-, 30-, 90-day or custom UTC date ranges and page and content-type filters. The **Analytics** tab shows summary metrics, readership over time, and top pages. **Traffic**, **Content**, **Reading**, **Media**, and **Conversations** are peer tabs using the same page-level tab style as Settings and Readers. The numbered inner-tab design is reserved for tabs nested within another tab. Breakdowns show the top 5 results and use the shared Margin accordion. **Open details** opens a sidebar for that breakdown, with its own searchable page filter and independent, server-side pagination for pages, countries, clicks, sections, passages, comments, tags, content types, and writing styles. Choose 10, 25 or 50 rows per page; daily numbers are paginated too. Daily details show days with views first, newest to oldest, in compact rows; enable **Include days without views** to see every date. The chart always keeps the complete date range, and periods with no views show an empty-state message instead of a table of zeroes. Closing the sidebar returns to the selected tab and preserves the main filters. The searchable Page selectors match article titles and slugs, support keyboard selection, and include All pages and Homepage. Changing sidebar filters resets pagination.

The page includes daily traffic, anonymous reading sessions, active time, scroll depth, countries, click destinations, section engagement, highlighted/copied passages, and comments with moderation status. Page rows drill into the article filter. Loading, empty and error states are explicit; Refresh fetches the latest report.

## Measurement

- A page view is one mounted public page. JavaScript is required; previews, newsletter action pages, known crawler user agents and authenticated owner requests are excluded. Reloads are new views.
- Sessions use a random, per-tab `sessionStorage` identifier, renewed after 30 minutes without a page load. They are approximate reading sessions, not unique people. If storage is unavailable, each page receives a new session identifier.
- Active time is sampled every second, only while the page is visible and focused, and pauses after 60 seconds without pointer, keyboard, touch or scroll activity. Long timer suspensions are capped. Measurements are sent every 15 seconds and on page exit/backgrounding with a beacon fallback.
- Scroll depth is the furthest visible point as a percentage of the article body (or homepage document). Article headings divide the content into an introduction and up to 99 more sections. Only the section taking up the most visible vertical space receives each time sample, so section time is not double-counted. Offscreen article content receives no time. Revisions are reported separately.
- A stable article text selection records a highlight. A copy action records a separate copy and, if needed, its highlight. Clearing and selecting again is another highlight. Only text inside the published article body is captured, capped at 500 characters, and the backend checks it against the current published content. Comment bodies, forms, private notes and clipboard contents are not captured. The copy event indicates a copy action, not confirmation of an operating-system clipboard write.
- Link and button/control clicks are counted outside private/form/comment areas. URL query strings and fragments are stripped. Destinations are plain text in the report. Cross-origin iframe interactions cannot be observed.
- Comment totals come directly from saved comments and passage questions, filtered by submission date, including pending submissions. Approval reflects current status; deleted comments disappear. This is independent of browser telemetry and can include comments submitted before analytics was added.

All engagement for a page view is attributed to its first receipt date in UTC, including subsequent activity after midnight. Anonymous sessions are counted within the selected range. Average active time includes page views with zero measured activity. Totals are computed across all matching visits, independently of pagination. Rankings have deterministic tie-breakers. The main tabs limit the displayed results; the details sidebar can page through every matching result.

## Content performance and Margin’s Classifier

The Content tab ranks content types (Article, Guide), current tags, AI content classifications, and writing styles by total active reading time. Each row includes article count, page views, average active time and scroll depth. Tag names are trimmed and case-normalized; duplicate tags on one article count once. Articles can have several tags, so totals across tags overlap. Homepage visits are excluded. Tags reflect the current article metadata; type/style labels are tied to the exact revision readers saw.

**Margin’s Classifier** shows classification coverage for the selected date/page filters. Expand it to classify the selected published article, or the next batch of up to ten unclassified published articles. Availability and per-article credits come from Margin; the button displays the maximum batch cost. Classification covers current published revisions across all dates. Existing labels are reused without a new charge; old unclassified revisions remain explicitly **Unclassified**. An article exceeding 40,000 characters is rejected rather than silently classified from a truncated sample. A failed batch preserves completed classifications and stops at the first error. The classify button only appears for a nonempty queue of eligible published articles. Empty filters and fully classified articles show a compact status instead of an expandable action panel. Refresh rechecks eligibility.

Central must be deployed with classification support, `JEV_API_KEY`, optional `JEV_MODEL`, and `AI_CLASSIFICATION_CREDITS` (default 1). An active AI subscription and sufficient credits are required. Provider credentials remain exclusively on Central. The engine sends only the published article title and content. It persists the generation ID before requesting classification so uncertain network retries recover the same billed result. Definite provider failures return credits and permit a new attempt.

Margin’s Classifier scores fixed content-type categories (Tutorial, Essay, News, Review, Case study, Interview, Reference, Personal story) and writing styles (Conversational, Analytical, Narrative, Instructional, Persuasive, Reflective, Reportorial). A unique score above 2 on the 0–4 rubric selects the dominant label; ties or weak matches become **Other / mixed**. These are model suggestions, not editorial truth or causal evidence. Compare sample sizes and article lengths when interpreting which formats attract more reading.

Article/Guide attribution is derived by the server from saved content and stored
on each visit. It requires no AI call. Changing an item's type does not relabel
earlier visits. Existing visits migrate to Article; homepage visits stay separate.
The content-type filter applies to summaries, daily traffic, reading, tags,
classifications, and the details sidebar. Comment reports use the item's current
type, just as they use current moderation status. The classifier queue also follows
the selected content type, but always operates on current published revisions.

## Country setup

Margin does not include a country database or download one automatically. In **Settings → General → Country lookup**, the owner can review the DB-IP Country Lite source and explicitly confirm a download from Eris Networks. The engine verifies both the compressed and uncompressed SHA-256 hashes and the MaxMind DB structure, then saves the snapshot encrypted in S3 with only its object key, version, and checksum in SQL. The release must be updated to offer a newer snapshot; installing the same version again does not make another copy. Central does not perform country lookup or receive visit IPs for this feature.

Until installation, Margin discards visitor IPs after handling each request and stores `Unknown` as the visit location. It never writes analytics IPs to S3. Installing the database makes new visits store country codes; earlier Unknown rows are not backfilled. On startup, older `ip:` visit rows are changed to `Unknown`, and reports suppress any that remain. All visit locations follow the existing rolling 90-day retention. Country accuracy depends on the pinned snapshot. The report attributes [DB-IP Country Lite](https://db-ip.com/db/download/ip-to-country-lite) whenever it shows country codes from the database.

Margin-hosted publications set `TRUST_PROXY=1` so request-time country lookup and rate limiting use the address from the trusted Hostlier proxy. Self-hosted deployments should set the number of trusted proxy hops if the origin is protected from direct requests. Country lookup requires configured S3 storage.

`GET /api/settings/country-database` reports whether the pinned version is installed. `POST /api/settings/country-database` requires owner access and `{ "confirm": true }` before it downloads and verifies the file. The analytics response reports `countrySource` as `none` or `local` and `countryConfigured` as a boolean. An installation only affects new visits.

## Storage and API

SQLite and PostgreSQL create the analytics tables automatically at startup. Visits own section measurements and discrete events with cascading deletion; deleting an article removes its analytics. Visits older than the rolling 90 UTC calendar days are pruned when new telemetry is accepted. On an idle installation, stored data remains until the next accepted batch. Existing comments follow their existing retention policy.

- `POST /api/public/analytics` accepts a JSON batch (64 KiB maximum, up to 100 sections, 100 media measurements, 30 page events, and 30 player events). Origin checks and per-IP request limits apply. Cumulative time/depth upserts are monotonic, and unique event IDs prevent duplicate retries/beacons from inflating reports. Page identity cannot be rebound to another session/article/revision. Unpublished articles and stale revisions are rejected.
- `GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&page=ARTICLE_ID` requires the owner session or owner API token. Omit `page` for all pages or use `page=home`. Add `contentType=article` or `guide` to filter by content type; omit it for all content. `contentKinds` contains these stored types, while `contentTypes` retains the existing AI classification labels. Date ranges span at most 90 calendar days. Responses contain `summary`, `daily`, `countries`, `pages`, `sections`, `passages`, `clicks`, `commentPages`, `media`, `mediaEvents`, `pageOptions`, `pagination`, `tags`, `contentKinds`, `contentTypes`, `writingStyles`, `classificationCoverage`, and `countryConfigured`. `pageSize` accepts 1–50 (default 10). Each breakdown accepts its own offset, e.g. `pagesOffset=10` or `passagesOffset=25`; metadata supplies `total`, `offset`, and `pageSize`. Out-of-range offsets clamp to the last page.

- `GET /api/analytics/classification?page=ARTICLE_ID` requires owner access and returns availability, credit cost, published article count, pending count, and the next ten current published revisions needing classification. The optional page and `contentType` filters follow the report conventions.
- `POST /api/analytics/classification` accepts `{postId, revision}` with owner access. It validates publication and revision, reuses cached labels, and calls Central's `/v1/generations/classification` when needed. Results contain `content_type` and `writing_style`. Refreshing a report never starts a paid classification.

Batch shape:

```json
{
  "viewId": "11111111-1111-4111-8111-111111111111",
  "sessionId": "22222222-2222-4222-8222-222222222222",
  "postId": "",
  "revision": "",
  "activeMs": 15000,
  "scrollDepth": 75,
  "sections": [],
  "events": [{ "id": "33333333-3333-4333-8333-333333333333", "kind": "click", "target": "/post/example", "sectionId": "" }]
}
```

Article batches supply the published post ID/revision. Sections contain `id`, `label`, and cumulative `activeMs`. Events use `click`, `highlight`, or `copy`; passage events carry the selected article text in `target` and the section ID. Browser retries are bounded in memory; blockers, disabled JavaScript and failed final deliveries can undercount. Public telemetry is an engagement estimate and is not suitable for billing or fraud-proof attribution.

The tracker respects Do Not Track and Global Privacy Control. It does not create cookies, fingerprint visitors, or store IP addresses, user agents, reader email addresses, or names in the analytics tables. Signed-in owner requests are ignored server-side.

Publication owners can adapt the [analytics privacy wording](privacy.md) for their own privacy policy, including the distinction between a saved country code and an IP used only during request handling.


## Audio and video

Homepage hero videos use the same media measurements and player activity history as article videos. They appear as **Homepage** and can be isolated with the Homepage page filter. The same recording on an article is reported separately. Only the saved, visible hero is eligible; unsupported provider callbacks remain unavailable, and the existing privacy exclusions apply.

**Media → Player activity** shows a timestamped history of actions inside Margin's native and embedded players, newest first. Each row identifies the page and recording, the action (`play`, `pause`, `resume`, `seek`, `ended`, or `exit`), its UTC time, and the playback position. **Played before stop** shows actual playback time since the most recent play or resume for pause, end, and page-exit events; it excludes buffering, paused time, and skipped positions. Page exits appear as **Left page** when leaving during playback. Delivery at exit is best effort; hiding the tab alone does not end a playback session. Missing historical durations show a dash, distinct from a measured zero. Seeking reports the destination. Buffering is not a pause; reaching the end is recorded even if the listener skipped most of the recording. Supported actions depend on the provider's player callbacks. Provider-wide activity and clicks inside opaque frames are not inferred.

The optional `mediaEvents` batch array (up to 30 events per request) contains `{id, mediaId, kind, occurredAt, positionMs, playedMs?}`. `playedMs` is optional and applies only to pause, end, and exit events; reports return it as nullable `played_ms`. Event UUIDs stay unchanged across retries. Reports return `mediaEvents` with `pagination.mediaEvents`; `mediaEventsOffset` paginates the newest-first history. Published-page attribution, privacy opt-outs, owner exclusion, and visit retention apply. History begins when event tracking is enabled; aggregate totals cannot reconstruct earlier actions.

The **Media** tab reports player visits, visits with playback, playback time, average unique portion played, completions, and measurement coverage. Rows group the same source within a page, including an article recording reused as its cover. The `mediaOffset` query parameter paginates these rows. Average progress is calculated only across measurable visits that started playback. Visits with unavailable player APIs do not dilute that average or become fake zero-play measurements.

Report rows include server-derived `timeline_available` (`1` or `0`). Spotify and SoundCloud collections retain plays and playback time, but their progress and completion columns show dashes. Migrated historical rows have unknown timeline availability until a new measurement establishes it.

Audio and video share the same measurement, delivery, storage, and reporting pipeline. Playback time excludes pauses, buffering, and skipped time; replaying adds playback time without inflating unique progress. Completion requires reaching the end after playing at least 90% of the timeline.

| Player | Playback metrics | Timestamped actions |
| --- | --- | --- |
| Native audio, native video, and HLS video | Playback visits, time, unique progress, completion | Play, pause, resume, seek, ended |
| Vimeo video and SoundCloud audio | Same metrics when the provider API is available | Play, pause, resume, seek, ended |
| YouTube video and Spotify audio | Same metrics when the provider API is available | Play, pause, resume, ended; seeks are not inferred from position jumps |
| Hosted frames without an integrated player API | Marked unavailable | Unavailable |

Collection timeline limits above apply to this table. Both audio and video include replay hotspots and playback durations before pauses, ends, and exits, wherever their player exposes the necessary playback samples. The playback-visits total counts visits with playback, not every play or resume action.

Expand the replay summary below a recording to see its **replay timeline**. Twenty equal segments each cover 5% of the recording; darker segments have more actual replay time. The highest segment is shown with its percentage range and recording timestamps when a consistent duration is available. Ties are marked joint highest. **View all segment values** provides the same information as a table. Replay means replaying a portion already heard or viewed in the same page visit, summed across measured visits, not across a person’s browsing history. Playback speed affects elapsed replay time. Seeking alone and buffering add no replay time.

**No replays recorded** means the measured visits contain zero replay time. **Replay measurement unavailable** means no usable replay measurements exist, including historical visits recorded before this feature. Collections and unsupported players do not have a replay timeline. Report rows expose `replay_ms` (20 cumulative replay-time bins), `replay_measured_views` (coverage), and nullable `duration_ms` (consistent recording duration); unavailable bins are null. Older visits are excluded from replay coverage rather than silently treated as zero.

Collection accepts an optional `media` array of `{id, started, playedMs, progress, completed, measurable, durationMs?, replayMs?}`. IDs identify sources in the published article or saved, visible homepage hero; client-supplied provider/title fields are rejected. Homepage batches use empty `postId` and `revision`; media and player-event report rows use `post_id: "home"` and `title: "Homepage"`. The server derives attribution from published content or the saved design and stores cumulative maxima so repeated heartbeats and beacons cannot inflate metrics. Media URLs and their credentials/query tokens are not stored in analytics. Media rows share visit retention and deletion.

See [voice blogs and measurement coverage](audio-blogs.md#hosted-recordings-and-playback-analytics) for supported players and the meaning of each measurement.
