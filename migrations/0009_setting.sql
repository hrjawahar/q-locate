-- Where a book or film is set (for destination pages).
ALTER TABLE books ADD COLUMN setting TEXT;
ALTER TABLE movies ADD COLUMN setting TEXT;
