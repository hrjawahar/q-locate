-- Bibliotherapy / Cinematherapy: moods a book or film suits, and a line on why it may help.
ALTER TABLE books ADD COLUMN moods TEXT;
ALTER TABLE books ADD COLUMN mood_note TEXT;
ALTER TABLE movies ADD COLUMN moods TEXT;
ALTER TABLE movies ADD COLUMN mood_note TEXT;
