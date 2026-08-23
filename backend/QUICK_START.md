# Pravo Academy Backend - Quick Start Guide

Get the Pravo Academy backend up and running in 5 minutes!

---

## Prerequisites

- Node.js 16+ and npm
- PostgreSQL 12+
- Docker & Docker Compose (optional, for containerized setup)

---

## Installation

### 1. Clone and Install Dependencies

```bash
cd pravo-academy-backend
npm install
```

### 2. Configure Environment

```bash
# Copy example config
cp .env.example .env

# Edit .env with your settings
nano .env
```

**Essential variables:**
```
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pravo_academy
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_secret_key_here_min_32_chars

# Email (optional for development)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_email@example.com
SMTP_PASSWORD=your_password
```

### 3. Database Setup

```bash
# Create database
createdb pravo_academy

# Run migrations/schema
psql -U postgres -d pravo_academy -f src/db/schema.sql

# (Optional) Seed sample data
node -e "require('ts-node').register(); require('./src/db/seed').default();"
```

Or with Docker Compose:

```bash
docker-compose up -d
npm run db:migrate
npm run db:seed
```

---

## Development

### Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3000`

Health check: `GET http://localhost:3000/health`

### Build for Production

```bash
npm run build
npm start
```

---

## Testing Endpoints

### Using cURL

```bash
# Register user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123",
    "first_name": "John",
    "last_name": "Doe"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123"
  }'

# Get dashboard (with token)
curl -X GET http://localhost:3000/api/progress/dashboard \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Using Postman

1. Import `/POSTMAN_COLLECTION.json` into Postman
2. Set `{{base_url}}` to `http://localhost:3000/api`
3. Run "Register" request to get a token
4. Use the token in other authenticated requests

### Using Thunder Client (VS Code)

1. Install Thunder Client extension
2. Import collection from the repo
3. Test endpoints directly in VS Code

---

## Key Features to Test

### 1. Authentication
- Register new user
- Login (get JWT token)
- Use token for authenticated requests

### 2. Flashcards
- List flashcards with filters
- Create flashcard (admin)
- Update flashcard (admin)
- Delete flashcard (admin)

### 3. Study Plans
- Generate study plan for exam
- View study plan with daily breakdown
- Get today's focus task
- Reschedule task to different date

### 4. Search
- Global search across all content
- Search specific content types
- Get autocomplete suggestions
- Advanced search with filters

### 5. Quizzes
- Get quiz with questions
- Submit answers
- View results with explanations
- Get quiz history and statistics

### 6. Notifications
- List notifications
- Update notification preferences
- Check for achievements
- Schedule reminders

---

## Common Issues & Solutions

### Issue: Database Connection Failed

**Solution:**
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Check credentials in .env
psql -h localhost -U postgres -d pravo_academy

# Reset database
dropdb pravo_academy
createdb pravo_academy
psql -U postgres -d pravo_academy -f src/db/schema.sql
```

### Issue: Port 3000 Already in Use

**Solution:**
```bash
# Find process on port 3000
lsof -i :3000

# Kill it
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

### Issue: JWT Authentication Failing

**Solution:**
```bash
# Ensure JWT_SECRET is set in .env
# Should be at least 32 characters
# Regenerate if needed

# Make sure token is in Authorization header
Authorization: Bearer YOUR_TOKEN_HERE
```

### Issue: Email Sending Not Working

**Solution:**
- Email is optional for development (just logs instead)
- Configure SMTP_* variables in .env for production
- Test with `POST /auth/forgot-password` endpoint

---

## API Testing Examples

### Test Study Plan Generation

```bash
# 1. Get exam date (e.g., 2026-09-15)
# 2. Generate study plan
curl -X POST http://localhost:3000/api/progress/study-plan/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "exam_date": "2026-09-15",
    "subject_ids": ["subject-uuid-1", "subject-uuid-2"]
  }'

# Expected: { "plan_id": "uuid" }

# 3. View the generated plan
curl -X GET http://localhost:3000/api/progress/study-plan \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: Plan with daily breakdown of tasks
```

### Test Global Search

```bash
# Search for "contract"
curl "http://localhost:3000/api/search?q=contract&limit=10"

# Search for "tort" in cases only
curl "http://localhost:3000/api/search/cases?q=tort&limit=10"

# Get autocomplete suggestions
curl "http://localhost:3000/api/search/suggestions?q=con&limit=5"
```

