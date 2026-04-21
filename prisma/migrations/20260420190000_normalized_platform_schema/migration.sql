BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP VIEW IF EXISTS userfeed CASCADE;
DROP VIEW IF EXISTS userstats CASCADE;
DROP VIEW IF EXISTS "UserFeed" CASCADE;
DROP VIEW IF EXISTS "UserStats" CASCADE;

DROP FUNCTION IF EXISTS get_user_timeline(UUID, INT, INT) CASCADE;
DROP FUNCTION IF EXISTS get_posts_by_hashtag(VARCHAR, INT) CASCADE;
DROP FUNCTION IF EXISTS prevent_self_interaction() CASCADE;

DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS message_attachments CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS chat_participants CASCADE;
DROP TABLE IF EXISTS chats CASCADE;
DROP TABLE IF EXISTS post_hashtags CASCADE;
DROP TABLE IF EXISTS hashtags CASCADE;
DROP TABLE IF EXISTS post_saves CASCADE;
DROP TABLE IF EXISTS post_comments CASCADE;
DROP TABLE IF EXISTS post_likes CASCADE;
DROP TABLE IF EXISTS post_media CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS club_memberships CASCADE;
DROP TABLE IF EXISTS clubs CASCADE;
DROP TABLE IF EXISTS follows CASCADE;
DROP TABLE IF EXISTS follow_requests CASCADE;
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS user_societies CASCADE;
DROP TABLE IF EXISTS user_experiences CASCADE;
DROP TABLE IF EXISTS project_tags CASCADE;
DROP TABLE IF EXISTS user_projects CASCADE;
DROP TABLE IF EXISTS user_certifications CASCADE;
DROP TABLE IF EXISTS user_skills CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS alumni_profiles CASCADE;
DROP TABLE IF EXISTS student_profiles CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS likes CASCADE;
DROP TABLE IF EXISTS posttags CASCADE;
DROP TABLE IF EXISTS projecttags CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS certifications CASCADE;
DROP TABLE IF EXISTS skills CASCADE;
DROP TABLE IF EXISTS teacherprofiles CASCADE;
DROP TABLE IF EXISTS alumniprofiles CASCADE;
DROP TABLE IF EXISTS studentprofiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS "Student" CASCADE;

DROP TYPE IF EXISTS "MessageType" CASCADE;
DROP TYPE IF EXISTS "ChatParticipantRole" CASCADE;
DROP TYPE IF EXISTS "ChatType" CASCADE;
DROP TYPE IF EXISTS "ClubMembershipStatus" CASCADE;
DROP TYPE IF EXISTS "ClubMembershipRole" CASCADE;
DROP TYPE IF EXISTS "PostVisibility" CASCADE;
DROP TYPE IF EXISTS "OpportunityType" CASCADE;
DROP TYPE IF EXISTS "PostType" CASCADE;
DROP TYPE IF EXISTS "FollowRequestStatus" CASCADE;
DROP TYPE IF EXISTS "UserType" CASCADE;

CREATE TYPE "UserType" AS ENUM ('student', 'alumni');
CREATE TYPE "FollowRequestStatus" AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');
CREATE TYPE "PostType" AS ENUM ('general', 'opportunity', 'event', 'club_activity');
CREATE TYPE "OpportunityType" AS ENUM ('internship', 'hackathon', 'event', 'contest', 'club');
CREATE TYPE "PostVisibility" AS ENUM ('public', 'followers', 'club_members');
CREATE TYPE "ClubMembershipRole" AS ENUM ('owner', 'admin', 'member');
CREATE TYPE "ClubMembershipStatus" AS ENUM ('active', 'pending', 'removed', 'left');
CREATE TYPE "ChatType" AS ENUM ('direct', 'group');
CREATE TYPE "ChatParticipantRole" AS ENUM ('owner', 'admin', 'member');
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'file', 'system');

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    user_type "UserType" NOT NULL,
    bio VARCHAR(500),
    headline VARCHAR(255),
    profile_photo_url TEXT,
    cover_photo_url TEXT,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen_at TIMESTAMP(6),
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_user_type ON users(user_type);

CREATE TABLE student_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    branch VARCHAR(100) NOT NULL,
    year INT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE TABLE alumni_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    branch VARCHAR(100) NOT NULL,
    passing_year INT NOT NULL,
    current_status VARCHAR(255),
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    follow_request_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    message_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    opportunity_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    club_update_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    weekly_digest_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    show_email BOOLEAN NOT NULL DEFAULT TRUE,
    show_projects BOOLEAN NOT NULL DEFAULT TRUE,
    allow_messages BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE TABLE user_skills (
    user_skill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_skills_user_id_name UNIQUE (user_id, name)
);

CREATE INDEX idx_user_skills_user_id ON user_skills(user_id);

