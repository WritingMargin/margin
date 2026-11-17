package blog

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// The budget is per engine process. PostgreSQL notifications use at most one
// additional connection, shared by all active article streams.
func (d *Database) configurePool() error {
	if d.Kind != "postgres" {
		return nil
	}
	maximum := 10
	if value := os.Getenv("MARGIN_DB_MAX_OPEN_CONNS"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 {
			return fmt.Errorf("MARGIN_DB_MAX_OPEN_CONNS must be a positive integer")
		}
		maximum = parsed
	}
	d.SQL.SetMaxOpenConns(maximum)
	d.SQL.SetMaxIdleConns(min(2, maximum))
	d.SQL.SetConnMaxIdleTime(5 * time.Minute)
	d.SQL.SetConnMaxLifetime(30 * time.Minute)
	return nil
}
