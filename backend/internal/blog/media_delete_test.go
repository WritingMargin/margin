package blog

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDeleteLibraryImage(t *testing.T) {
	a, storage := coreFixture(t)
	ctx := context.Background()
	image := a.storeUploadedImage(ctx, []byte("image"), "image/png", "uploaded_covers", "assets/covers/", "/api/public/covers/")
	id := strings.TrimPrefix(image, "/api/public/covers/")
	expectStatus(t, request(t, a, "DELETE", "/api/media/images/"+id, nil, false), 401)
	expectStatus(t, request(t, a, "DELETE", "/api/media/images/"+id, nil, true), 200)
	if _, exists := storage.objects["assets/covers/"+id]; exists {
		t.Fatal("image bytes were not removed")
	}
	if first(a.DB.Must(ctx, "SELECT id FROM uploaded_covers WHERE id=$1", id)) != nil {
		t.Fatal("image row was not removed")
	}
	expectStatus(t, request(t, a, "DELETE", "/api/media/images/"+id, nil, true), 404)
	expectStatus(t, request(t, a, "DELETE", "/api/media/images/not-an-image", nil, true), 404)
}

func TestDeleteLibraryImageRefusesReferencedCover(t *testing.T) {
	a, storage := coreFixture(t)
	ctx := context.Background()
	image := a.storeUploadedImage(ctx, []byte("image"), "image/png", "uploaded_covers", "assets/covers/", "/api/public/covers/")
	id := strings.TrimPrefix(image, "/api/public/covers/")
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Cover", "slug": "cover", "content": "Body", "cover": image}, true), 201)
	if response := request(t, a, "DELETE", "/api/media/images/"+id, nil, true); response.Code != 409 {
		t.Fatalf("status %d, want 409: %s", response.Code, response.Body.String())
	}
	if _, exists := storage.objects["assets/covers/"+id]; !exists {
		t.Fatal("referenced image was removed")
	}
	if first(a.DB.Must(ctx, "SELECT id FROM uploaded_covers WHERE id=$1", id)) == nil {
		t.Fatal("referenced image row was removed")
	}
	responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id"), Row{"revision": post["revision"], "cover": ""}, true), 200)
	expectStatus(t, request(t, a, "DELETE", "/api/media/images/"+id, nil, true), 200)
}

func TestDeleteGeneratedLibraryImage(t *testing.T) {
	a, storage := coreFixture(t)
	ctx := context.Background()
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Generated", "slug": "generated", "content": "Body"}, true), 201)
	id, key := storeTestGeneratedImage(t, a, storage, post.str("id"))
	expectStatus(t, request(t, a, "DELETE", "/api/media/images/"+id, nil, true), 200)
	if _, exists := storage.objects[key]; exists {
		t.Fatal("generated image bytes were not removed")
	}
	if first(a.DB.Must(ctx, "SELECT id FROM generated_assets WHERE id=$1", id)) != nil {
		t.Fatal("generated image row was not removed")
	}
}

func TestDeleteGeneratedLibraryImageRefusesDraftReference(t *testing.T) {
	a, storage := coreFixture(t)
	ctx := context.Background()
	id := uuid()
	address := "/api/assets/" + id + ".png"
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Generated", "slug": "generated", "content": "![Generated](" + address + ")"}, true), 201)
	key := "assets/" + id + ".png"
	must(storage.Put(ctx, key, []byte("png")))
	a.DB.Must(ctx, "INSERT INTO generated_assets(id,post_id,object_key,prompt,style,size,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7)", id, post["id"], key, "A prompt", "editorial", "1024x1024", "hash")
	if response := request(t, a, "DELETE", "/api/media/images/"+id, nil, true); response.Code != 409 {
		t.Fatalf("status %d, want 409: %s", response.Code, response.Body.String())
	}
	if _, exists := storage.objects[key]; !exists {
		t.Fatal("referenced generated image was removed")
	}
}

func storeTestGeneratedImage(t *testing.T, a *App, storage *testStorage, postID string) (string, string) {
	t.Helper()
	id := uuid()
	key := "assets/" + id + ".png"
	must(storage.Put(context.Background(), key, []byte("png")))
	a.DB.Must(context.Background(), "INSERT INTO generated_assets(id,post_id,object_key,prompt,style,size,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7)", id, postID, key, "A prompt", "editorial", "1024x1024", "hash")
	return id, key
}

func TestDeleteLibraryImageRefusesArticleBodies(t *testing.T) {
	for _, kind := range []string{"uploaded", "generated"} {
		for _, status := range []string{"draft", "published", "archived"} {
			t.Run(kind+"/"+status, func(t *testing.T) {
				a, storage := coreFixture(t)
				ctx := context.Background()
				address := a.storeUploadedImage(ctx, []byte("image"), "image/png", "uploaded_covers", "assets/covers/", "/api/public/covers/")
				id := strings.TrimPrefix(address, "/api/public/covers/")
				if kind == "generated" {
					origin := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Original", "slug": "original", "content": "No image"}, true), 201)
					id, _ = storeTestGeneratedImage(t, a, storage, origin.str("id"))
					address = "/api/assets/" + id + ".png"
				}
				responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Reused image", "slug": "reused", "status": status, "content": "![Reused](" + address + ")"}, true), 201)
				response := responseRow(t, request(t, a, "DELETE", "/api/media/images/"+id, nil, true), 409)
				if response.str("code") != "MEDIA_IN_USE" {
					t.Fatalf("unexpected error: %v", response)
				}
			})
		}
	}
}

