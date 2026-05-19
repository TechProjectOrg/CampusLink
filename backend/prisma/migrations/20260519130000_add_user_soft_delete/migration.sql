ALTER TABLE users
  ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN deleted_at TIMESTAMP(6),
  ADD COLUMN delete_reason VARCHAR(100);

CREATE INDEX idx_users_is_deleted ON users(is_deleted);
