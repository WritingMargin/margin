package blog

import (
	"encoding/json"
	cli "margin-cli"
	"net/http"
)

func (a *App) authoringRoutes() {
	a.mux.HandleFunc("GET /authoring.md", func(w http.ResponseWriter, r *http.Request) {
		data, err := cli.AuthoringGuide()
		must(err)
		serveDocs(w, r, "authoring.md", "text/markdown; charset=utf-8", data)
	})
	a.mux.HandleFunc("GET /authoring-blocks.json", func(w http.ResponseWriter, r *http.Request) {
		data, err := cli.AuthoringBlocks()
		must(err)
		serveDocs(w, r, "authoring-blocks.json", "application/json", data)
	})
	a.mux.HandleFunc("GET /api/public/authoring", a.authoringGuide)
}

// @Summary Learn Margin's supported content blocks
// @ID getAuthoringGuide
// @Description Read this before generating or editing rich content. Returns this engine's Markdown authoring guide, supported fence languages and tags, runnable block examples, JSON Schemas generated from renderer validators, and additional cross-field/URL rules that schemas cannot express. Covers charts, polls, Mermaid, 3D scenes, illustrations, tabs, layouts, media (including YouTube/Vimeo/Mux and native uploads), citations and revision-aware saving. Static public documentation: no authentication required, no publication or private post data returned. formatVersion versions the reference response format. A valid schema or successful post save does not establish renderability; follow the rules and preview the result. Ordinary code fences display source, never execute it.
// @Tags Authoring
// @Produce json
// @Success 200 {object} APIAuthoringGuide
// @Router /api/public/authoring [get]
func (a *App) authoringGuide(w http.ResponseWriter, r *http.Request) {
	data, err := cli.AuthoringBlocks()
	must(err)
	var catalog Row
	must(json.Unmarshal(data, &catalog))
	guide, err := cli.AuthoringGuide()
	must(err)
	catalog["markdown"] = string(guide)
	catalog["guideUrl"] = sitePath("/authoring.md")
	catalog["catalogUrl"] = sitePath("/authoring-blocks.json")
	send(w, 200, catalog)
}

type APIAuthoringGuide struct {
	FormatVersion int                 `json:"formatVersion" binding:"required"`
	Markdown      string              `json:"markdown" binding:"required"`
	GuideURL      string              `json:"guideUrl" binding:"required"`
	CatalogURL    string              `json:"catalogUrl" binding:"required"`
	CodeLanguages []string            `json:"codeLanguages" binding:"required"`
	Tags          []string            `json:"tags" binding:"required"`
	Blocks        []APIAuthoringBlock `json:"blocks" binding:"required"`
}
type APIAuthoringBlock struct {
	Language      string `json:"language" binding:"required" enums:"chart,mermaid,scene,illustration"`
	Title         string `json:"title" binding:"required"`
	Description   string `json:"description" binding:"required"`
	MaxCharacters int    `json:"maxCharacters" binding:"required"`
	// Structural JSON Schema; apply rules too. Mermaid has no JSON schema.
	Schema map[string]interface{} `json:"schema,omitempty"`
	Rules  []string               `json:"rules" binding:"required"`
	// Raw fence body. Wrap with triple backticks and language when inserting.
	Example string `json:"example" binding:"required"`
}
