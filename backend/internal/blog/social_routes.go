package blog

func (a *App) socialRoutes() {
	a.mux.HandleFunc("GET /reader/alerts", a.publicPageHandler(a.readerAlertsHTML))
	a.mux.HandleFunc("POST /api/public/posts/{id}/flags", a.createSectionFlag)
	a.mux.HandleFunc("GET /api/readers/flags", a.sectionFlags)
	a.mux.HandleFunc("PATCH /api/readers/flags/{id}", a.moderateSectionFlag)
	a.mux.HandleFunc("GET /api/posts/{id}/author-update", a.readAuthorUpdate)
	a.mux.HandleFunc("PUT /api/posts/{id}/author-update", a.saveAuthorUpdate)
	a.mux.HandleFunc("GET /api/public/reader-alerts", a.readerAlerts)
	a.mux.HandleFunc("PATCH /api/public/reader-alerts/{id}", a.markReaderAlert)
	a.mux.HandleFunc("GET /api/public/reader-alerts/settings", a.readerAlertSettings)
	a.mux.HandleFunc("PUT /api/public/reader-alerts/settings", a.saveReaderAlertSettings)
	a.mux.HandleFunc("GET /api/public/posts/{id}/sections", a.publicSectionActivity)
}
