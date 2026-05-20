-- Migration: 20260520120000_add_hidden_chat_visibility
-- Adds per-participant chat hiding so one user can remove a conversation from their inbox without affecting the other participant.

ALTER TABLE chat_participants
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP(6);
