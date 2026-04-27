-- Allow multiple clubs to share the same display name.
ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_name_key;
