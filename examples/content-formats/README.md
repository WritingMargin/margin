# Margin content format demo

Three complete examples for the content-type and template workflow:

- `playbook.md`: release-day publishing checklist and decision diagram (Guide type, Playbook outline).
- `guide.md`: a first-guide walkthrough with interactive tabs (Guide type, User guide outline).
- `article.md`: an editorial essay (Article type, Essay outline).

After building Margin, run from the repository root:

```sh
node examples/content-formats/demo.mjs
```

Open http://127.0.0.1:53241. `MARGIN_DEMO_PORT` overrides the port.
The demo uses the real Margin server with local test storage and a local template
catalog endpoint. It makes no AI calls and does not use production credentials.

The launcher saves its SQLite database, encrypted objects, encryption key, and
verification results under the ignored `artifacts/content-formats-demo/` folder.
It checks draft privacy, revision-guarded publishing, content type persistence,
public HTML, Markdown downloads, and print views for each example. Restarting the
launcher reseeds these three demo pages and the demo design from the source files.

The loopback-only demo workspace login is `demo@example.test` with password
`margin-local-demo-only`. This is a disposable test account, not a production
configuration. Stop the launcher with Ctrl+C; rerun it to reopen the saved demo.

Guides are standalone pages with heading navigation. A Playbook is a Guide
writing template; its Markdown checkboxes are currently read-only.
