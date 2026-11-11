package cli

import (
	"bytes"
	"embed"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"text/template"
)

//go:embed templates/*.tmpl
var deploymentTemplates embed.FS

const deployHelp = `Generate an engine reverse-proxy site configuration (offline; no API token needed).

margin deploy nginx|apache --domain blog.example.com [options]

  --base-path PATH   Proxy snippet for an existing site (e.g. /blog)
  --upstream URL     Engine HTTP origin (default http://127.0.0.1:3001)
  --tls-cert PATH    Existing PEM certificate/full chain (absolute server path)
  --tls-key PATH     Existing PEM private key (absolute server path)
  --http-only        Generate HTTP only; cannot be combined with TLS paths
  --output FILE     Write a new file; never overwrite (default stdout; - also stdout)
  --json            Return configuration and metadata as JSON
  --help            Show this help

HTTPS is the default. Certificate paths default to:
  /etc/letsencrypt/live/DOMAIN/fullchain.pem
  /etc/letsencrypt/live/DOMAIN/privkey.pem
Specify both TLS paths to override these defaults. Certificates must already exist.
The command does not obtain certificates, install configs, or reload servers.
Generated comments describe installation, validation and required engine settings.
`

type deployment struct {
	BasePath string `json:"basePath,omitempty"`
	Server   string `json:"server"`
	Domain   string `json:"domain"`
	Upstream string `json:"upstream"`
	TLS      bool   `json:"tls"`
	Cert     string `json:"-"`
	Key      string `json:"-"`
	Scheme   string `json:"-"`
	Port     int    `json:"-"`
	Config   string `json:"config"`
	Path     string `json:"path,omitempty"`
}

func runDeploy(args []string, flags map[string]string, w io.Writer) error {
	if flags["help"] == "true" || len(args) == 0 {
		if flags["json"] == "true" {
			return output(w, map[string]string{"help": deployHelp})
		}
		_, err := io.WriteString(w, deployHelp)
		return err
	}
	d, err := deploymentOptions(args, flags)
	if err != nil {
		return err
	}
	if err = renderDeployment(&d); err != nil {
		return err
	}
	if file := flags["output"]; file != "" && file != "-" {
		if err = writeDeployment(file, d.Config); err != nil {
			return err
		}
		d.Path = file
	}
	return displayDeployment(w, d, flags["json"] == "true")
}
func deploymentOptions(args []string, flags map[string]string) (deployment, error) {
	d := deployment{}
	if len(args) != 1 || (args[0] != "nginx" && args[0] != "apache") {
		return d, errors.New("Use deploy nginx or deploy apache; see deploy --help")
	}
	if err := deploymentFlags(flags); err != nil {
		return d, err
	}
	d.Server = args[0]
	d.Domain = strings.ToLower(flags["domain"])
	if !validDeploymentHost(d.Domain) {
		return d, errors.New("--domain must be a DNS hostname without a scheme, port, wildcard or path")
	}
	upstream := flags["upstream"]
	if upstream == "" {
		upstream = "http://127.0.0.1:3001"
	}
	var err error
	d.Upstream, err = deploymentUpstream(upstream)
	if err != nil {
		return d, err
	}
	if err = deploymentMount(&d, flags); err != nil {
		return d, err
	}
	err = deploymentTLS(&d, flags)
	return d, err
}
func deploymentFlags(flags map[string]string) error {
	allowed := map[string]bool{"domain": true, "upstream": true, "tls-cert": true, "tls-key": true, "http-only": true, "output": true, "json": true, "base-path": true}
	for key, value := range flags {
		if !allowed[key] {
			return fmt.Errorf("--%s is not supported by deploy", key)
		}
		if value == "" {
			return fmt.Errorf("--%s requires a non-empty value", key)
		}
	}
	return nil
}

var deploymentLabel = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)

