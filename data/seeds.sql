-- notes table schema (SQLite compatible)

CREATE TABLE IF NOT EXISTS notes(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
    note TEXT NOT NULL
);

-- Create trigger to automatically update date_modified on UPDATE
CREATE TRIGGER IF NOT EXISTS update_notes_modified 
    AFTER UPDATE ON notes
    FOR EACH ROW
BEGIN
    UPDATE notes SET date_modified = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Create index for better performance on date queries
CREATE INDEX IF NOT EXISTS idx_notes_date_created ON notes(date_created);

-- Optional: Insert sample data for testing
-- INSERT OR IGNORE INTO notes (note) VALUES 
--     ('Welcome to Pockist!'),
--     ('This is your first note');

