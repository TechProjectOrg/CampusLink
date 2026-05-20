-- Migration: 20260520125500_add_message_hidden_state
-- Adds per-user message hiding so a sender can remove a message only for themselves without affecting the other participant.

CREATE TABLE IF NOT EXISTS message_hidden_for_users (
  message_hidden_for_user_id UUID NOT NULL DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT message_hidden_for_users_pkey PRIMARY KEY (message_hidden_for_user_id),
  CONSTRAINT chk_message_hidden_for_users_not_self CHECK (message_id IS NOT NULL AND user_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_hidden_for_users_message_id_user_id
  ON message_hidden_for_users (message_id, user_id);
CREATE INDEX IF NOT EXISTS idx_message_hidden_for_users_message_id
  ON message_hidden_for_users (message_id);
CREATE INDEX IF NOT EXISTS idx_message_hidden_for_users_user_id
  ON message_hidden_for_users (user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'message_hidden_for_users_message_id_fkey'
  ) THEN
    ALTER TABLE message_hidden_for_users
      ADD CONSTRAINT message_hidden_for_users_message_id_fkey
      FOREIGN KEY (message_id) REFERENCES messages (message_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'message_hidden_for_users_user_id_fkey'
  ) THEN
    ALTER TABLE message_hidden_for_users
      ADD CONSTRAINT message_hidden_for_users_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users (user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
