package cli

import (
	"errors"
	"net/url"
	"strconv"
	"strings"
)

// GenerateDeployment renders the same reviewed templates as margin deploy.
// It never reads credentials, contacts an upstream, or changes server configuration.
func GenerateDeployment(server, publicURL, upstream string) (string, error) {
	u, err := deploymentURL(publicURL)
	if err != nil {
		return "", err
	}
	flags := map[string]string{"domain": u.Hostname(), "upstream": upstream}
	if u.Scheme == "http" {
		flags["http-only"] = "true"
	}
	if path := strings.TrimSuffix(u.Path, "/"); path != "" {
		flags["base-path"] = path
	}
	d, err := deploymentOptions([]string{server}, flags)
	if err != nil {
		return "", err
	}
	if u.Port() != "" {
		d.Port, _ = strconv.Atoi(u.Port())
	}
	if err = renderDeployment(&d); err != nil {
		return "", err
	}
	return d.Config, nil
}

func deploymentURL(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u == nil {
		return nil, errors.New("Enter a public HTTP or HTTPS blog URL")
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return nil, errors.New("Use an HTTP or HTTPS public URL")
	}
	if deploymentURLExtras(u, raw) {
		return nil, errors.New("The public URL must not include credentials, a query, or a fragment")
	}
	u.Host = strings.ToLower(u.Host)
	if !validDeploymentHost(u.Hostname()) || u.RawPath != "" {
		return nil, errors.New("Use a DNS hostname or IPv4 address and an unescaped blog path")
	}
	if err := deploymentPublicPort(u); err != nil {
		return nil, err
	}
	return u, nil
}

func deploymentPublicPort(u *url.URL) error {
	if u.Port() == "" {
		if strings.HasSuffix(u.Host, ":") {
			return errors.New("Enter a valid public port")
		}
		return nil
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port < 1 || port > 65535 {
		return errors.New("Public port must be between 1 and 65535")
	}
	return nil
}

func (d deployment) Authority() string {
	if (d.Scheme == "https" && d.Port == 443) || (d.Scheme == "http" && d.Port == 80) {
		return d.Domain
	}
	return d.Domain + ":" + strconv.Itoa(d.Port)
}
func (d deployment) PublicURL() string { return d.Scheme + "://" + d.Authority() + d.BasePath }

func deploymentURLExtras(u *url.URL, raw string) bool {
	return u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.ForceQuery || strings.ContainsAny(raw, "\r\n#")
}
