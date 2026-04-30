package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

// InitDatabase initializes the SQLite database and creates tables
func InitDatabase() (*sql.DB, error) {
	// Get database path from environment or use default
	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		// Check if running in Docker (data directory exists or is writable)
		dockerPath := "/app/data/pockist.db"
		if _, err := os.Stat("/app/data"); err == nil {
			// Docker path exists, use it
			dbPath = dockerPath
		} else {
			// Local development - use current directory
			dbPath = "./data/pockist.db"
		}
	}

	// Ensure directory exists
	dataDir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory %s: %w", dataDir, err)
	}

	log.Printf("[Database] Opening database at: %s", dbPath)

	// Open database
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Create tables
	if err := createTables(db); err != nil {
		return nil, fmt.Errorf("failed to create tables: %w", err)
	}

	log.Printf("[Database] Initialized successfully")
	return db, nil
}

// createTables creates all required tables
func createTables(db *sql.DB) error {
	// Shared items table
	sharedItemsTable := `
	CREATE TABLE IF NOT EXISTS shared_items (
		id TEXT PRIMARY KEY,
		type TEXT NOT NULL,
		title TEXT NOT NULL,
		data TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		expires_at DATETIME NOT NULL,
		deletion_token TEXT NOT NULL,
		view_count INTEGER DEFAULT 0
	);`

	if _, err := db.Exec(sharedItemsTable); err != nil {
		return fmt.Errorf("failed to create shared_items table: %w", err)
	}

	// Create index for expiration queries
	indexSQL := `CREATE INDEX IF NOT EXISTS idx_shared_items_expires ON shared_items(expires_at);`
	if _, err := db.Exec(indexSQL); err != nil {
		return fmt.Errorf("failed to create expiration index: %w", err)
	}

	log.Printf("[Database] Tables created successfully")
	return nil
}
