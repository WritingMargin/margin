# Install your blog as an app

Margin automatically provides an installable progressive web app for each blog.
The app uses the publication's saved name, description, logo, accent color, and
background color. Readers install your publication, with your branding.

Deploy the updated Margin server and frontend together. No account subscription
or additional environment variable is required. Serve the blog over HTTPS
(localhost is supported for development), then use your browser's Install app
or Add to Home Screen command. Availability and wording vary by browser.

## Settings → PWA

Owners can optionally override the app name, short name, icon, theme color, and
background color. Empty fields continue to follow the saved publication design.
Choose whether the installed app opens the blog homepage or the editor workspace;
the workspace still requires the normal sign-in. This is one app per blog, so the
launch choice applies to readers' installations too.

Upload an icon as PNG, JPEG, WebP, or GIF, up to 2 MB and 16 megapixels. Margin uses
the first frame of animated images, preserves the aspect ratio, and generates
180px Apple touch icons and 192px/512px PNG install icons with opaque padding for
maskable displays. Uploads become the public app icon only after saving settings.
The source of a PWA-only upload remains private; generated install icons are public.

Remote raster and standalone SVG blog logos can also be converted when directly available over
public HTTPS on port 443, up to 2 MB. Redirects and private
network destinations are not followed. Unsupported, missing, or unavailable
logos fall back to the Margin page mark in the publication's colors. SVG conversion
supports paths, basic shapes, groups, and gradients; scripts, external images,
text, stylesheets, and reusable symbol references are unsupported. SVG output is
bounded to 512px before generating all three installation icon sizes. Upload a
raster PWA override for SVGs that require unsupported features.

Use **Reset to blog branding**, then **Save PWA settings**, to clear the overrides
restore the homepage launch destination, and hide the install button.

## Show an Install app button

In **Settings → PWA**, enable **Show “Install app” button on the blog** and save.
It is off by default, including for existing blogs. When enabled, the button
appears in the public header on the homepage, articles, and newsletter pages
once JavaScript loads. Turning it off removes the button; readers can still use
installation controls provided by their browser.

Where the browser supplies an installation prompt, clicking the button opens it.
Otherwise, it shows instructions for installing through the browser, including
Add to Home Screen on iPhone/iPad and Add to Dock in Safari on Mac. No prompt is
opened automatically. The button is hidden in standalone app windows and after
an installation is accepted in the current page. Installation availability is
controlled by the browser; a regular browser tab cannot reliably detect every
previous installation. HTTPS or localhost is required.

## Updates and deployment paths

The server reads the current settings when serving `manifest.webmanifest`. Icon
URLs change with the icon source or colors, and generated images are cached in
server memory for up to five minutes. A remote logo replaced at the same URL may
take that long to refresh. Browsers and operating systems control when an already
installed app updates its name and icon; this may not happen immediately.

The app ID stays stable when names, colors, icons, or the launch destination
change. It is tied to the serving origin and blog mount path. Root deployments,
`/blog`, and nested paths all work without rebuilding the frontend. Install from
your preferred public domain; different origins or mount paths represent separate
installations.

## Writing offline

Sign in and open the writer workspace once while online. Margin then caches the
workspace shell and the code it loaded. After that, the installed app can reopen
the editor without a connection. If the app normally launches the blog homepage,
it opens a new article in the workspace while offline. Open **New article** and
write as usual; the editor also recovers a draft that was already saved on this
device. The most recently opened server article can be reopened from its editor
URL while offline.

**Save draft** while offline stores the article in this browser and labels it
**Saved on this device**. It is private to this browser and is not yet a server
draft. Margin retries a pending private draft when its editor is open and the
workspace reconnects. Pending drafts appear in **All content** so you can reopen
them after restarting the app. If the article changed elsewhere, the normal
revision conflict review appears and
the local copy remains available. Publishing requires a connection; clicking
**Publish** offline saves a local draft, without making it public. Keep the PWA
installed and its site data intact until the draft has synced. Browser storage
limits and private browsing can prevent local saving; the editor reports that
failure instead of claiming the draft was saved.

Offline editing is available after a successful sign in on this device. Signing
out removes offline access. API data, public pages, media uploads, AI tools, and
other workspace settings still require a connection. Automatic background sync
while the app is closed and push notifications are not supported.
