# Search engines

Open **Settings → Blog SEO** after configuring your public HTTPS blog URL. Keep **Allow search engines to index this blog** enabled and save the SEO settings.

Use the inner **Search appearance**, **Bing**, and **Google** steps to configure one area at a time. Unsaved SEO fields remain intact when switching steps.

## Bing and IndexNow

Enable **Automatically submit published changes**. Margin creates and serves its verification file, queues your homepage and existing published posts, and notifies Bing and other IndexNow search engines. No account or provider key is needed.

Publishing, editing a published post, changing its slug, unpublishing, and deleting a published post queue fresh notifications. Drafts are excluded. Notifications are saved alongside post changes and sent in the background; a search-engine outage does not delay publishing. Temporary failures retry automatically, with failures and the last received submission shown in settings. Use **Submit published pages** to submit the current publication and retry failed notifications.

Disabling automatic submission or search indexing pauses notifications. The public verification file is at `<blog URL>/indexnow.txt`, including any configured base path. It must be accessible to search engines. When the blog domain changes, notifications for the previous domain are not sent; submit published pages for the new domain.

**Submitted** means the search engine received the URLs. **Verification pending** means it is still checking the key. Neither means the pages have been indexed. See the [IndexNow protocol](https://www.indexnow.org/documentation).

## Google Search Console

1. Open Google Search Console from SEO settings and add a **URL-prefix** property using the displayed blog address.
2. Choose **HTML tag** verification. Paste the tag’s `content` value into **Google verification token**, then save it in Margin.
3. Return to Google and click **Verify**. Keep the saved token in Margin afterward.
4. In Search Console’s **Sitemaps** section, submit the sitemap address shown in Margin.

Google performs verification and sitemap submission in Search Console. Margin does not claim that saving a token verifies the site. Domain properties use DNS verification instead of the HTML tag method. See [Google’s verification instructions](https://support.google.com/webmasters/answer/9008080).

Margin updates the sitemap automatically as posts are published, edited, or removed. Google chooses when to crawl and index those pages; ordinary articles do not qualify for Google’s restricted Indexing API. See [Google’s crawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).

For a blog mounted under a path such as `/blog`, add a second sitemap line to the main website’s root `/robots.txt`, alongside its existing sitemap. Use the public hostname and full mount path.

```text
Sitemap: https://example.com/blog/sitemap.xml
```

After Google processes the sitemap, inspect each canonical article URL using URL Inspection. Record the inspection date, indexing status and Google-selected canonical. The sitemap report and the URL inspection report answer different questions.

To submit and inspect from Margin, see [Connect publishing accounts](publishing-connections.md).


Use **Check root robots.txt** to read the main site's public file. The check looks for the exact sitemap URL, including the publication subpath. A missing direct line is actionable unless another advertised sitemap index already includes this blog. A failed or blocked fetch is reported as unavailable. This check measures what Margin can fetch, not whether a search provider visited.

With a connected verified property, **Check sitemap processing** reads Google’s pending flag, last download, errors and warnings. **Inspect and record indexing** saves Google's response for a published slug. **Record 28-day performance** records finalized web-search impressions and clicks for the canonical URL plus up to ten reported queries. The requested window ends three days before today's UTC date to allow for reporting delays. Page totals include traffic not attributed to individual queries; no returned data is shown as unavailable rather than zero. **View saved measurements** shows up to 60 observations per current article URL and property. Rechecking a measurement on the same UTC day updates that day's record.

After two to four weeks, compare the article’s measurements with its baseline. Use reader activity in Margin Analytics separately from Search Console impressions and clicks; neither establishes a crawler visit or an AI citation. Google chooses when to process a sitemap, crawl a URL or return its performance data. [Search Analytics API](https://developers.google.com/webmaster-tools/v1/api_reference_index#Search_Analytics) · [Sitemaps API](https://developers.google.com/webmaster-tools/v1/api_reference_index#Sitemaps)
