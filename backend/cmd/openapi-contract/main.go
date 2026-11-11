// Command openapi-contract exposes runtime field and permission rules to the docs generator.
package main

import (
	"encoding/json"
	"log"
	"margin/backend/internal/blog"
	"os"
)

func main() {
	var patterns []string
	if err := json.NewDecoder(os.Stdin).Decode(&patterns); err != nil {
		log.Fatal(err)
	}
	if err := json.NewEncoder(os.Stdout).Encode(blog.OpenAPIContract(patterns)); err != nil {
		log.Fatal(err)
	}
}