func TestDeleteLibraryImageRefusesStagedDraftBody(t *testing.T) {
	a, _ := coreFixture(t)
	ctx := context.Background()
	address := a.storeUploadedImage(ctx, []byte("image"), "image/png", "uploaded_covers", "assets/covers/", "/api/public/covers/")
	id := strings.TrimPrefix(address, "/api/public/covers/")
	post := responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Live", "slug": "live", "status": "published", "content": "No image"}, true), 201)
	responseRow(t, request(t, a, "PUT", "/api/posts/"+post.str("id")+"/draft", Row{"revision": post["revision"], "content": "![Draft only](" + address + ")"}, true), 200)
	expectStatus(t, request(t, a, "DELETE", "/api/media/images/"+id, nil, true), 409)
}

type imageFailureStorage struct {
	Storage
	readErr      error
	removeErr    error
	removeCalled bool
	cancelled    bool
}

func (s *imageFailureStorage) Get(ctx context.Context, key string) ([]byte, error) {
	if s.readErr != nil {
		return nil, s.readErr
	}
	return s.Storage.Get(ctx, key)
}
func (s *imageFailureStorage) Remove(ctx context.Context, key string) error {
	s.removeCalled = true
	s.cancelled = ctx.Err() != nil
	if s.removeErr != nil {
		return s.removeErr
	}
	return s.Storage.Remove(ctx, key)
}

func TestDeleteLibraryImageStorageFailuresPreserveRow(t *testing.T) {
	for _, failure := range []string{"read", "remove"} {
		t.Run(failure, func(t *testing.T) {
			a, storage := coreFixture(t)
			ctx := context.Background()
			address := a.storeUploadedImage(ctx, []byte("image"), "image/png", "uploaded_covers", "assets/covers/", "/api/public/covers/")
			id := strings.TrimPrefix(address, "/api/public/covers/")
			responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Private", "slug": "private", "content": "Unrelated body"}, true), 201)
			broken := &imageFailureStorage{Storage: storage}
			if failure == "read" {
				broken.readErr = errors.New("read unavailable")
			} else {
				broken.removeErr = errors.New("delete unavailable")
			}
			a.Storage = broken
			expectStatus(t, request(t, a, "DELETE", "/api/media/images/"+id, nil, true), 503)
			if failure == "read" && broken.removeCalled {
				t.Fatal("attempted deletion after failed reference scan")
			}
			if first(a.DB.Must(ctx, "SELECT id FROM uploaded_covers WHERE id=$1", id)) == nil {
				t.Fatal("failure lost library row")
			}
			if _, exists := storage.objects["assets/covers/"+id]; !exists {
				t.Fatal("failure lost image bytes")
			}
			a.Storage = storage
			expectStatus(t, request(t, a, "DELETE", "/api/media/images/"+id, nil, true), 200)
		})
	}
}

func TestDeleteLibraryImageCancellationStopsRemoval(t *testing.T) {
	a, storage := coreFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	address := a.storeUploadedImage(ctx, []byte("image"), "image/png", "uploaded_covers", "assets/covers/", "/api/public/covers/")
	id := strings.TrimPrefix(address, "/api/public/covers/")
	responseRow(t, request(t, a, "POST", "/api/posts", Row{"title": "Check", "slug": "check", "content": "Unrelated"}, true), 201)
	storage.onGet = func(string) { cancel() }
	tracked := &imageFailureStorage{Storage: storage}
	a.Storage = tracked
	req := httptest.NewRequest("DELETE", "http://blog.test/api/media/images/"+id, nil).WithContext(ctx)
	req.Header.Set("Authorization", "Bearer owner")
	response := httptest.NewRecorder()
	a.ServeHTTP(response, req)
	if response.Code < 400 {
		t.Fatalf("cancelled deletion returned %d", response.Code)
	}
	if tracked.removeCalled {
		t.Fatal("cancelled request attempted removal")
	}
	if first(a.DB.Must(context.Background(), "SELECT id FROM uploaded_covers WHERE id=$1", id)) == nil {
		t.Fatal("cancelled request lost library row")
	}
}

func TestDeleteLibraryImageHonorsMediaRoles(t *testing.T) {
	for _, role := range []string{"reader", "writer", "publisher"} {
		t.Run(role, func(t *testing.T) {
			a, _ := coreFixture(t)
			address := a.storeUploadedImage(context.Background(), []byte("image"), "image/png", "uploaded_covers", "assets/covers/", "/api/public/covers/")
			id := strings.TrimPrefix(address, "/api/public/covers/")
			status := 200
			if role == "reader" {
				status = 403
			}
			expectStatus(t, tokenRequest(a, roleToken(t, a, role), "DELETE", "/api/media/images/"+id, nil), status)
		})
	}
}
