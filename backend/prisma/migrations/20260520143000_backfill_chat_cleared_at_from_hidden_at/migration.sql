-- Backfill legacy chat-level visibility markers so cleared_at becomes the
-- canonical per-participant cutoff for "Delete Chat for Me".

ALTER TABLE chat_participants
  ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP(6);

UPDATE chat_participants
SET cleared_at = hidden_at
WHERE hidden_at IS NOT NULL
  AND cleared_at IS NULL;
