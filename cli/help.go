package cli

import (
	"fmt"
	"io"
)

var commandHelp = map[string]string{
	"audit": `margin audit article.md [--title TITLE] [--slug SLUG] [--intent index|hidden] [--json]
margin audit --id POST_ID [--public] [--intent index|hidden] [--json]

Checks a Markdown file against the connected blog's current author and SEO settings.
The first Markdown H1 supplies the title; the filename supplies the default slug.
Use --id for a saved article. Add --public to fetch and verify its published HTML.
All findings include severity, field or URL, explanation and fix. No changes are saved.
`,
	"login": `margin login --url https://example.com/blog [--no-browser] [--json]

Opens your admin in the browser. Sign in if needed, compare the code with your
terminal, and approve owner access. The code expires after 10 minutes.
--no-browser prints the link for use on another computer or a headless server.
Stores a revocable credential in your user config directory (file mode 0600).
MARGIN_CONFIG_DIR overrides the directory. The password and browser session
are never copied. HTTPS is required except for local loopback addresses.
--json emits a pending object followed by a connected object (JSON stream).
`,
	"logout": `margin logout [--json]

Revokes the saved connection on its server and removes the local credential.
If the server cannot be reached, the credential is retained so you can retry.
MARGIN_TOKEN is unaffected; revoke manually created tokens in Settings.
`,
	"whoami": `margin whoami [--url URL] [--json]

Verifies owner access to the selected blog without printing credentials.
`,
	"push": `margin push --title 'Field notes' --slug field-notes --file notes.md [--publish]
margin push POST_ID --file notes.md --revision REVISION_FROM_GET [--publish | --draft]

Creates a draft or replaces the entire Markdown body of an existing post.
Use --file - for stdin. Existing posts require the revision you reviewed with
margin get POST_ID --json. A conflict fails without overwriting newer edits.
An existing post keeps its publication status unless --publish is supplied;
updating a published post makes the changes live. Use --draft to save unpublished
changes while keeping the current live version. Read with get --draft first,
then publish with publish --draft using the saved draft revision. --draft and
--publish cannot be combined. Draft saves return an admin-only draftUrl.
Optional --content-type article|guide selects the content format (new posts default to article).
Omitting --content-type preserves an existing format. Optional --title and --slug update those fields. No automatic slug matching.
Also supports --url URL and --json. Publishing does not send a newsletter.
`,
	"list":          "margin list [--url URL] [--json]\n\nLists posts, including private drafts.\n",
	"get":           "margin get POST_ID [--draft] [--lines START:END] [--url URL] [--json]\n\nReads Markdown. --draft reads the saved working draft (or current post if none exists). --json includes the revision required for later edits.\n",
	"find":          "margin find QUERY [--url URL] [--json]\n\nSearches post titles and slugs, ignoring case.\n",
	"grep":          "margin grep REGEX [--id POST_ID] [--url URL] [--json]\n\nSearches Markdown using Go/RE2 expressions and one-based line numbers.\n",
	"create":        "margin create --title TITLE --slug SLUG (--file PATH|- | --text TEXT) [--publish] [--url URL] [--json]\n\nCreates a draft by default. --publish makes it public immediately.\nUse --content-type article|guide to select the format; defaults to article.\n",
	"update":        "margin update POST_ID [--draft] --lines START:END (--file PATH|- | --text TEXT) --revision REVISION [--url URL] [--json]\n\nReplaces inclusive, one-based lines. Updating a published post changes its live content. Use --draft to stage changes without publishing. Read with get --draft first.\nOptional --content-type article|guide changes the format; otherwise it is preserved.\n",
	"publish":       "margin publish POST_ID [--draft] --revision REVISION [--url URL] [--json]\n\nPublishes an existing draft. --draft publishes saved staged changes using their reviewed revision, provided the live version has not changed. Does not send a newsletter.\n",
	"discard-draft": "margin discard-draft POST_ID --revision DRAFT_REVISION [--url URL] [--json]\n\nDiscards staged edits while preserving the live post and revision history. Read with get --draft first.\n",
	"unpublish":     "margin unpublish POST_ID --revision REVISION [--url URL] [--json]\n\nReturns a published post to a private draft. Use the current live revision from get (without --draft). Pending staged edits are retained as the private draft; the last live version remains in history. Returns draftUrl.\n",
	"delete":        "margin delete POST_ID --yes --revision REVISION [--url URL] [--json]\n\nPermanently deletes post metadata. Read and review its revision first.\n",
	"info":          "margin info [--url URL] [--json]\n\nShows the connected server's health and storage status.\n",
	"skills":        "margin skills [list]\nmargin skills show NAME\nmargin skills install NAME [--dir DIRECTORY]\n\nInstallation defaults to .agents/skills in the current directory. Use --dir to choose another location.\nBundled skills: engineering-writing, margin-authoring.\nEngineering writing and Margin authoring guides. Works offline; supports --json.\n",
	"deploy":        deployHelp,
}

func showHelp(positions []string, flags map[string]string, out io.Writer) error {
	command := "help"
	if len(positions) > 0 {
		command = positions[0]
	}
	if command == "help" && len(positions) > 1 {
		command = positions[1]
	}
	text := help
	if command != "help" {
		var ok bool
		text, ok = commandHelp[command]
		if !ok {
			return fmt.Errorf("Unknown command: %s", command)
		}
	}
	if flags["json"] == "true" {
		return output(out, map[string]string{"help": text})
	}
	_, err := io.WriteString(out, text)
	return err
}