### Test Quiz Submission

```bash
# 1. Get quiz with questions
curl http://localhost:3000/api/quiz/QUIZ_UUID

# 2. Submit answers
curl -X POST http://localhost:3000/api/quiz/submit \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quiz_id": "QUIZ_UUID",
    "answers": {
      "question_1": "A",
      "question_2": "B",
      "question_3": "C"
    }
  }'

# Expected: Score, percentage, detailed results with explanations
```

---

## Database Schema Overview

**Core Tables:**
- `users` - User accounts
- `subjects` - Legal subjects
- `topics` - Topics within subjects
- `flashcards` - Flashcard Q&A pairs
- `quizzes` - Quiz collections
- `quiz_questions` - Individual quiz questions
- `quiz_results` - User quiz attempt results
- `lectures` - Video lectures
- `cases` - Legal case studies
- `conspects` - Study summaries
- `progress` - User content progress tracking
- `study_plans` - Personalized study plans
- `study_plan_tasks` - Individual plan tasks
- `notifications` - User notifications
- `exam_calendar` - Scheduled exams

**Indexes:**
- User ID indexes for fast lookups
- Subject/Topic foreign key indexes
- Full-text search indexes on content
- Composite indexes for common queries

---

## Performance Tips

1. **Database**: PostgreSQL with proper indexes (included in schema)
2. **Caching**: Add Redis for frequently accessed data (future enhancement)
3. **Search**: Full-text search via PostgreSQL LIKE queries (optimized with ILIKE)
4. **Pagination**: Use limit/offset for large result sets
5. **Rate Limiting**: Enabled (100 requests/15 minutes)

---

## Deployment Checklist

Before going to production:

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `JWT_SECRET` (32+ characters)
- [ ] Configure real SMTP for email
- [ ] Enable HTTPS/SSL
- [ ] Set up database backups
- [ ] Configure CORS_ORIGIN for frontend domain
- [ ] Enable rate limiting (already enabled)
- [ ] Set up error logging (e.g., Sentry)
- [ ] Run test suite
- [ ] Load test the application
- [ ] Set up monitoring/alerting

---

## Docker Deployment

### Build Image

```bash
docker build -t pravo-academy-backend:latest .
```

### Run with Docker Compose

```bash
docker-compose up -d
docker-compose logs -f api
```

### Stop Services

```bash
docker-compose down
```

---

## Useful Commands

```bash
# Development
npm run dev              # Start development server
npm run build            # Build TypeScript
npm start                # Start production server

# Database
npm run db:migrate       # Run migrations
npm run db:seed          # Seed sample data
npm run db:reset         # Reset database completely

# Testing (when available)
npm test                 # Run test suite
npm run test:watch       # Watch mode

# Linting
npm run lint             # Check code style
npm run lint:fix         # Fix code style issues
```

---

## API Documentation

- **Full Endpoint List**: See `API_ENDPOINTS.md`
- **Implementation Details**: See `SESSION3_UPDATE.md`
- **Postman Collection**: `POSTMAN_COLLECTION.json`
- **OpenAPI Spec** (coming soon)

---

## Support & Troubleshooting

### Check Server Status

```bash
curl http://localhost:3000/health
```

Response should include:
```json
{
  "status": "ok",
  "environment": "development",
  "timestamp": "2026-08-05T..."
}
```

### View Logs

```bash
# Development logs
npm run dev          # Logs print to console

# With Docker
docker-compose logs -f api

# Check specific error
grep "error" logs/error.log
```

### Reset Everything

```bash
# Stop server
npm stop

# Drop database
dropdb pravo_academy

# Recreate database
createdb pravo_academy
psql -U postgres -d pravo_academy -f src/db/schema.sql

# Restart
npm run dev
```

---

## Next Steps

1. **Test all endpoints** using Postman collection
2. **Create sample data** using bulk flashcard endpoint
3. **Generate study plan** for a test user
4. **Run full test suite** (when available)
5. **Deploy to staging** environment
6. **Connect frontend** to these API endpoints

---

**Ready to build! 🚀**

Questions? Check the full documentation in:
- `DEVELOPER_GUIDE.md` - Architecture overview
- `API_ENDPOINTS.md` - Complete endpoint reference
- `SESSION3_UPDATE.md` - Latest implementation details
