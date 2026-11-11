package blog

// OpenAPIContract exports the same field allowlists and role checks used by the
// request handlers. The documentation generator calls this without opening a DB.
func OpenAPIContract(patterns []string) Row {
	roles := map[string][]string{}
	for _, pattern := range patterns {
		allowed := []string{}
		for _, role := range []string{"reader", "writer", "publisher", "owner"} {
			if tokenRouteAllowed(role, pattern) {
				allowed = append(allowed, role)
			}
		}
		roles[pattern] = allowed
	}
	return Row{"fields": postResponseFields, "roles": roles}
}
