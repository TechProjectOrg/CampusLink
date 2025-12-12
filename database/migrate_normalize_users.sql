-- Migration: Normalize Users into separate profile tables
-- This migration is additive and safe to run on an existing database.

BEGIN;

-- 1. Create studentprofiles table (if not exists)
CREATE TABLE IF NOT EXISTS studentprofiles (
    user_id UUID PRIMARY KEY,
    branch VARCHAR(100),
    year INT,
    CONSTRAINT fk_student_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 2. Create alumniprofiles table (if not exists)
CREATE TABLE IF NOT EXISTS alumniprofiles (
    user_id UUID PRIMARY KEY,
    branch VARCHAR(100),
    passing_year INT,
    CONSTRAINT fk_alumni_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 3. Create teacherprofiles table (if not exists)
CREATE TABLE IF NOT EXISTS teacherprofiles (
    user_id UUID PRIMARY KEY,
    CONSTRAINT fk_teacher_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Note: We are not moving any existing data because the current Users rows
-- do not have branch/year/passing year information. New signups will
-- populate these tables via the backend.

COMMIT;
