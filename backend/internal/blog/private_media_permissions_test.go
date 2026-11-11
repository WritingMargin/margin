package blog

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func privateMediaFixtures(t *testing.T, a *App) map[string]string {
	t.Helper()
	ctx := context.Background()
	cover := a.storeUploadedImage(ctx, []byte("private image"), "image/png", "uploaded_covers", "assets/covers/", "/api/public/covers/")
	logo := a.storeUploadedImage(ctx, []byte("private logo"), "image/png", "blog_logos", "logos/", "/api/public/logos/")
	audio := a.storeUploadedAudio(ctx, audioFixture(), "audio/mpeg", "Private recording")
	video := a.storeUploadedVideo(ctx, []byte("private video"), "video/mp4", "Private video")
	docID, generatedID := uuid(), uuid()
	must(a.Storage.Put(ctx, "private-source", []byte("private PDF")))
	a.DB.Must(ctx, "INSERT INTO source_documents(id,object_key,title) VALUES($1,'private-source','Private PDF')", docID)
	post := responseRow(t, tokenRequest(a, "owner", "POST", "/api/posts", draftInput("private-assets")), 201)
	must(a.Storage.Put(ctx, "private-generated", []byte("private generated image")))
	a.DB.Must(ctx, "INSERT INTO generated_assets(id,post_id,object_key,prompt,style,size,source_hash) VALUES($1,$2,'private-generated','','','','')", generatedID, post["id"])
	return map[string]string{
		cover: "content:read", logo: "settings:manage", audio.str("url"): "content:read",
		video.str("url"): "content:read", "/api/public/documents/" + docID: "content:read",
		"/sources/" + docID: "content:read", "/api/assets/" + generatedID + ".png": "content:read",
	}
}

func TestPrivateMediaRespectsSelectedOAuthPermissions(t *testing.T) {
	a := oauthFixture(t)
	assets := privateMediaFixtures(t, a)
	for _, scope := range []string{"content:read", "content:draft", "content:publish", "media:write", "settings:manage", "administration:manage"} {
		t.Run(scope, func(t *testing.T) {
			_, tokens := oauthSelectedTokens(t, a, scope, []string{scope}, "https://blog.test/api")
			for path, permission := range assets {
				status := 404
				if scope == permission {
					status = 200
				}
				t.Run(path, func(t *testing.T) {
					expectStatus(t, tokenRequest(a, tokens.str("access_token"), "GET", path, nil), status)
					expectStatus(t, tokenRequest(a, tokens.str("access_token"), "HEAD", path, nil), status)
				})
			}
		})
	}
	for path := range assets {
		expectStatus(t, tokenRequest(a, "owner", "GET", path, nil), 200)
		expectStatus(t, oauthHTTPRequest(a, "GET", path, nil, true), 200)
		expectStatus(t, request(t, a, "GET", path, nil, false), 404)
	}
}

func TestPublicAudioStillAccessibleWithUnrelatedScope(t *testing.T) {
	a := oauthFixture(t)
	asset := a.storeUploadedAudio(context.Background(), audioFixture(), "audio/mpeg", "Public recording")
	input := draftInput("public-audio")
	input["status"], input["cover"] = "published", asset["url"]
	responseRow(t, tokenRequest(a, "owner", "POST", "/api/posts", input), 201)
	_, tokens := oauthSelectedTokens(t, a, "settings:manage", []string{"settings:manage"}, "https://blog.test/api")
	for _, key := range []string{"", tokens.str("access_token")} {
		r := httptest.NewRequest(http.MethodGet, "https://blog.test"+asset.str("url"), nil)
		if key != "" {
			r.Header.Set("Authorization", "Bearer "+key)
		}
		r.Header.Set("Range", "bytes=0-2")
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		expectStatus(t, w, 206)
	}
}

func TestOAuthAssetRoutesDoNotInheritAdministrationAccess(t *testing.T) {
	a := oauthFixture(t)
	_, tokens := oauthSelectedTokens(t, a, "administration:manage", []string{"administration:manage"}, "https://blog.test/api")
	expectStatus(t, tokenRequest(a, tokens.str("access_token"), "POST", "/api/posts/"+uuid()+"/writing-notes", Row{}), 403)
	if !oauthRouteAllowed([]string{"content:draft"}, "POST /api/posts/{id}/writing-notes") {
		t.Fatal("draft permission must permit writing notes")
	}
	for pattern, permission := range assetOAuthPermissions {
		method, path, _ := strings.Cut(pattern, " ")
		expectStatus(t, tokenRequest(a, tokens.str("access_token"), method, path, Row{}), 403)
		if !oauthRouteAllowed([]string{permission}, pattern) {
			t.Fatalf("approved permission %s denied for %s", permission, pattern)
		}
	}
}

func TestLogoPublicationRecheckedAfterStorageRead(t *testing.T) {
	a, storage := coreFixture(t)
	ctx := context.Background()
	path := a.storeUploadedImage(ctx, []byte("withdrawn logo"), "image/png", "blog_logos", "logos/", "/api/public/logos/")
	theme := a.settings(ctx)
	theme["logo"] = path
	a.DB.Must(ctx, "INSERT INTO settings(id,theme) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET theme=EXCLUDED.theme", encode(theme))
	expectStatus(t, request(t, a, "GET", path, nil, false), 200)
	storage.onGet = func(key string) {
		if strings.HasPrefix(key, "logos/") {
			theme["logo"] = ""
			a.DB.Must(ctx, "UPDATE settings SET theme=$1 WHERE id=1", encode(theme))
		}
	}
	expectStatus(t, request(t, a, "GET", path, nil, false), 404)
}
