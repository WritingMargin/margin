package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const help = `Margin — Markdown publishing for people and agents

margin <command> [options]

  login --url <blog-url>                     Connect through the signed-in admin
  logout                                   Revoke and remove the saved CLI connection
  whoami                                   Check the current connection
  audit article.md [--json]                    Check draft SEO or verify --id POST_ID --public
  push [id] --file <path|-> [options]         Upload a whole Markdown file
  list                                      List posts, including drafts
  get <id> [--draft] [--lines start:end]      Read Markdown with inclusive line ranges
  find <query>                              Search titles and slugs
  grep <regex> [--id <id>]                   Search content with one-based line numbers
  create --title <title> --slug <slug> --file <path|-> [--publish]
  update <id> --lines start:end (--file <path|-> | --text <text>) --revision <revision>
  publish <id> [--draft] --revision <revision> Publish a draft
  unpublish <id> --revision <revision>      Return a post to draft
  delete <id> --yes --revision <revision>    Permanently delete post metadata
  discard-draft <id> --revision <revision>   Discard staged edits; keep live content
  info                                     Show server and storage status
  skills [list]                            List embedded agent skills
  skills show <name>                       Read a skill and its references
  skills install <name> [--dir <directory>] Install a skill (default: .agents/skills)
  deploy nginx|apache --domain <hostname>   Generate engine reverse-proxy config
  --version                                Print version
  help [command]                           Show help (also --help or -h)

Run margin login --url https://your-blog.example first. Include /blog if mounted.
Use --url to select a server and --json for machine-readable results and errors.
MARGIN_URL and MARGIN_TOKEN (or .env) override the saved connection. Without a
saved connection, MARGIN_URL defaults to http://localhost:3001.
Use --draft with get, push, update, and publish to prepare changes to live posts.
Draft saves return an admin-only draftUrl preview link.
Use --file - for stdin. Revision guards prevent overwriting concurrent edits.
Grep uses Go/RE2 syntax (no lookarounds or backreferences); (?i) ignores case.
No Node.js, npm, or Go installation is needed to run this binary.
`

type cliError struct {
	Message string `json:"error"`
	Code    string `json:"code,omitempty"`
	Status  int    `json:"status,omitempty"`
}

func (e *cliError) Error() string { return e.Message }

type post map[string]any

func (p post) str(key string) string { s, _ := p[key].(string); return s }

type invocation struct {
	positions []string
	flags     map[string]string
}

var boolFlags = map[string]bool{"public": true, "draft": true, "json": true, "help": true, "yes": true, "publish": true, "version": true, "http-only": true, "no-browser": true}
var stringFlags = map[string]bool{"intent": true, "content-type": true, "title": true, "slug": true, "file": true, "text": true, "lines": true, "id": true, "revision": true, "dir": true, "domain": true, "upstream": true, "tls-cert": true, "tls-key": true, "output": true, "base-path": true, "url": true}

func parse(args []string) (invocation, error) {
	result := invocation{flags: map[string]string{}}
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			result.positions = append(result.positions, args[i+1:]...)
			break
		}
		if arg == "-h" {
			arg = "--help"
		}
		if arg == "-v" {
			arg = "--version"
		}
		if !strings.HasPrefix(arg, "-") || arg == "-" {
			result.positions = append(result.positions, arg)
			continue
		}
		consumed, err := result.parseFlag(arg, args[i+1:])
		if err != nil {
			return result, err
		}
		i += consumed
	}
	return result, nil
}
func (input invocation) parseFlag(arg string, remaining []string) (int, error) {
	if !strings.HasPrefix(arg, "--") {
		return 0, fmt.Errorf("Unknown option: %s", arg)
	}
	name, value, hasValue := strings.Cut(arg[2:], "=")
	if _, exists := input.flags[name]; exists {
		return 0, fmt.Errorf("Duplicate option: --%s", name)
	}
	if boolFlags[name] {
		if hasValue {
			return 0, fmt.Errorf("--%s does not take a value", name)
		}
		input.flags[name] = "true"
		return 0, nil
	}
	if !stringFlags[name] {
		return 0, fmt.Errorf("Unknown option: --%s", name)
	}
	consumed := 0
	if !hasValue {
		if len(remaining) == 0 || strings.HasPrefix(remaining[0], "--") {
			return 0, fmt.Errorf("--%s requires a value", name)
		}
		value, consumed = remaining[0], 1
	}
	input.flags[name] = value
	return consumed, nil
}

