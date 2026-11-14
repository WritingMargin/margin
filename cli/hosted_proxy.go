package cli

import (
	"bytes"
	"errors"
	"net"
	"net/url"
	"strings"
	"text/template"
)

type hostedProxy struct {
	deployment
	UpstreamHost string
}

// GenerateHostedProxy renders an Nginx proxy to a publication's assigned HTTPS
// origin. It does not activate the publishing address or modify either server.
// Self-hosted HTTP upstream validation remains in GenerateDeployment.
func GenerateHostedProxy(publicURL, upstreamURL string) (string, error) {
	public, err := hostedProxyURL(publicURL)
	if err != nil {
		return "", err
	}
	upstream, err := hostedProxyURL(upstreamURL)
	if err != nil {
		return "", err
	}
	if upstream.Path != "" && upstream.Path != "/" {
		return "", errors.New("The assigned hosting URL must be an HTTPS origin without a path")
	}
	if public.Host == upstream.Host {
		return "", errors.New("Choose a public domain different from the assigned hosting hostname")
	}
	d := hostedProxy{deployment: deployment{Server: "nginx", Domain: public.Host, Upstream: "https://" + upstream.Host}, UpstreamHost: upstream.Host}
	flags := map[string]string{"base-path": strings.TrimSuffix(public.Path, "/")}
	if err := deploymentMount(&d.deployment, flags); err != nil {
		return "", err
	}
	if err := deploymentTLS(&d.deployment, flags); err != nil {
		return "", err
	}
	return renderHostedProxy(d)
}

func hostedProxyURL(raw string) (*url.URL, error) {
	u, err := deploymentURL(raw)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "https" || u.Port() != "" {
		return nil, errors.New("Use an HTTPS URL without an explicit port")
	}
	if !hostedProxyDNSHost(u.Host) {
		return nil, errors.New("Use a public DNS hostname for the hosted publication")
	}
	return u, nil
}

func hostedProxyDNSHost(host string) bool {
	if net.ParseIP(host) != nil || !strings.Contains(host, ".") {
		return false
	}
	for _, suffix := range []string{".localhost", ".local", ".internal", ".lan", ".home", ".invalid"} {
		if strings.HasSuffix(host, suffix) {
			return false
		}
	}
	return true
}

func renderHostedProxy(d hostedProxy) (string, error) {
	t, err := template.ParseFS(deploymentTemplates, "templates/hosted-nginx.tmpl")
	if err != nil {
		return "", err
	}
	var output bytes.Buffer
	if err := t.Execute(&output, d); err != nil {
		return "", err
	}
	return output.String(), nil
}
