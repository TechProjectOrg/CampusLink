-- ============================================================
-- Social Media Platform Database Schema
-- Complete Implementation
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Drop tables if they exist (in reverse order of dependencies)
DROP TABLE IF EXISTS PostTags;
DROP TABLE IF EXISTS Hashtags;
DROP TABLE IF EXISTS Comments;
DROP TABLE IF EXISTS Likes;
DROP TABLE IF EXISTS Follows;
DROP TABLE IF EXISTS Posts;
DROP TABLE IF EXISTS TeacherProfiles;
DROP TABLE IF EXISTS AlumniProfiles;
DROP TABLE IF EXISTS StudentProfiles;
DROP TABLE IF EXISTS Users;

-- ============================================================
-- 1. USERS TABLE
-- ============================================================
CREATE TABLE Users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash CHAR(64) NOT NULL,  -- VARCHAR(64) for hashed password storage
    bio VARCHAR(500),
    profile_picture_url VARCHAR(255),
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for Users table
CREATE INDEX idx_user_username ON Users(username);
CREATE INDEX idx_user_email ON Users(email);

-- ============================================================
-- 1a. STUDENT PROFILES TABLE
-- ============================================================
CREATE TABLE StudentProfiles (
    user_id UUID PRIMARY KEY,
    branch VARCHAR(100) NOT NULL,
    year INT NOT NULL,
    CONSTRAINT fk_student_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- ============================================================
-- 1b. ALUMNI PROFILES TABLE
-- ============================================================
CREATE TABLE AlumniProfiles (
    user_id UUID PRIMARY KEY,
    branch VARCHAR(100) NOT NULL,
    passing_year INT NOT NULL,
    CONSTRAINT fk_alumni_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- ============================================================
-- 1c. TEACHER PROFILES TABLE
-- ============================================================
CREATE TABLE TeacherProfiles (
    user_id UUID PRIMARY KEY,
    CONSTRAINT fk_teacher_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- ============================================================
-- 2. POSTS TABLE
-- ============================================================
CREATE TABLE Posts (
    post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    content_text TEXT,
    media_url VARCHAR(255),
    media_type VARCHAR(10),  -- 'image', 'video', etc.
    view_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- Indexes for Posts table
CREATE INDEX idx_post_user_id ON Posts(user_id, created_at DESC);
CREATE INDEX idx_post_created_at ON Posts(created_at DESC);

-- ============================================================
-- 3. FOLLOWS TABLE (Relationships)
-- ============================================================
CREATE TABLE Follows (
    follower_id UUID NOT NULL,
    followee_id UUID NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, followee_id),
    FOREIGN KEY (follower_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (followee_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CHECK (follower_id != followee_id)  -- Prevent self-following
);

-- Indexes for Follows table
CREATE INDEX idx_followee_id ON Follows(followee_id);
CREATE INDEX idx_follower_id ON Follows(follower_id);

-- ============================================================
-- 4. LIKES TABLE (Post Interactions)
-- ============================================================
CREATE TABLE Likes (
    user_id UUID NOT NULL,
    post_id UUID NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES Posts(post_id) ON DELETE CASCADE
);

-- Indexes for Likes table
CREATE INDEX idx_like_post_id ON Likes(post_id);

-- ============================================================
-- 5. COMMENTS TABLE (Post Interactions)
-- ============================================================
CREATE TABLE Comments (
    comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL,
    user_id UUID NOT NULL,
    parent_comment_id UUID,  -- For threaded comments (replying to another comment)
    content VARCHAR(500) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (post_id) REFERENCES Posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES Comments(comment_id) ON DELETE CASCADE
);

-- Indexes for Comments table
CREATE INDEX idx_comment_post_id ON Comments(post_id, created_at);
CREATE INDEX idx_comment_parent_id ON Comments(parent_comment_id);

-- ============================================================
-- 6. HASHTAGS TABLE
-- ============================================================
CREATE TABLE Hashtags (
    tag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for Hashtags table
CREATE INDEX idx_tag_name ON Hashtags(tag_name);

-- ============================================================
-- 7. POSTTAGS TABLE (Many-to-Many Bridge)
-- ============================================================
CREATE TABLE PostTags (
    post_id UUID NOT NULL,
    tag_id UUID NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES Posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES Hashtags(tag_id) ON DELETE CASCADE
);

-- Indexes for PostTags table
CREATE INDEX idx_posttag_tag_id ON PostTags(tag_id);

-- ============================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================

-- View for user feed (followed posts)
CREATE VIEW UserFeed AS
SELECT 
    p.post_id,
    p.user_id,
    u.username,
    u.profile_picture_url,
    p.content_text,
    p.media_url,
    p.media_type,
    p.view_count,
    p.created_at,
    (SELECT COUNT(*) FROM Likes l WHERE l.post_id = p.post_id) as like_count,
    (SELECT COUNT(*) FROM Comments c WHERE c.post_id = p.post_id) as comment_count
FROM Posts p
JOIN Users u ON p.user_id = u.user_id;

-- View for user follower/following counts
CREATE VIEW UserStats AS
SELECT 
    u.user_id,
    u.username,
    (SELECT COUNT(*) FROM Follows f WHERE f.follower_id = u.user_id) as following_count,
    (SELECT COUNT(*) FROM Follows f WHERE f.followee_id = u.user_id) as follower_count,
    (SELECT COUNT(*) FROM Posts p WHERE p.user_id = u.user_id) as post_count
FROM Users u;

-- ============================================================
-- FUNCTIONS FOR COMMON OPERATIONS
-- ============================================================

-- Function to get user's timeline (followed posts + own posts)
CREATE OR REPLACE FUNCTION get_user_timeline(p_user_id UUID, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE (
    post_id UUID,
    user_id UUID,
    username VARCHAR,
    profile_picture_url VARCHAR,
    content_text TEXT,
    media_url VARCHAR,
    media_type VARCHAR,
    view_count INT,
    created_at TIMESTAMP,
    like_count BIGINT,
    comment_count BIGINT,
    is_liked BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.post_id,
        p.user_id,
        u.username,
        u.profile_picture_url,
        p.content_text,
        p.media_url,
        p.media_type,
        p.view_count,
        p.created_at,
        (SELECT COUNT(*) FROM Likes l WHERE l.post_id = p.post_id) as like_count,
        (SELECT COUNT(*) FROM Comments c WHERE c.post_id = p.post_id) as comment_count,
        EXISTS(SELECT 1 FROM Likes l WHERE l.post_id = p.post_id AND l.user_id = p_user_id) as is_liked
    FROM Posts p
    JOIN Users u ON p.user_id = u.user_id
    WHERE p.user_id IN (
        SELECT followee_id FROM Follows WHERE follower_id = p_user_id
        UNION
        SELECT p_user_id
    )
    AND (u.is_public = TRUE OR p.user_id = p_user_id OR 
         EXISTS(SELECT 1 FROM Follows WHERE follower_id = p_user_id AND followee_id = p.user_id))
    ORDER BY p.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get posts by hashtag
CREATE OR REPLACE FUNCTION get_posts_by_hashtag(p_tag_name VARCHAR, p_limit INT DEFAULT 50)
RETURNS TABLE (
    post_id UUID,
    user_id UUID,
    username VARCHAR,
    content_text TEXT,
    created_at TIMESTAMP,
    like_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.post_id,
        p.user_id,
        u.username,
        p.content_text,
        p.created_at,
        (SELECT COUNT(*) FROM Likes l WHERE l.post_id = p.post_id) as like_count
    FROM Posts p
    JOIN Users u ON p.user_id = u.user_id
    JOIN PostTags pt ON p.post_id = pt.post_id
    JOIN Hashtags h ON pt.tag_id = h.tag_id
    WHERE h.tag_name = p_tag_name
    AND u.is_public = TRUE
    ORDER BY p.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Trigger to prevent excessive self-references
CREATE OR REPLACE FUNCTION prevent_self_interaction()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'Follows' THEN
        IF NEW.follower_id = NEW.followee_id THEN
            RAISE EXCEPTION 'Users cannot follow themselves';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_self_follow
    BEFORE INSERT OR UPDATE ON Follows
    FOR EACH ROW
    EXECUTE FUNCTION prevent_self_interaction();

-- ============================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================

-- Insert sample users
INSERT INTO Users (username, email, password_hash, bio, is_public) VALUES
('john_doe', 'john@example.com', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', 'Software developer and tech enthusiast', TRUE),
('jane_smith', 'jane@example.com', '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b', 'Digital artist and photographer', TRUE),
('alex_wilson', 'alex@example.com', 'd4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35', 'Music lover and content creator', FALSE),
('sarah_lee', 'sarah@example.com', '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce', 'Travel blogger exploring the world', TRUE);

-- Note: The hash values above are just examples. In production, use proper password hashing.