func output(w io.Writer, value any) error {
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	return enc.Encode(value)
}
func lines(content string) []string {
	if content == "" {
		return []string{}
	}
	result := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	if result[len(result)-1] == "" {
		result = result[:len(result)-1]
	}
	return result
}

var rangePattern = regexp.MustCompile(`^[1-9][0-9]*:[1-9][0-9]*$`)

func lineRange(value string, count int) (int, int, error) {
	if !rangePattern.MatchString(value) {
		return 0, 0, errors.New("Use an inclusive, one-based range such as --lines 3:7")
	}
	parts := strings.Split(value, ":")
	start, e1 := strconv.Atoi(parts[0])
	end, e2 := strconv.Atoi(parts[1])
	if e1 != nil || e2 != nil || start > end || end > count {
		return 0, 0, fmt.Errorf("Line range is outside this document (1–%d). Use get to inspect current lines", count)
	}
	return start, end, nil
}
func replaceLines(content, selected, replacement string) (string, error) {
	source := lines(content)
	start, end, err := lineRange(selected, len(source))
	if err != nil {
		return "", err
	}
	result := append(append(append([]string{}, source[:start-1]...), lines(replacement)...), source[end:]...)
	separator := "\n"
	if strings.Contains(content, "\r\n") {
		separator = "\r\n"
	}
	text := strings.Join(result, separator)
	if len(result) > 0 && strings.HasSuffix(content, "\n") {
		text += separator
	}
	return text, nil
}
func readInput(flags map[string]string, stdin io.Reader) (string, error) {
	text, hasText := flags["text"]
	file, hasFile := flags["file"]
	if hasText == hasFile {
		return "", errors.New("Provide exactly one of --file <path|-> or --text <text>")
	}
	if hasText {
		return text, nil
	}
	var reader io.Reader = stdin
	if file != "-" {
		f, err := os.Open(file) // #nosec G304 -- The CLI user explicitly selects --file; arbitrary local input files are an intentional capability.
		if err != nil {
			return "", err
		}
		defer f.Close()
		reader = f
	}
	b, err := io.ReadAll(io.LimitReader(reader, 3_000_001))
	if err != nil {
		return "", err
	}
	if len(b) > 3_000_000 {
		return "", errors.New("Input exceeds 3 MB")
	}
	return string(b), nil
}

type client struct {
	base, token string
	http        *http.Client
}

func newClient(raw, token string) (*client, error) {
	if token == "" {
		return nil, errors.New("Run margin login --url <blog-url>, or set MARGIN_TOKEN to an owner API token from Settings")
	}
	if raw == "" {
		raw = "http://localhost:3001"
	}
	u, err := url.Parse(raw)
	if err != nil || !validClientURL(u) {
		return nil, errors.New("MARGIN_URL must be an HTTP(S) URL without credentials, query, or fragment")
	}
	return &client{base: strings.TrimRight(u.String(), "/"), token: token, http: &http.Client{Timeout: 60 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return errors.New("Redirects are not allowed") }}}, nil
}
func validClientURL(u *url.URL) bool {
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" && u.User == nil && u.RawQuery == "" && !u.ForceQuery && u.Fragment == ""
}

func (c *client) request(method, route string, body any, result any) error {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, c.base+route, reader)
	if err != nil {
		return err
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("Request failed: %w", err)
	}
	defer res.Body.Close()
	return decodeResponse(res, result)
}

func decodeResponse(res *http.Response, result any) error {
	b, err := io.ReadAll(io.LimitReader(res.Body, 64*1024*1024+1))
	if err != nil {
		return err
	}
	if len(b) > 64*1024*1024 {
		return errors.New("Server response exceeds 64 MB")
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		failure := &cliError{Status: res.StatusCode}
		_ = json.Unmarshal(b, failure)
		failure.Status = res.StatusCode
		if failure.Message == "" {
			failure.Message = fmt.Sprintf("Server returned HTTP %d", res.StatusCode)
		}
		return failure
	}
	if err = json.Unmarshal(b, result); err != nil {
		return errors.New("Server did not return valid JSON")
	}
	return nil
}

