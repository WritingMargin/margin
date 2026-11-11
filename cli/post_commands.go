package cli

import (
	"errors"
	"fmt"
	"io"
	"net/url"
	"regexp"
	"strings"
)

type postCommand struct {
	name, argument string
	flags          map[string]string
	client         *client
	in             io.Reader
	out            io.Writer
}

type postCommandSpec struct {
	arguments int
	flags     []string
	run       func(*postCommand) error
}

var postCommands = map[string]postCommandSpec{
	"list":          {0, nil, (*postCommand).list},
	"find":          {1, nil, (*postCommand).list},
	"get":           {1, []string{"lines", "draft"}, (*postCommand).get},
	"grep":          {1, []string{"id"}, (*postCommand).grep},
	"create":        {0, []string{"title", "slug", "file", "text", "publish", "content-type"}, (*postCommand).create},
	"update":        {1, []string{"lines", "file", "text", "revision", "content-type", "draft"}, (*postCommand).update},
	"publish":       {1, []string{"revision", "draft"}, (*postCommand).setStatus},
	"unpublish":     {1, []string{"revision"}, (*postCommand).setStatus},
	"delete":        {1, []string{"yes", "revision"}, (*postCommand).delete},
	"discard-draft": {1, []string{"revision"}, (*postCommand).delete},
	"info":          {0, nil, (*postCommand).info},
}

func validatePostCommand(name string, input invocation, spec postCommandSpec) error {
	if len(input.positions) != spec.arguments+1 {
		return fmt.Errorf("Invalid arguments for %s. Run help", name)
	}
	for key := range input.flags {
		if key != "json" && key != "url" && !containsFlag(spec.flags, key) {
			return fmt.Errorf("--%s is not supported by %s", key, name)
		}
	}
	if err := validateContentType(input.flags); err != nil {
		return err
	}
	return requireRevision(name, input.flags)
}

func runPostCommand(name string, input invocation, in io.Reader, out io.Writer, getenv func(string) string) error {
	spec, ok := postCommands[name]
	if !ok {
		return fmt.Errorf("Unknown command: %s. Run help", name)
	}
	if err := validatePostCommand(name, input, spec); err != nil {
		return err
	}
	c, err := connectedClient(input.flags, getenv)
	if err != nil {
		return err
	}
	command := &postCommand{name: name, flags: input.flags, client: c, in: in, out: out}
	if spec.arguments == 1 {
		command.argument = input.positions[1]
	}
	return spec.run(command)
}

func (c *postCommand) path(id string) string {
	route := "/api/posts/" + url.PathEscape(id)
	if c.flags["draft"] == "true" || c.name == "discard-draft" {
		route += "/draft"
	}
	return route
}

func (c *postCommand) display(value any, text string) error {
	if c.flags["json"] == "true" {
		return output(c.out, value)
	}
	if text == "" {
		return nil
	}
	_, err := fmt.Fprintln(c.out, text)
	return err
}

func (c *postCommand) write(method, route string, body any) error {
	return c.client.write(method, route, body, c.out)
}

func (c *postCommand) read(id string) (post, error) {
	var entry post
	err := c.client.request("GET", c.path(id), nil, &entry)
	return entry, err
}

func (c *postCommand) reviewed() (post, error) {
	entry, err := c.read(c.argument)
	if err != nil {
		return nil, err
	}
	return entry, guardRevision(entry, c.flags)
}

func (c *postCommand) list() error {
	var posts []post
	if err := c.client.request("GET", "/api/posts", nil, &posts); err != nil {
		return err
	}
	matches := []post{}
	text := []string{}
	for _, entry := range posts {
		if c.name == "find" && !strings.Contains(strings.ToLower(entry.str("title")+"\n"+entry.str("slug")), strings.ToLower(c.argument)) {
			continue
		}
		matches = append(matches, entry)
		text = append(text, entry.str("id")+"\t"+entry.str("status")+"\t"+entry.str("slug")+"\t"+entry.str("title"))
	}
	return c.display(matches, strings.Join(text, "\n"))
}

func (c *postCommand) get() error {
	entry, err := c.read(c.argument)
	if err != nil {
		return err
	}
	content, err := requireContent(entry)
	if err != nil {
		return err
	}
	if selected, ok := c.flags["lines"]; ok {
		return c.displayLines(entry, content, selected)
	}
	if c.flags["json"] == "true" {
		return output(c.out, entry)
	}
	_, err = io.WriteString(c.out, content)
	return err
}

