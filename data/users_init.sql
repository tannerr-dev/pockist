-- Users table schema for authentication (SQLite compatible)

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modified DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger to automatically update date_modified on UPDATE
CREATE TRIGGER IF NOT EXISTS update_users_modified 
    AFTER UPDATE ON users
    FOR EACH ROW
BEGIN
    UPDATE users SET date_modified = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Create index for better performance on email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);