// All post mutations share request error handling and JSON output.
func (c *client) write(method, route string, body any, out io.Writer) error {
	var result any
	if err := c.request(method, route, body, &result); err != nil {
		return err
	}
	return output(out, result)
}

func requireContent(p post) (string, error) {
	content, ok := p["content"].(string)
	if !ok {
		return "", errors.New("Server did not return Markdown content")
	}
	return content, nil
}
func requireRevision(command string, flags map[string]string) error {
	if command == "delete" && flags["yes"] != "true" {
		return errors.New("Deletion requires --yes")
	}
	if command != "update" && command != "publish" && command != "unpublish" && command != "delete" && command != "discard-draft" {
		return nil
	}
	if strings.TrimSpace(flags["revision"]) == "" {
		return &cliError{Message: "--revision is required. Read the post and pass the revision you reviewed", Code: "REVISION_REQUIRED"}
	}
	return nil
}
func guardRevision(p post, flags map[string]string) error {
	if err := requireRevision("update", flags); err != nil {
		return err
	}
	if p.str("revision") == "" {
		return errors.New("Server did not return a revision; refusing an unsafe update")
	}
	if revision, ok := flags["revision"]; ok && revision != p.str("revision") {
		return &cliError{Message: "The post changed since your read. Fetch and review it before saving", Code: "REVISION_CONFLICT"}
	}
	return nil
}
func run(args []string, stdin io.Reader, stdout io.Writer, getenv func(string) string, version string) error {
	input, err := parse(args)
	if err != nil {
		return err
	}
	command := "help"
	if len(input.positions) > 0 {
		command = input.positions[0]
	}
	if handled, err := runLocalCommand(command, input, stdout, version); handled {
		return err
	}
	if handled, err := runConnectedCommand(command, input.positions[1:], input.flags, stdin, stdout, getenv); handled {
		return err
	}
	return runPostCommand(command, input, stdin, stdout, getenv)
}

func runLocalCommand(command string, input invocation, stdout io.Writer, version string) (bool, error) {
	if input.flags["version"] == "true" {
		if input.flags["json"] == "true" {
			return true, output(stdout, map[string]string{"version": version})
		}
		_, err := fmt.Fprintln(stdout, version)
		return true, err
	}
	if command == "deploy" {
		return true, runDeploy(input.positions[1:], input.flags, stdout)
	}
	if command == "help" || input.flags["help"] == "true" {
		return true, showHelp(input.positions, input.flags, stdout)
	}
	if command == "skills" {
		return true, runSkills(input.positions[1:], input.flags, stdout)
	}
	return false, nil
}

// Only read CLI settings from .env; never execute shell expansions or override exported variables.
func dotenv() map[string]string {
	values := map[string]string{}
	data, err := os.ReadFile(".env")
	if err != nil {
		return values
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "export "))
		key, value, ok := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if !ok || (key != "MARGIN_URL" && key != "MARGIN_TOKEN") {
			continue
		}
		value = strings.TrimSpace(value)
		if len(value) >= 2 && (value[0] == '\'' || value[0] == '"') {
			quote := value[0]
			end := strings.LastIndexByte(value[1:], quote)
			if end < 0 {
				continue
			}
			value = value[1 : end+1]
		} else {
			value = strings.TrimSpace(strings.SplitN(value, "#", 2)[0])
		}
		values[key] = value
	}
	return values
}

// Execute runs the CLI with the caller's streams and returns a process exit code.
// Both the standalone command and blog server use this entry point.
func Execute(args []string, version string, stdin io.Reader, stdout, stderr io.Writer) int {
	local := dotenv()
	getenv := func(key string) string {
		if value, ok := os.LookupEnv(key); ok {
			return value
		}
		return local[key]
	}
	if err := run(args, stdin, stdout, getenv, version); err != nil {
		jsonMode := false
		for _, arg := range args {
			if arg == "--json" {
				jsonMode = true
			}
		}
		if jsonMode {
			var detail *cliError
			if !errors.As(err, &detail) {
				detail = &cliError{Message: err.Error()}
			}
			_ = output(stderr, detail)
		} else {
			fmt.Fprintln(stderr, "Error:", err)
		}
		return 1
	}
	return 0
}
