CREATE TYPE "ClubPrivacy" AS ENUM ('open', 'request', 'private');
CREATE TYPE "ClubRestrictionType" AS ENUM ('posting_blocked', 'comment_blocked', 'membership_ban');

ALTER TYPE "ClubMembershipStatus" ADD VALUE IF NOT EXISTS 'invited';

CREATE TABLE club_categories (
    club_category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name VARCHAR(100) NOT NULL,
    normalized_name VARCHAR(100) NOT NULL UNIQUE,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_club_categories_is_system ON club_categories(is_system);

CREATE TABLE club_tags (
    club_tag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name VARCHAR(100) NOT NULL,
    normalized_name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_club_tags_normalized_name ON club_tags(normalized_name);

CREATE TABLE club_tags_on_clubs (
    club_id UUID NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
    club_tag_id UUID NOT NULL REFERENCES club_tags(club_tag_id) ON DELETE CASCADE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    PRIMARY KEY (club_id, club_tag_id)
);

CREATE INDEX idx_club_tags_on_clubs_tag_id ON club_tags_on_clubs(club_tag_id);

ALTER TABLE clubs
    ADD COLUMN IF NOT EXISTS slug VARCHAR(255),
    ADD COLUMN IF NOT EXISTS short_description VARCHAR(255),
    ADD COLUMN IF NOT EXISTS privacy "ClubPrivacy" NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
    ADD COLUMN IF NOT EXISTS linked_chat_id UUID,
    ADD COLUMN IF NOT EXISTS primary_category_id UUID REFERENCES club_categories(club_category_id) ON DELETE SET NULL;

UPDATE clubs
SET slug = lower(
    regexp_replace(
        regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'),
        '(^-+|-+$)',
        '',
        'g'
    )
)
WHERE slug IS NULL;

ALTER TABLE clubs
    ALTER COLUMN slug SET NOT NULL;

ALTER TABLE clubs
    ADD CONSTRAINT uq_clubs_slug UNIQUE (slug);

CREATE INDEX idx_clubs_slug ON clubs(slug);
CREATE INDEX idx_clubs_primary_category_id ON clubs(primary_category_id);

CREATE TABLE club_member_restrictions (
    club_member_restriction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
    club_membership_id UUID NOT NULL REFERENCES club_memberships(club_membership_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    imposed_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    restriction_type "ClubRestrictionType" NOT NULL,
    reason TEXT,
    expires_at TIMESTAMP(6),
    created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_club_member_restrictions_club_id ON club_member_restrictions(club_id);
CREATE INDEX idx_club_member_restrictions_membership_id ON club_member_restrictions(club_membership_id);
CREATE INDEX idx_club_member_restrictions_user_id ON club_member_restrictions(user_id);

INSERT INTO club_categories (display_name, normalized_name, is_system)
VALUES
    ('Technology', 'technology', TRUE),
    ('Arts & Culture', 'arts culture', TRUE),
    ('Sports', 'sports', TRUE),
    ('Academic', 'academic', TRUE),
    ('Social', 'social', TRUE),
    ('Professional', 'professional', TRUE),
    ('Gaming', 'gaming', TRUE),
    ('Music', 'music', TRUE),
    ('Other', 'other', TRUE)
ON CONFLICT (normalized_name) DO NOTHING;
