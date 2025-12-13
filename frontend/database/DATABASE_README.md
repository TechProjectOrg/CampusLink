# Social Media Platform Database

Complete PostgreSQL database implementation for a social media platform (CampusLink).

## 📋 Overview

This database schema supports a full-featured social media platform with:
- User profiles and authentication
- Posts with media support
- Follow/follower relationships
- Likes and comments (with threading)
- Hashtag system
- Privacy controls (public/private accounts)

## 🗂️ Database Structure

### Tables

1. **Users** - User profiles and authentication
2. **Posts** - User-generated content
3. **Follows** - User relationships (who follows whom)
4. **Likes** - Post interactions (user likes)
5. **Comments** - Post interactions (with threaded replies)
6. **Hashtags** - Tag repository
7. **PostTags** - Many-to-many bridge between Posts and Hashtags

### Key Features

- **UUID Primary Keys** - Better for distributed systems and security
- **Indexes** - Optimized for common query patterns
- **Foreign Keys with CASCADE** - Automatic cleanup on deletion
- **Views** - Pre-built queries for common operations
- **Functions** - Reusable stored procedures for complex queries
- **Triggers** - Business logic enforcement (e.g., prevent self-following)

## 🚀 Setup Instructions

### Prerequisites

- PostgreSQL 12 or higher
- Access to create databases and tables

### Installation Steps

1. **Create Database**
```sql
CREATE DATABASE campuslink_db;
\c campuslink_db;
```

2. **Run Schema**
```bash
psql -U your_username -d campuslink_db -f database_schema.sql
```

3. **Load Sample Data (Optional)**
```bash
psql -U your_username -d campuslink_db -f sample_data.sql
```

### Using Docker (Alternative)

```bash
# Start PostgreSQL container
docker run -d \
  --name campuslink-db \
  -e POSTGRES_DB=campuslink_db \
  -e POSTGRES_USER=campuslink \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  postgres:15

# Load schema
docker exec -i campuslink-db psql -U campuslink -d campuslink_db < database_schema.sql

# Load sample data
docker exec -i campuslink-db psql -U campuslink -d campuslink_db < sample_data.sql
```

## 📊 Schema Diagram

```
Users
  ├── Posts (1:Many)
  │   ├── Likes (Many:Many with Users)
  │   ├── Comments (Many:1 with Users, self-referencing for threads)
  │   └── PostTags (Many:Many with Hashtags)
  └── Follows (Many:Many self-join)
```

## 🔍 Common Operations

### User Management

**Register new user:**
```sql
INSERT INTO Users (username, email, password_hash, bio)
VALUES ('new_user', 'user@example.com', 'hashed_password', 'My bio')
RETURNING user_id;
```

**Get user profile:**
```sql
SELECT * FROM UserStats WHERE username = 'john_doe';
```

### Posts

**Create post:**
```sql
INSERT INTO Posts (user_id, content_text, media_url, media_type)
VALUES ('user_uuid', 'Hello World!', NULL, NULL)
RETURNING post_id;
```

**Get user timeline:**
```sql
SELECT * FROM get_user_timeline('user_uuid'::UUID, 50, 0);
```

### Social Features

**Follow user:**
```sql
INSERT INTO Follows (follower_id, followee_id)
VALUES ('follower_uuid', 'followee_uuid');
```

**Like post:**
```sql
INSERT INTO Likes (user_id, post_id)
VALUES ('user_uuid', 'post_uuid');
```

**Comment on post:**
```sql
INSERT INTO Comments (post_id, user_id, content)
VALUES ('post_uuid', 'user_uuid', 'Great post!');
```

### Hashtags

**Get posts by hashtag:**
```sql
SELECT * FROM get_posts_by_hashtag('coding', 50);
```

## 📈 Performance Considerations

### Indexes Created

- `idx_user_username` - Fast user lookups
- `idx_user_email` - Email-based authentication
- `idx_post_user_id` - User's posts retrieval
- `idx_post_created_at` - Timeline queries
- `idx_followee_id`, `idx_follower_id` - Follow relationship queries
- `idx_like_post_id` - Like count queries
- `idx_comment_post_id` - Comment retrieval
- `idx_tag_name` - Hashtag searches
- `idx_posttag_tag_id` - Posts by hashtag

### Query Optimization Tips