CREATE TABLE user_certifications (
    certification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    issuer VARCHAR(255),
    description TEXT,
    credential_url TEXT,
    image_url TEXT,
    issued_at TIMESTAMP(6),
    expires_at TIMESTAMP(6),
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_certifications_user_id ON user_certifications(user_id);

CREATE TABLE user_projects (
    project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    source_url TEXT,
    demo_url TEXT,
    image_url TEXT,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_projects_user_id ON user_projects(user_id);

CREATE TABLE project_tags (
    project_id UUID NOT NULL REFERENCES user_projects(project_id) ON DELETE CASCADE,
    tag_name VARCHAR(100) NOT NULL,
    PRIMARY KEY (project_id, tag_name)
);

CREATE INDEX idx_project_tags_tag_name ON project_tags(tag_name);

CREATE TABLE user_experiences (
    experience_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role_title VARCHAR(255) NOT NULL,
    organization VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMP(6) NOT NULL,
    end_date TIMESTAMP(6),
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_experiences_user_id ON user_experiences(user_id);

CREATE TABLE user_societies (
    user_society_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    society_name VARCHAR(255) NOT NULL,
    role_name VARCHAR(255) NOT NULL,
    start_date TIMESTAMP(6),
    end_date TIMESTAMP(6),
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_societies_user_id ON user_societies(user_id);

CREATE TABLE user_achievements (
    achievement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    achievement_year INT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);

CREATE TABLE follow_requests (
    follow_request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    status "FollowRequestStatus" NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMP(6),
    cancelled_at TIMESTAMP(6),
    CONSTRAINT chk_follow_requests_not_self CHECK (requester_user_id <> target_user_id)
);

CREATE INDEX idx_follow_requests_requester_user_id ON follow_requests(requester_user_id);
CREATE INDEX idx_follow_requests_target_user_id ON follow_requests(target_user_id);
CREATE INDEX idx_follow_requests_status ON follow_requests(status);
CREATE UNIQUE INDEX uq_follow_requests_pending_pair
    ON follow_requests(requester_user_id, target_user_id)
    WHERE status = 'pending';

CREATE TABLE follows (
    follower_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    followed_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_user_id, followed_user_id),
    CONSTRAINT chk_follows_not_self CHECK (follower_user_id <> followed_user_id)
);

CREATE INDEX idx_follows_followed_user_id ON follows(followed_user_id);
CREATE INDEX idx_follows_follower_user_id ON follows(follower_user_id);

CREATE TABLE clubs (
    club_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    avatar_url TEXT,
    created_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clubs_created_by_user_id ON clubs(created_by_user_id);

CREATE TABLE club_memberships (
    club_membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role "ClubMembershipRole" NOT NULL,
    status "ClubMembershipStatus" NOT NULL,
    joined_at TIMESTAMP(6),
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_club_memberships_club_id_user_id UNIQUE (club_id, user_id)
);

CREATE INDEX idx_club_memberships_user_id ON club_memberships(user_id);
CREATE INDEX idx_club_memberships_status ON club_memberships(status);

CREATE TABLE posts (
    post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    club_id UUID REFERENCES clubs(club_id) ON DELETE SET NULL,
    post_type "PostType" NOT NULL DEFAULT 'general',
    opportunity_type "OpportunityType",
    title VARCHAR(255),
    content_text TEXT,
    event_date TIMESTAMP(6),
    location VARCHAR(255),
    external_url TEXT,
    visibility "PostVisibility" NOT NULL DEFAULT 'public',
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_author_user_id ON posts(author_user_id);
CREATE INDEX idx_posts_club_id ON posts(club_id);
CREATE INDEX idx_posts_created_at ON posts(created_at);
CREATE INDEX idx_posts_post_type ON posts(post_type);

CREATE TABLE post_media (
    post_media_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type VARCHAR(50) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_media_post_id ON post_media(post_id);

CREATE TABLE post_likes (
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

CREATE INDEX idx_post_likes_post_id ON post_likes(post_id);

CREATE TABLE post_comments (
    comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
    author_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES post_comments(comment_id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_comments_post_id ON post_comments(post_id);
CREATE INDEX idx_post_comments_author_user_id ON post_comments(author_user_id);
CREATE INDEX idx_post_comments_parent_comment_id ON post_comments(parent_comment_id);

CREATE TABLE post_saves (
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

CREATE INDEX idx_post_saves_post_id ON post_saves(post_id);

CREATE TABLE hashtags (
    hashtag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hashtags_tag_name ON hashtags(tag_name);

CREATE TABLE post_hashtags (
    post_id UUID NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
    hashtag_id UUID NOT NULL REFERENCES hashtags(hashtag_id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, hashtag_id)
);

CREATE INDEX idx_post_hashtags_hashtag_id ON post_hashtags(hashtag_id);

CREATE TABLE chats (
    chat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_type "ChatType" NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    created_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chats_created_by_user_id ON chats(created_by_user_id);

CREATE TABLE messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    message_type "MessageType" NOT NULL,
    content TEXT,
    reply_to_message_id UUID REFERENCES messages(message_id) ON DELETE SET NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP(6)
);

CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_sender_user_id ON messages(sender_user_id);
CREATE INDEX idx_messages_reply_to_message_id ON messages(reply_to_message_id);

CREATE TABLE chat_participants (
    chat_participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role "ChatParticipantRole" NOT NULL,
    joined_at TIMESTAMP(6) NOT NULL,
    left_at TIMESTAMP(6),
    last_read_message_id UUID REFERENCES messages(message_id) ON DELETE SET NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_chat_participants_chat_id_user_id UNIQUE (chat_id, user_id)
);

CREATE INDEX idx_chat_participants_user_id ON chat_participants(user_id);
CREATE INDEX idx_chat_participants_last_read_message_id ON chat_participants(last_read_message_id);

CREATE TABLE message_attachments (
    message_attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_attachments_message_id ON message_attachments(message_id);

CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    entity_type VARCHAR(50),
    entity_id TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    read_at TIMESTAMP(6)
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_actor_user_id ON notifications(actor_user_id);
CREATE INDEX idx_notifications_notification_type ON notifications(notification_type);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

COMMIT;
