-- ============================================================
-- Common Queries for Social Media Platform
-- Usage Examples and API Query Patterns
-- ============================================================

-- ============================================================
-- USER QUERIES
-- ============================================================

-- 1. Get user profile with stats
SELECT 
    u.user_id,
    u.username,
    u.email,
    u.bio,
    u.profile_picture_url,
    u.is_public,
    u.created_at,
    (SELECT COUNT(*) FROM Follows WHERE follower_id = u.user_id) as following_count,
    (SELECT COUNT(*) FROM Follows WHERE followee_id = u.user_id) as follower_count,
    (SELECT COUNT(*) FROM Posts WHERE user_id = u.user_id) as post_count
FROM Users u
WHERE u.username = 'john_doe';

-- 2. Search users by username
SELECT user_id, username, bio, profile_picture_url, is_public
FROM Users
WHERE username ILIKE '%john%'
LIMIT 20;

-- 3. Get user's followers
SELECT 
    u.user_id,
    u.username,
    u.profile_picture_url,
    u.bio,
    f.created_at as followed_since
FROM Follows f
JOIN Users u ON f.follower_id = u.user_id
WHERE f.followee_id = (SELECT user_id FROM Users WHERE username = 'john_doe')
ORDER BY f.created_at DESC;

-- 4. Get users that a user is following
SELECT 
    u.user_id,
    u.username,
    u.profile_picture_url,
    u.bio,
    f.created_at as following_since
FROM Follows f
JOIN Users u ON f.followee_id = u.user_id
WHERE f.follower_id = (SELECT user_id FROM Users WHERE username = 'john_doe')
ORDER BY f.created_at DESC;

-- 5. Check if user1 follows user2
SELECT EXISTS(
    SELECT 1 FROM Follows
    WHERE follower_id = (SELECT user_id FROM Users WHERE username = 'john_doe')
    AND followee_id = (SELECT user_id FROM Users WHERE username = 'jane_smith')
) as is_following;

-- ============================================================
-- POST QUERIES
-- ============================================================

-- 6. Get user's timeline (followed posts) - Using the custom function
-- Replace 'USER_UUID_HERE' with actual user UUID
SELECT * FROM get_user_timeline('USER_UUID_HERE'::UUID, 50, 0);

-- 7. Get user's own posts
SELECT 
    p.post_id,
    p.content_text,
    p.media_url,
    p.media_type,
    p.view_count,
    p.created_at,
    (SELECT COUNT(*) FROM Likes WHERE post_id = p.post_id) as like_count,
    (SELECT COUNT(*) FROM Comments WHERE post_id = p.post_id) as comment_count
FROM Posts p
WHERE p.user_id = (SELECT user_id FROM Users WHERE username = 'john_doe')
ORDER BY p.created_at DESC;

-- 8. Get single post with details
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
    (SELECT COUNT(*) FROM Likes WHERE post_id = p.post_id) as like_count,
    (SELECT COUNT(*) FROM Comments WHERE post_id = p.post_id) as comment_count
FROM Posts p
JOIN Users u ON p.user_id = u.user_id
WHERE p.post_id = 'POST_UUID_HERE';

-- 9. Get posts with pagination (Discover/Explore feed)
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
    (SELECT COUNT(*) FROM Likes WHERE post_id = p.post_id) as like_count,
    (SELECT COUNT(*) FROM Comments WHERE post_id = p.post_id) as comment_count
FROM Posts p
JOIN Users u ON p.user_id = u.user_id
WHERE u.is_public = TRUE
ORDER BY p.created_at DESC
LIMIT 50 OFFSET 0;

-- 10. Get trending posts (most liked in last 24 hours)
SELECT 
    p.post_id,
    p.user_id,
    u.username,
    u.profile_picture_url,
    p.content_text,
    p.media_url,
    p.created_at,
    COUNT(l.user_id) as like_count
FROM Posts p
JOIN Users u ON p.user_id = u.user_id
LEFT JOIN Likes l ON p.post_id = l.post_id
WHERE p.created_at >= NOW() - INTERVAL '24 hours'
AND u.is_public = TRUE
GROUP BY p.post_id, u.user_id, u.username, u.profile_picture_url
ORDER BY like_count DESC, p.created_at DESC
LIMIT 50;

