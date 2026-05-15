ALTER TABLE users
ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);

UPDATE users
SET display_name = username
WHERE display_name IS NULL;

ALTER TABLE users
ALTER COLUMN display_name SET NOT NULL;
