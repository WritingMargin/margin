package blog

import "testing"

func TestReadableNotebookKeepsCellsInOrderAndOutputsInert(t *testing.T) {
	cells := []Row{
		{"cell_type": "markdown", "source": []string{"**Measurements**"}},
		{"cell_type": "code", "source": "print(24)", "outputs": []Row{{"data": Row{"text/plain": "24", "text/html": "<script>unsafe()</script>"}}}},
	}
	html := readableNotebook(encode(Row{"nbformat": 4, "cells": cells}))
	containsHTML(t, html, "<strong>Measurements</strong>", "<pre>print(24)</pre>", "<pre>24</pre>")
	excludesHTML(t, html, "<script>", "unsafe()")
}
