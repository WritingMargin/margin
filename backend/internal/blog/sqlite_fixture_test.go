package blog

import (
	"context"
	"database/sql"
	"sync"
	"testing"
)

// Initialize the current schema once. Each test gets a private in-memory
// copy with the same indexes, constraints, and defaults.
var emptySQLiteSnapshot = sync.OnceValues(func() ([]byte, error) {
	db, err := OpenDatabase("", ":memory:")
	if err != nil {
		return nil, err
	}
	defer db.SQL.Close()

	var snapshot []byte
	err = withSQLiteTestConn(db.SQL, func(driver any) error {
		data, err := driver.(interface{ Serialize() ([]byte, error) }).Serialize()
		snapshot = data
		return err
	})
	return snapshot, err
})

func withSQLiteTestConn(pool *sql.DB, f func(any) error) error {
	conn, err := pool.Conn(context.Background())
	if err != nil {
		return err
	}
	defer conn.Close()
	return conn.Raw(f)
}

func fixtureDatabase(t *testing.T) *Database {
	t.Helper()
	snapshot, err := emptySQLiteSnapshot()
	if err != nil {
		t.Fatal(err)
	}
	pool, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pool.Close() })

	db := &Database{SQL: pool, Kind: "sqlite", dsn: ":memory:"}
	if err := db.configureSQLite(); err != nil {
		t.Fatal(err)
	}
	if err := withSQLiteTestConn(pool, func(driver any) error {
		return driver.(interface{ Deserialize([]byte) error }).Deserialize(snapshot)
	}); err != nil {
		t.Fatal(err)
	}
	return db
}