-- ============================================================
-- LIKE QUERIES
-- ============================================================

-- 11. Get users who liked a post
SELECT 
    u.user_id,
    u.username,
    u.profile_picture_url,
    l.created_at as liked_at
FROM Likes l
JOIN Users u ON l.user_id = u.user_id
WHERE l.post_id = 'POST_UUID_HERE'
ORDER BY l.created_at DESC;

-- 12. Check if user liked a post
SELECT EXISTS(
    SELECT 1 FROM Likes
    WHERE user_id = 'USER_UUID_HERE'
    AND post_id = 'POST_UUID_HERE'
) as has_liked;

-- 13. Get all posts liked by a user
SELECT 
    p.post_id,
    p.user_id,
    u.username,
    p.content_text,
    p.media_url,
    p.created_at,
    l.created_at as liked_at
FROM Likes l
JOIN Posts p ON l.post_id = p.post_id
JOIN Users u ON p.user_id = u.user_id
WHERE l.user_id = 'USER_UUID_HERE'
ORDER BY l.created_at DESC;

-- ============================================================
-- COMMENT QUERIES
-- ============================================================

-- 14. Get comments for a post (with threaded structure)
SELECT 
    c.comment_id,
    c.user_id,
    u.username,
    u.profile_picture_url,
    c.parent_comment_id,
    c.content,
    c.created_at,
    (SELECT COUNT(*) FROM Comments WHERE parent_comment_id = c.comment_id) as reply_count
FROM Comments c
JOIN Users u ON c.user_id = u.user_id
WHERE c.post_id = 'POST_UUID_HERE'
ORDER BY c.created_at ASC;

-- 15. Get top-level comments (no parent)
SELECT 
    c.comment_id,
    c.user_id,
    u.username,
    u.profile_picture_url,
    c.content,
    c.created_at,
    (SELECT COUNT(*) FROM Comments WHERE parent_comment_id = c.comment_id) as reply_count
FROM Comments c
JOIN Users u ON c.user_id = u.user_id
WHERE c.post_id = 'POST_UUID_HERE'
AND c.parent_comment_id IS NULL
ORDER BY c.created_at DESC;

-- 16. Get replies to a specific comment
SELECT 
    c.comment_id,
    c.user_id,
    u.username,
    u.profile_picture_url,
    c.content,
    c.created_at
FROM Comments c
JOIN Users u ON c.user_id = u.user_id
WHERE c.parent_comment_id = 'COMMENT_UUID_HERE'
ORDER BY c.created_at ASC;

-- ============================================================
-- HASHTAG QUERIES
-- ============================================================

-- 17. Get posts by hashtag - Using the custom function
SELECT * FROM get_posts_by_hashtag('coding', 50);

-- 18. Get trending hashtags (most used in last 7 days)
SELECT 
    h.tag_id,
    h.tag_name,
    COUNT(pt.post_id) as usage_count
FROM Hashtags h
JOIN PostTags pt ON h.tag_id = pt.tag_id
JOIN Posts p ON pt.post_id = p.post_id
WHERE p.created_at >= NOW() - INTERVAL '7 days'
GROUP BY h.tag_id, h.tag_name
ORDER BY usage_count DESC
LIMIT 20;

-- 19. Get hashtags for a specific post
SELECT 
    h.tag_id,
    h.tag_name
FROM Hashtags h
JOIN PostTags pt ON h.tag_id = pt.tag_id
WHERE pt.post_id = 'POST_UUID_HERE';

-- 20. Search hashtags
SELECT tag_id, tag_name
FROM Hashtags
WHERE tag_name ILIKE '%coding%'
ORDER BY tag_name
LIMIT 20;

-- ============================================================
-- INSERT/UPDATE/DELETE OPERATIONS
-- ============================================================

-- 21. Create a new post
INSERT INTO Posts (user_id, content_text, media_url, media_type)
VALUES ('USER_UUID_HERE', 'My new post content', 'https://example.com/image.jpg', 'image')
RETURNING post_id, created_at;

-- 22. Like a post
INSERT INTO Likes (user_id, post_id)
VALUES ('USER_UUID_HERE', 'POST_UUID_HERE')
ON CONFLICT DO NOTHING;