func validDeploymentHost(host string) bool {
	if len(host) == 0 || len(host) > 253 {
		return false
	}
	for _, label := range strings.Split(host, ".") {
		if !deploymentLabel.MatchString(label) {
			return false
		}
	}
	return true
}
func deploymentUpstream(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", errors.New("--upstream must be an HTTP origin such as http://127.0.0.1:3001")
	}
	if u.Scheme != "http" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return "", errors.New("--upstream must use HTTP without credentials, query or fragment")
	}
	if u.Path != "" && u.Path != "/" {
		return "", errors.New("--upstream must not contain a path; the engine is served at the site root")
	}
	return deploymentAddress(u)
}
func deploymentAddress(u *url.URL) (string, error) {
	host := strings.ToLower(u.Hostname())
	if net.ParseIP(host) == nil && !validDeploymentHost(host) {
		return "", errors.New("--upstream must contain a valid hostname or IP address")
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port < 1 || port > 65535 {
		return "", errors.New("--upstream requires an explicit port between 1 and 65535")
	}
	return "http://" + net.JoinHostPort(host, strconv.Itoa(port)), nil
}

var deploymentPath = regexp.MustCompile(`^/[A-Za-z0-9_./-]+$`)

func deploymentTLS(d *deployment, flags map[string]string) error {
	d.TLS = flags["http-only"] != "true"
	d.Scheme = "http"
	d.Port = 80
	cert, key := flags["tls-cert"], flags["tls-key"]
	if !d.TLS {
		if cert != "" || key != "" {
			return errors.New("--http-only cannot be combined with --tls-cert or --tls-key")
		}
		return nil
	}
	if (cert == "") != (key == "") {
		return errors.New("Provide both --tls-cert and --tls-key")
	}
	if cert == "" {
		cert = "/etc/letsencrypt/live/" + d.Domain + "/fullchain.pem"
		key = "/etc/letsencrypt/live/" + d.Domain + "/privkey.pem"
	}
	if !deploymentPath.MatchString(cert) || !deploymentPath.MatchString(key) {
		return errors.New("TLS paths must be absolute server paths using letters, digits, /, ., _ or -")
	}
	d.Cert = cert
	d.Key = key
	d.Scheme = "https"
	d.Port = 443
	return nil
}
func renderDeployment(d *deployment) error {
	t, err := template.ParseFS(deploymentTemplates, "templates/"+deploymentTemplate(d)+".tmpl")
	if err != nil {
		return err
	}
	var b bytes.Buffer
	if err = t.Execute(&b, d); err != nil {
		return err
	}
	d.Config = b.String()
	return nil
}
func writeDeployment(path, content string) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644) // #nosec G304 G302 -- CLI user selects the output path; exclusive creation prevents overwrite. Public proxy configuration contains certificate paths, not private keys.
	if errors.Is(err, os.ErrExist) {
		return fmt.Errorf("Configuration already exists at %s; review it before replacing it", path)
	}
	if err != nil {
		return err
	}
	_, writeErr := io.WriteString(f, content)
	err = errors.Join(writeErr, f.Close())
	if err != nil {
		err = errors.Join(err, os.Remove(path))
	}
	return err
}
func displayDeployment(w io.Writer, d deployment, jsonMode bool) error {
	if jsonMode {
		return output(w, d)
	}
	if d.Path != "" {
		_, err := fmt.Fprintln(w, "Wrote "+d.Server+" configuration to "+d.Path)
		return err
	}
	_, err := io.WriteString(w, d.Config)
	return err
}

func deploymentMount(d *deployment, flags map[string]string) error {
	d.BasePath = flags["base-path"]
	if d.BasePath == "" {
		return nil
	}
	if len(d.BasePath) > 200 || !regexp.MustCompile(`^(?:/[A-Za-z0-9_-]+)+$`).MatchString(d.BasePath) {
		return errors.New("--base-path must be a path such as /blog without a trailing slash")
	}
	if flags["tls-cert"] != "" || flags["tls-key"] != "" {
		return errors.New("A location snippet uses the existing server's TLS configuration; omit TLS paths")
	}
	return nil
}
func deploymentTemplate(d *deployment) string {
	if d.BasePath != "" {
		return d.Server + "-path"
	}
	return d.Server
}
