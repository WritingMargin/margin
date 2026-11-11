package cli

import (
	"embed"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

//go:embed skills
var skills embed.FS

var bundledSkills = []map[string]string{
	{"name": "margin-authoring", "description": "Write, revise and publish Margin articles with purposeful citations and rich content."},
	{"name": "engineering-writing", "description": "Write evidence-based engineering blogs, explainers, tutorials and narrative docs for any destination."},
}

func bundledSkill(name string) bool {
	for _, skill := range bundledSkills {
		if skill["name"] == name {
			return true
		}
	}
	return false
}

func showSkill(name string, jsonOutput bool, w io.Writer) error {
	root := "skills/" + name
	content, err := skills.ReadFile(root + "/SKILL.md")
	if err != nil {
		return err
	}
	references := map[string]string{}
	scripts := map[string]string{}
	var referenceText strings.Builder
	err = fs.WalkDir(skills, root, func(file string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		isReference := strings.HasPrefix(file, root+"/references/")
		isScript := strings.HasPrefix(file, root+"/scripts/")
		if entry.IsDir() || (!isReference && !isScript) {
			return nil
		}
		data, err := skills.ReadFile(file)
		if err != nil {
			return err
		}
		relative := strings.TrimPrefix(file, root+"/")
		if isReference {
			references[relative] = string(data)
			fmt.Fprintf(&referenceText, "\n\n--- %s ---\n%s", relative, data)
		} else {
			scripts[relative] = string(data)
			fmt.Fprintf(&referenceText, "\n\nBundled helper: %s (install the skill to run it; source is included in --json).", relative)
		}
		return nil
	})
	if err != nil {
		return err
	}
	if jsonOutput {
		return output(w, map[string]any{"name": name, "content": string(content), "references": references, "scripts": scripts})
	}
	_, err = fmt.Fprintf(w, "%s%s", content, referenceText.String())
	return err
}

func runSkills(args []string, flags map[string]string, w io.Writer) error {
	action := "list"
	if len(args) > 0 {
		action = args[0]
	}
	if err := validateSkillCommand(action, args, flags); err != nil {
		return err
	}
	switch action {
	case "list":
		return listSkills(flags["json"] == "true", w)
	case "show":
		return showSkill(args[1], flags["json"] == "true", w)
	default:
		return installSkill(args[1], flags, w)
	}
}

func validateSkillCommand(action string, args []string, flags map[string]string) error {
	if action != "list" && action != "show" && action != "install" {
		return errors.New("Use skills list, show, or install")
	}
	if action == "list" {
		if len(args) > 1 {
			return errors.New("Specify a bundled skill: margin-authoring or engineering-writing")
		}
	} else if len(args) != 2 || !bundledSkill(args[1]) {
		return errors.New("Specify a bundled skill: margin-authoring or engineering-writing")
	}
	return validateSkillFlags(action, flags)
}

func validateSkillFlags(action string, flags map[string]string) error {
	for key := range flags {
		if key != "json" && !(action == "install" && key == "dir") {
			return fmt.Errorf("--%s is not supported by skills %s", key, action)
		}
	}
	return nil
}

func listSkills(jsonOutput bool, w io.Writer) error {
	if jsonOutput {
		return output(w, bundledSkills)
	}
	for _, skill := range bundledSkills {
		if _, err := fmt.Fprintln(w, skill["name"]+"\t"+skill["description"]); err != nil {
			return err
		}
	}
	return nil
}

func skillDestination(name string, flags map[string]string) (string, error) {
	directory, specified := flags["dir"]
	if !specified {
		directory = filepath.Join(".agents", "skills")
	} else if strings.TrimSpace(directory) == "" {
		return "", errors.New("skills install --dir requires a non-empty directory")
	}
	parent, err := filepath.Abs(directory)
	if err != nil {
		return "", err
	}
	if err = os.MkdirAll(parent, 0755); err != nil { // #nosec G301 -- Installs public bundled skill documentation in the user-selected directory; contains no secrets.
		return "", err
	}
	return filepath.Join(parent, name), nil
}

func installSkill(name string, flags map[string]string, w io.Writer) error {
	destination, err := skillDestination(name, flags)
	if err != nil {
		return err
	}

	if err = os.Mkdir(destination, 0755); err != nil { // #nosec G301 -- Public bundled skills may be shared with local project collaborators; refuses an existing destination.
		if errors.Is(err, fs.ErrExist) {
			return fmt.Errorf("Skill already exists at %s. Review it before replacing it", destination)
		}
		return err
	}
	err = copySkillFiles("skills/"+name, destination)
	if err != nil {
		_ = os.RemoveAll(destination)
		return err
	}
	file := filepath.Join(destination, "SKILL.md")
	if flags["json"] == "true" {
		return output(w, map[string]string{"name": name, "path": file})
	}
	_, err = fmt.Fprintln(w, "Installed "+name+" at "+destination)
	return err
}

func copySkillFiles(root, destination string) error {
	return fs.WalkDir(skills, root, func(file string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative := strings.TrimPrefix(file, root)
		if relative == "" {
			return nil
		}
		target := filepath.Join(destination, filepath.FromSlash(strings.TrimPrefix(relative, "/")))
		if entry.IsDir() {
			return os.Mkdir(target, 0755) // #nosec G301 -- Directory names come from embedded skill assets and contain public documentation only.
		}
		data, err := skills.ReadFile(file)
		if err != nil {
			return err
		}
		f, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644) // #nosec G304 G302 -- Copies only embedded public skill files into the user-selected new skill directory with exclusive creation; readable by project collaborators.
		if err != nil {
			return err
		}
		_, err = f.Write(data)
		closeErr := f.Close()
		if err != nil {
			return err
		}
		return closeErr
	})
}
