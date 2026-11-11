package cli

import (
	"errors"
	"io"
	"net/url"
)

func runPush(args []string, flags map[string]string, in io.Reader, out io.Writer, getenv func(string) string) error {
	if len(args) > 1 {
		return errors.New("Use margin push [id] --file <path|->; see push --help")
	}
	if err := commandFlags(nil, flags, "url", "json", "file", "title", "slug", "publish", "revision", "content-type", "draft"); err != nil {
		return err
	}
	if err := validatePush(args, flags); err != nil {
		return err
	}
	content, err := readInput(flags, in)
	if err != nil {
		return err
	}
	c, err := connectedClient(flags, getenv)
	if err != nil {
		return err
	}
	body, method, route, err := preparePush(c, args, flags, content)
	if err != nil {
		return err
	}
	return c.write(method, route, body, out)
}

func validatePush(args []string, flags map[string]string) error {
	if flags["draft"] == "true" && flags["publish"] == "true" {
		return errors.New("--draft and --publish cannot be used together")
	}
	if err := validateContentType(flags); err != nil {
		return err
	}
	if flags["file"] == "" {
		return errors.New("push requires --file <path|->")
	}
	if len(args) == 1 {
		return requireRevision("update", flags)
	}
	if flags["revision"] != "" {
		return errors.New("--revision requires an existing post ID")
	}
	if flags["title"] == "" || flags["slug"] == "" {
		return errors.New("A new post requires --title and --slug")
	}
	return nil
}

func pushBody(flags map[string]string, content string) map[string]any {
	body := map[string]any{"content": content}
	setContentType(body, flags)
	for _, key := range []string{"title", "slug"} {
		if flags[key] != "" {
			body[key] = flags[key]
		}
	}
	if flags["publish"] == "true" {
		body["status"] = "published"
	}
	return body
}

func checkPushRevision(c *client, route string, flags map[string]string) error {
	var entry post
	if err := c.request("GET", route, nil, &entry); err != nil {
		return err
	}
	return guardRevision(entry, flags)
}

func preparePush(c *client, args []string, flags map[string]string, content string) (map[string]any, string, string, error) {
	body := pushBody(flags, content)
	method, route := "POST", "/api/posts"
	if len(args) == 1 {
		method, route = "PUT", route+"/"+url.PathEscape(args[0])
		if flags["draft"] == "true" {
			route += "/draft"
		}
		if err := checkPushRevision(c, route, flags); err != nil {
			return nil, "", "", err
		}
		body["revision"] = flags["revision"]
	} else if flags["publish"] != "true" {
		body["status"] = "draft"
	}
	return body, method, route, nil
}