func (c *postCommand) displayLines(entry post, content, selected string) error {
	source := lines(content)
	start, end, err := lineRange(selected, len(source))
	if err != nil {
		return err
	}
	rows := []map[string]any{}
	text := []string{}
	for i := start - 1; i < end; i++ {
		rows = append(rows, map[string]any{"line": i + 1, "text": source[i]})
		text = append(text, fmt.Sprintf("%d\t%s", i+1, source[i]))
	}
	return c.display(map[string]any{"id": entry.str("id"), "revision": entry.str("revision"), "lines": rows}, strings.Join(text, "\n"))
}

func (c *postCommand) grepEntries() ([]post, error) {
	if id, ok := c.flags["id"]; ok {
		entry, err := c.read(id)
		return []post{entry}, err
	}
	var entries []post
	err := c.client.request("GET", "/api/posts", nil, &entries)
	return entries, err
}

func (c *postCommand) fullEntry(entry post) (post, error) {
	if _, ok := entry["content"].(string); ok {
		return entry, nil
	}
	return c.read(entry.str("id"))
}

func (c *postCommand) grep() error {
	pattern, err := regexp.Compile(c.argument)
	if err != nil {
		return fmt.Errorf("Invalid Go/RE2 regular expression: %w", err)
	}
	entries, err := c.grepEntries()
	if err != nil {
		return err
	}
	matches := []map[string]any{}
	text := []string{}
	for _, entry := range entries {
		entry, err = c.fullEntry(entry)
		if err != nil {
			return err
		}
		content, err := requireContent(entry)
		if err != nil {
			return err
		}
		for i, line := range lines(content) {
			if !pattern.MatchString(line) {
				continue
			}
			matches = append(matches, map[string]any{"id": entry.str("id"), "slug": entry.str("slug"), "line": i + 1, "text": line, "revision": entry.str("revision")})
			text = append(text, fmt.Sprintf("%s:%d:%s", entry.str("id"), i+1, line))
		}
	}
	return c.display(matches, strings.Join(text, "\n"))
}

func (c *postCommand) create() error {
	if c.flags["title"] == "" || c.flags["slug"] == "" {
		return errors.New("create requires --title and --slug")
	}
	content, err := readInput(c.flags, c.in)
	if err != nil {
		return err
	}
	body := pushBody(c.flags, content)
	if c.flags["publish"] != "true" {
		body["status"] = "draft"
	}
	return c.write("POST", "/api/posts", body)
}

func (c *postCommand) update() error {
	if c.flags["lines"] == "" {
		return errors.New("update requires --lines start:end")
	}
	replacement, err := readInput(c.flags, c.in)
	if err != nil {
		return err
	}
	entry, err := c.reviewed()
	if err != nil {
		return err
	}
	content, err := requireContent(entry)
	if err != nil {
		return err
	}
	updated, err := replaceLines(content, c.flags["lines"], replacement)
	if err != nil {
		return err
	}
	body := map[string]any{"revision": entry.str("revision"), "content": updated}
	setContentType(body, c.flags)
	return c.write("PUT", c.path(c.argument), body)
}

func (c *postCommand) setStatus() error {
	entry, err := c.reviewed()
	if err != nil {
		return err
	}
	status := "published"
	if c.name == "unpublish" {
		status = "draft"
	}
	if entry.str("status") == status && c.flags["draft"] != "true" {
		return output(c.out, entry)
	}
	method, route := "PUT", c.path(c.argument)
	if c.name == "publish" && c.flags["draft"] == "true" {
		method, route = "POST", route+"/publish"
	}
	return c.write(method, route, map[string]any{"revision": entry.str("revision"), "status": status})
}

func (c *postCommand) delete() error {
	return c.write("DELETE", c.path(c.argument), map[string]any{"revision": c.flags["revision"]})
}

func (c *postCommand) info() error {
	var health, storage any
	if err := c.client.request("GET", "/api/health", nil, &health); err != nil {
		return err
	}
	if err := c.client.request("GET", "/api/storage", nil, &storage); err != nil {
		return err
	}
	return output(c.out, map[string]any{"url": c.client.base + "/", "health": health, "storage": storage})
}
