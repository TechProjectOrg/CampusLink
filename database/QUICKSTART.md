# Quick Start Guide

## 📋 Prerequisites

1. **Install PostgreSQL** (if not already installed)
   - Download from: https://www.postgresql.org/download/windows/
   - During installation, remember your postgres user password
   - Make sure `psql` is added to your PATH

## 🚀 Easy Setup (Recommended)

### Option 1: Using the Setup Script

```powershell
# Navigate to database folder
cd database

# Run the setup script (will prompt for password)
.\setup.ps1 -DBUser postgres -DBPassword your_password

# Or without sample data
.\setup.ps1 -DBUser postgres -DBPassword your_password -SkipSampleData
```

### Option 2: Manual Setup

```powershell
# 1. Create database
psql -U postgres -c "CREATE DATABASE campuslink_db;"

# 2. Run schema
psql -U postgres -d campuslink_db -f database_schema.sql

# 3. Load sample data (optional)
psql -U postgres -d campuslink_db -f sample_data.sql
```

## ✅ Verify Installation

```powershell
# Connect to database
psql -U postgres -d campuslink_db

# Check tables
\dt

# Check sample data
SELECT username FROM Users;

# Exit
\q
```

You should see 7 tables: Users, Posts, Follows, Likes, Comments, Hashtags, PostTags

## 📁 File Structure

```
database/
├── database_schema.sql    # Main schema (run this first)
├── sample_data.sql        # Test data (optional)
├── common_queries.sql     # Query examples (reference)
├── setup.ps1              # Automated setup script
├── DATABASE_README.md     # Full documentation
└── QUICKSTART.md          # This file
```

## 🔧 Configuration

Default settings:
- Database: `campuslink_db`
- Host: `localhost`
- Port: `5432`
- User: `postgres`

To change these, edit the setup script or pass parameters:

```powershell
.\setup.ps1 -DBName mydb -DBHost localhost -DBPort 5432 -DBUser myuser -DBPassword mypass
```

## 🎯 What Gets Created

- **7 Tables**: Complete social media schema
- **10 Indexes**: Optimized for performance
- **2 Views**: UserFeed, UserStats
- **2 Functions**: get_user_timeline(), get_posts_by_hashtag()
- **1 Trigger**: Prevent self-following
- **Sample Data**: 4 users, posts, follows, likes, comments, hashtags (if included)

## 🔄 Reset Database

If you need to start fresh:

```powershell
# Drop and recreate
psql -U postgres -c "DROP DATABASE IF EXISTS campuslink_db;"
.\setup.ps1 -DBUser postgres -DBPassword your_password
```

## 📚 Next Steps

1. ✅ Database is ready
2. 📖 Read `DATABASE_README.md` for detailed documentation
3. 💻 Check `common_queries.sql` for query examples
4. 🔌 Connect your application (see examples in DATABASE_README.md)

## ❓ Troubleshooting

### PostgreSQL not found
```powershell
# Add PostgreSQL to PATH (adjust version and path)
$env:Path += ";C:\Program Files\PostgreSQL\15\bin"
```

### Authentication failed
- Make sure you're using the correct password
- Check `pg_hba.conf` for authentication settings

### Permission denied
```powershell
# Run PowerShell as Administrator
# Or grant permissions to your user
```

### Port already in use
- Change port: `-DBPort 5433`
- Or stop other PostgreSQL instances

## 📞 Need Help?

See `DATABASE_README.md` for:
- Detailed setup instructions
- Docker setup alternative
- API integration examples
- Security best practices
- Performance optimization
