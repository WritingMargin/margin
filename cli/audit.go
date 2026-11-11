package cli

import (
	"errors"
	"io"
	"path/filepath"
	"regexp"
	"strings"
)

var auditSlugSeparators = regexp.MustCompile("[^a-z0-9]+")

func runAudit(args []string, flags map[string]string, in io.Reader, out io.Writer, getenv func(string) string) error {
	if err := commandFlags(nil, flags, "id", "public", "url", "json", "intent", "title", "slug"); err != nil {
		return err
	}
	input, err := auditRequest(args, flags, in)
	if err != nil {
		return err
	}
	c, err := connectedClient(flags, getenv)
	if err != nil {
		return err
	}
	return c.write("POST", "/api/posts/audit", input, out)
}
func auditRequest(args []string, flags map[string]string, in io.Reader) (post, error) {
	input := post{"mode": "draft"}
	if intent := flags["intent"]; intent != "" {
		input["intent"] = intent
	}
	switch {
	case flags["id"] != "":
		if len(args) != 0 || flags["title"] != "" || flags["slug"] != "" {
			return nil, errors.New("Use either --id POST_ID or a Markdown file")
		}
		input["id"] = flags["id"]
		if flags["public"] == "true" {
			input["mode"] = "public"
		}
	case len(args) == 1 && flags["public"] != "true":
		article, err := auditFile(args[0], flags, in)
		if err != nil {
			return nil, err
		}
		input["article"] = article
	default:
		return nil, errors.New("Use margin audit article.md or margin audit --id POST_ID [--public]")
	}
	return input, nil
}
func auditFile(path string, flags map[string]string, in io.Reader) (post, error) {
	content, err := readInput(map[string]string{"file": path}, in)
	if err != nil {
		return nil, err
	}
	title := flags["title"]
	if title == "" {
		for line := range strings.SplitSeq(content, "\n") {
			if heading, ok := strings.CutPrefix(line, "# "); ok {
				title = strings.TrimSpace(heading)
				break
			}
		}
	}
	filename := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	if title == "" && path != "-" {
		title = filename
	}
	slug := flags["slug"]
	if slug == "" {
		slug = strings.Trim(auditSlugSeparators.ReplaceAllString(strings.ToLower(filename), "-"), "-")
	}
	return post{"title": title, "slug": slug, "content": content}, nil
}
