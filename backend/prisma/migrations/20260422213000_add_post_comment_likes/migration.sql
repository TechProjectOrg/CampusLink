CREATE TABLE IF NOT EXISTS "post_comment_likes" (
  "user_id" UUID NOT NULL,
  "comment_id" UUID NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_comment_likes_pkey" PRIMARY KEY ("user_id", "comment_id"),
  CONSTRAINT "post_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "post_comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "post_comments"("comment_id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_post_comment_likes_comment_id"
  ON "post_comment_likes" ("comment_id");
