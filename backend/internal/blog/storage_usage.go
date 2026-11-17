package blog

import "net/http"

func (a *App) storageUsageStatus(w http.ResponseWriter, r *http.Request) {
	storage, ok := a.Storage.(*S3Storage)
	if !ok {
		coded(503, "Storage usage is unavailable.", "STORAGE_UNAVAILABLE")
	}
	used, err := storage.Usage(r.Context())
	if err != nil {
		coded(503, "Could not measure storage usage. Check bucket listing permissions and try again.", "STORAGE_UNAVAILABLE")
	}
	result := Row{"usedBytes": used, "quotaBytes": nil, "remainingBytes": nil, "managed": storage.limit > 0}
	if storage.limit > 0 {
		result["quotaBytes"] = storage.limit
		result["remainingBytes"] = max(int64(0), storage.limit-used)
	}
	send(w, 200, result)
}