1. **Use prepared statements** to prevent SQL injection and improve performance
2. **Limit result sets** - Always use LIMIT/OFFSET for pagination
3. **Use indexes** - The schema includes optimized indexes for common queries
4. **Batch operations** - Use transactions for multiple related operations
5. **Cache frequently accessed data** - Consider caching user profiles and post counts

## 🔒 Security Best Practices

1. **Password Hashing** - Never store plain text passwords. Use bcrypt or Argon2:
   ```javascript
   // Example with bcrypt (Node.js)
   const bcrypt = require('bcrypt');
   const hashedPassword = await bcrypt.hash(password, 10);
   ```

2. **Input Validation** - Always validate and sanitize user input

3. **Parameterized Queries** - Use prepared statements to prevent SQL injection:
   ```javascript
   // Example with Node.js pg library
   const result = await pool.query(
     'SELECT * FROM Users WHERE username = $1',
     [username]
   );
   ```

4. **Rate Limiting** - Implement rate limiting for API endpoints

5. **Access Control** - Check user permissions before allowing operations:
   ```sql
   -- Only allow users to delete their own posts
   DELETE FROM Posts 
   WHERE post_id = $1 AND user_id = $2;
   ```

## 🧪 Testing

The `sample_data.sql` file includes test data with:
- 4 sample users
- Multiple posts with different media types
- Follow relationships
- Likes and comments
- Hashtags and post-tag associations

## 📚 API Integration Examples

### Node.js (with pg library)

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  user: 'campuslink',
  host: 'localhost',
  database: 'campuslink_db',
  password: 'your_password',
  port: 5432,
});

// Get user timeline
async function getUserTimeline(userId, limit = 50, offset = 0) {
  const result = await pool.query(
    'SELECT * FROM get_user_timeline($1, $2, $3)',
    [userId, limit, offset]
  );
  return result.rows;
}

// Create post
async function createPost(userId, content, mediaUrl = null, mediaType = null) {
  const result = await pool.query(
    'INSERT INTO Posts (user_id, content_text, media_url, media_type) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, content, mediaUrl, mediaType]
  );
  return result.rows[0];
}
```

### Python (with psycopg2)

```python
import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(
    dbname="campuslink_db",
    user="campuslink",
    password="your_password",
    host="localhost"
)

def get_user_timeline(user_id, limit=50, offset=0):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT * FROM get_user_timeline(%s, %s, %s)",
            (user_id, limit, offset)
        )
        return cur.fetchall()

def create_post(user_id, content, media_url=None, media_type=None):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "INSERT INTO Posts (user_id, content_text, media_url, media_type) VALUES (%s, %s, %s, %s) RETURNING *",
            (user_id, content, media_url, media_type)
        )
        conn.commit()
        return cur.fetchone()
```

## 🔄 Migration Strategy

When updating the schema:

1. Create migration files with timestamps:
   ```
   migrations/
   ├── 001_initial_schema.sql
   ├── 002_add_user_verification.sql
   └── 003_add_notifications.sql
   ```

2. Use a migration tool like:
   - **Flyway** (Java)
   - **node-pg-migrate** (Node.js)
   - **Alembic** (Python)
   - **golang-migrate** (Go)

## 📝 Additional Files

- `database_schema.sql` - Complete database schema with tables, indexes, views, functions
- `sample_data.sql` - Test data for development
- `common_queries.sql` - 33+ ready-to-use queries for common operations

## 🐛 Troubleshooting

### Connection Issues
```sql
-- Check if PostgreSQL is running
sudo systemctl status postgresql

-- Verify database exists
psql -U postgres -c "\l"
```

### Permission Issues
```sql
-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE campuslink_db TO your_username;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_username;
```

### Performance Issues
```sql
-- Analyze tables for query optimization
ANALYZE Users;
ANALYZE Posts;
ANALYZE Follows;

-- Check slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

## 📞 Support

For issues or questions:
1. Check the `common_queries.sql` file for query examples
2. Review the schema comments in `database_schema.sql`
3. Consult PostgreSQL documentation: https://www.postgresql.org/docs/

## 📄 License

This database schema is part of the CampusLink Final Year Project.

---

**Version:** 1.0  
**Last Updated:** 2025  
**Database Type:** PostgreSQL 12+