-- 23. Unlike a post
DELETE FROM Likes
WHERE user_id = 'USER_UUID_HERE'
AND post_id = 'POST_UUID_HERE';

-- 24. Follow a user
INSERT INTO Follows (follower_id, followee_id)
VALUES ('FOLLOWER_UUID_HERE', 'FOLLOWEE_UUID_HERE')
ON CONFLICT DO NOTHING;

-- 25. Unfollow a user
DELETE FROM Follows
WHERE follower_id = 'FOLLOWER_UUID_HERE'
AND followee_id = 'FOLLOWEE_UUID_HERE';

-- 26. Add a comment
INSERT INTO Comments (post_id, user_id, content, parent_comment_id)
VALUES ('POST_UUID_HERE', 'USER_UUID_HERE', 'Great post!', NULL)
RETURNING comment_id, created_at;

-- 27. Reply to a comment
INSERT INTO Comments (post_id, user_id, content, parent_comment_id)
VALUES ('POST_UUID_HERE', 'USER_UUID_HERE', 'Thanks!', 'PARENT_COMMENT_UUID_HERE')
RETURNING comment_id, created_at;

-- 28. Delete a post (cascades to likes, comments, posttags)
DELETE FROM Posts
WHERE post_id = 'POST_UUID_HERE'
AND user_id = 'USER_UUID_HERE';

-- 29. Update user profile
UPDATE Users
SET bio = 'New bio text',
    profile_picture_url = 'https://example.com/newpic.jpg'
WHERE user_id = 'USER_UUID_HERE';

-- 30. Add or get hashtag, then link to post
WITH new_tag AS (
    INSERT INTO Hashtags (tag_name)
    VALUES ('newtag')
    ON CONFLICT (tag_name) DO UPDATE SET tag_name = EXCLUDED.tag_name
    RETURNING tag_id
)
INSERT INTO PostTags (post_id, tag_id)
SELECT 'POST_UUID_HERE', tag_id FROM new_tag
ON CONFLICT DO NOTHING;

-- ============================================================
-- ANALYTICS QUERIES
-- ============================================================

-- 31. Get user engagement stats
SELECT 
    u.username,
    COUNT(DISTINCT p.post_id) as total_posts,
    COUNT(DISTINCT l.post_id) as posts_liked,
    COUNT(DISTINCT c.comment_id) as comments_made,
    (SELECT COUNT(*) FROM Follows WHERE follower_id = u.user_id) as following,
    (SELECT COUNT(*) FROM Follows WHERE followee_id = u.user_id) as followers
FROM Users u
LEFT JOIN Posts p ON u.user_id = p.user_id
LEFT JOIN Likes l ON u.user_id = l.user_id
LEFT JOIN Comments c ON u.user_id = c.user_id
WHERE u.user_id = 'USER_UUID_HERE'
GROUP BY u.user_id, u.username;

-- 32. Get post engagement details
SELECT 
    p.post_id,
    p.content_text,
    p.view_count,
    COUNT(DISTINCT l.user_id) as like_count,
    COUNT(DISTINCT c.comment_id) as comment_count,
    p.created_at
FROM Posts p
LEFT JOIN Likes l ON p.post_id = l.post_id
LEFT JOIN Comments c ON p.post_id = c.post_id
WHERE p.user_id = 'USER_UUID_HERE'
GROUP BY p.post_id
ORDER BY p.created_at DESC;

-- 33. Find suggested users to follow (users followed by people you follow)
SELECT 
    u.user_id,
    u.username,
    u.profile_picture_url,
    COUNT(*) as mutual_connections
FROM Users u
JOIN Follows f1 ON u.user_id = f1.followee_id
JOIN Follows f2 ON f1.follower_id = f2.followee_id
WHERE f2.follower_id = 'CURRENT_USER_UUID_HERE'
AND u.user_id != 'CURRENT_USER_UUID_HERE'
AND NOT EXISTS (
    SELECT 1 FROM Follows 
    WHERE follower_id = 'CURRENT_USER_UUID_HERE' 
    AND followee_id = u.user_id
)
GROUP BY u.user_id, u.username, u.profile_picture_url
ORDER BY mutual_connections DESC
LIMIT 10;
