# Connect publishing accounts

Each Margin installation can connect its publication owner’s Search Console and LinkedIn personal accounts. The installation operator registers the OAuth apps and supplies their client credentials in the server environment. Set a public HTTPS publication URL and configure Margin’s content encryption key. Include the blog mount path in each registered redirect URI.

| Provider | Registered redirect URI for a blog mounted at /journal | Environment variables |
| --- | --- | --- |
| Google | `https://example.com/journal/publishing/callback/google` | `MARGIN_GOOGLE_PUBLISHING_CLIENT_ID`, `MARGIN_GOOGLE_PUBLISHING_CLIENT_SECRET` |
| LinkedIn | `https://example.com/journal/publishing/callback/linkedin` | `MARGIN_LINKEDIN_PUBLISHING_CLIENT_ID`, `MARGIN_LINKEDIN_PUBLISHING_CLIENT_SECRET` |

In Google Cloud, enable the Search Console API, configure the OAuth consent screen and create a web application OAuth client. The owner grants the webmasters scope to submit sitemaps and inspect published URLs. In LinkedIn’s developer portal, enable both **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**. The connection requests `openid`, `profile` and `w_member_social`. Restart the Margin server after setting the environment variables.

In **Settings → Blog SEO → Google**, connect Google and select a verified property that covers the blog. Submit the sitemap or enter a published article’s slug to inspect Google’s indexed version. Google’s response can include coverage, crawl time and selected canonical. A submission receipt confirms delivery. **Check sitemap processing** looks up subsequent downloads, warnings and errors. **Record 28-day performance** saves this article’s impressions, clicks and reported top queries. Inspecting a URL also records the indexing response. **View saved measurements** retrieves prior observations for that article and property. Authorized MCP clients can list properties, submit a sitemap and inspect an article.

Publishing or updating an article opens **Post details → SEO & sharing**. This tab offers the live article link, social share links, a copyable Instagram caption, and publishing-platform links. Select **LinkedIn** to open LinkedIn's sharing page with the article URL; no Margin connection is needed for this link.

Under **Sharing image**, the article cover is used automatically. Choose an image or select **Generate image**, review the result, then choose **Use as sharing image**. Save or publish your changes to update link previews. **Use cover again** clears the override. Without an image cover or override, Margin uses the publication default if available.

Disconnecting removes the grant from this Margin installation. Revoke the app in the provider’s own account settings to withdraw the provider grant. Reconnect an expired grant from Margin settings. Tokens are encrypted using the installation’s content encryption key and included in its key rotation procedure.

[Google Search Console API](https://developers.google.com/webmaster-tools/v1/api_reference_index) · [LinkedIn member sharing](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin)
