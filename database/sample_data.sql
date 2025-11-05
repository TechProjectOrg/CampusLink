-- ============================================================
-- Sample Data and Test Queries
-- Social Media Platform Database
-- ============================================================

-- Note: Run database_schema.sql first before running this file

-- ============================================================
-- SAMPLE DATA INSERTION
-- ============================================================

-- Get user IDs for reference (replace these with actual UUIDs from your Users table)
DO $$
DECLARE
    user1_id UUID;
    user2_id UUID;
    user3_id UUID;
    user4_id UUID;
    post1_id UUID;
    post2_id UUID;
    post3_id UUID;
    tag1_id UUID;
    tag2_id UUID;
BEGIN
    -- Get user IDs
    SELECT user_id INTO user1_id FROM Users WHERE username = 'john_doe';
    SELECT user_id INTO user2_id FROM Users WHERE username = 'jane_smith';
    SELECT user_id INTO user3_id FROM Users WHERE username = 'alex_wilson';
    SELECT user_id INTO user4_id FROM Users WHERE username = 'sarah_lee';

    -- Insert sample posts
    INSERT INTO Posts (user_id, content_text, media_type, view_count) VALUES
    (user1_id, 'Just finished a new coding project! #coding #webdev', NULL, 45)
    RETURNING post_id INTO post1_id;

    INSERT INTO Posts (user_id, content_text, media_url, media_type, view_count) VALUES
    (user2_id, 'New digital artwork! What do you think? 🎨', 'https://example.com/art1.jpg', 'image', 120)
    RETURNING post_id INTO post2_id;

    INSERT INTO Posts (user_id, content_text, media_url, media_type, view_count) VALUES
    (user4_id, 'Amazing sunset in Bali! #travel #sunset', 'https://example.com/bali.jpg', 'image', 230)
    RETURNING post_id INTO post3_id;

    -- Insert follows relationships
    INSERT INTO Follows (follower_id, followee_id) VALUES
    (user1_id, user2_id),  -- john follows jane
    (user1_id, user4_id),  -- john follows sarah
    (user2_id, user1_id),  -- jane follows john
    (user2_id, user4_id),  -- jane follows sarah
    (user4_id, user1_id),  -- sarah follows john
    (user4_id, user2_id);  -- sarah follows jane

    -- Insert hashtags
    INSERT INTO Hashtags (tag_name) VALUES
    ('coding') RETURNING tag_id INTO tag1_id;
    
    INSERT INTO Hashtags (tag_name) VALUES
    ('webdev'),
    ('travel'),
    ('sunset'),
    ('art'),
    ('photography');

    -- Link posts to hashtags
    SELECT tag_id INTO tag1_id FROM Hashtags WHERE tag_name = 'coding';
    SELECT tag_id INTO tag2_id FROM Hashtags WHERE tag_name = 'webdev';
    
    INSERT INTO PostTags (post_id, tag_id) VALUES
    (post1_id, tag1_id),
    (post1_id, tag2_id);

    SELECT tag_id INTO tag1_id FROM Hashtags WHERE tag_name = 'travel';
    SELECT tag_id INTO tag2_id FROM Hashtags WHERE tag_name = 'sunset';
    
    INSERT INTO PostTags (post_id, tag_id) VALUES
    (post3_id, tag1_id),
    (post3_id, tag2_id);

    -- Insert likes
    INSERT INTO Likes (user_id, post_id) VALUES
    (user2_id, post1_id),  -- jane likes john's post
    (user4_id, post1_id),  -- sarah likes john's post
    (user1_id, post2_id),  -- john likes jane's post
    (user4_id, post2_id),  -- sarah likes jane's post
    (user1_id, post3_id),  -- john likes sarah's post
    (user2_id, post3_id);  -- jane likes sarah's post

    -- Insert comments
    INSERT INTO Comments (post_id, user_id, content) VALUES
    (post1_id, user2_id, 'Looks great! What tech stack did you use?'),
    (post1_id, user4_id, 'Impressive work! 👏'),
    (post2_id, user1_id, 'Beautiful colors! Love your style.'),
    (post3_id, user1_id, 'Stunning! I need to visit Bali someday.'),
    (post3_id, user2_id, 'Absolutely gorgeous! 😍');

END $$;
