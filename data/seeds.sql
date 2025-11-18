-- notes table

CREATE TABLE IF NOT EXISTS notes(
    id SERIAL PRIMARY KEY, 
    date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
    note TEXT NOT NULL
);



-- alter
-- Add date_created column
ALTER TABLE notes ADD COLUMN date_created DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Add date_modified column
ALTER TABLE notes ADD COLUMN date_modified DATETIME DEFAULT CURRENT_TIMESTAMP;

