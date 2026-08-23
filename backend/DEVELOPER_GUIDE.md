# Pravo Academy Backend - Developer Guide

This is a comprehensive guide for developers continuing the backend development.

## 🎯 Current Status

**Phase**: MVP Foundation
**Backend Completion**: ~40%
**Time Saved**: ~50 hours of scaffolding work

### What's Already Done ✅
- [x] Project structure and dependencies
- [x] TypeScript configuration
- [x] Database schema with 16 tables
- [x] Authentication service (register, login, password reset)
- [x] API route scaffolding (all endpoints)
- [x] Middleware (auth, error handling, logging)
- [x] Docker setup for easy deployment
- [x] Seed data script
- [x] Type definitions (TypeScript)
- [x] Sample Postman collection
- [x] README and documentation

### What Needs Implementation 🚀

#### PRIORITY 1 - CRITICAL (Next Steps)
These are essential for MVP:

1. **Quiz Module - Answer Validation & Scoring**
   - File: `src/routes/quiz.ts` - `POST /quiz/submit`
   - What: Validate submitted answers against correct answers from DB
   - How: Compare answers, calculate score, save results
   - Time: 3-4 hours
   - Notes: Quiz results are critical for progress tracking

2. **Progress Dashboard Statistics**
   - File: `src/routes/progress.ts` - `GET /progress/dashboard`
   - What: Calculate completion percentage per subject, streak days, next exam
   - How: Query progress table and exam_calendar
   - Time: 2-3 hours
   - Notes: Used by frontend dashboard

3. **Input Validation & Error Handling**
   - Implement validation for all POST/PUT endpoints
   - Add proper error responses
   - Use existing `ValidationError` from types
   - Time: 4-5 hours

4. **Progress Update Endpoints**
   - File: `src/routes/progress.ts` - `POST /progress/:type/:id`
   - What: Save when user completes flashcard/lecture/case
   - How: Insert/update progress record
   - Time: 2-3 hours

#### PRIORITY 2 - IMPORTANT (After Priority 1)
These add significant value:

5. **Study Plan Generation**
   - File: `src/routes/progress.ts`
   - Algorithm: Create personalized tasks based on:
     - User exam date
     - Number of subjects/topics
     - Days until exam
     - Current progress
   - Time: 6-8 hours

6. **Email Notifications**
   - Use nodemailer (already in dependencies)
   - Send password reset emails
   - Send quiz reminders
   - Send exam countdown
   - Time: 4-5 hours

7. **Admin Routes for Content Management**
   - Create endpoints for adding:
     - Quizzes and questions
     - Lectures
     - Cases
     - Conspects
   - Add admin authorization middleware
   - Time: 5-6 hours

8. **Full Testing Suite**
   - Unit tests for services
   - Integration tests for routes
   - Use Jest (already configured)
   - Time: 6-8 hours

#### PRIORITY 3 - NICE TO HAVE (Phase 2)
These improve experience:

9. **Search & Filtering**
   - Full-text search for cases and conspects
   - Advanced filtering options
   - Time: 3-4 hours

10. **File Upload to S3**
    - Profile avatar uploads
    - Lecture materials
    - Case documents
    - Time: 4-5 hours

11. **Analytics & Reporting**
    - Track user statistics
    - Generate performance reports
    - Heatmaps of weak areas
    - Time: 5-6 hours

## 📋 Implementation Checklist

### Quiz Module Completion
```typescript
// In POST /quiz/submit, implement:
1. Fetch quiz questions from DB
2. Compare submitted answers with correct_answer field
3. Calculate score: (correct/total) * 100
4. Save QuizResult to database
5. Return score, correct_count, wrong_count, percentage
6. Update user progress record
```

### Progress Dashboard
```typescript
// In GET /progress/dashboard, fetch:
1. Count completed items per subject
2. Calculate total completion % across all subjects
3. Count items completed this week
4. Calculate current study streak (consecutive days)
5. Get next exam from exam_calendar (ORDER BY date)
6. Format and return as dashboard response
```

### Study Plan Algorithm
```typescript
// Basic algorithm:
1. Get exam date from user's study_plan
2. Calculate days_until_exam = exam_date - now
3. Get total_items to study (all active content)
4. Calculate items_per_day = total_items / days_until_exam
5. Distribute tasks evenly across remaining days
6. Prioritize incomplete items first
7. Insert tasks into study_plan_tasks table
```

## 🔍 Key Code Locations

| Task | File | Function |
|------|------|----------|
| Auth logic | `src/services/authService.ts` | Various |
| Quiz scoring | `src/routes/quiz.ts` | POST /submit |
| Dashboard stats | `src/routes/progress.ts` | GET /dashboard |
| Study plan | `src/routes/progress.ts` | GET/PUT study-plan |
| Email | `src/services/emailService.ts` | (Create new) |
| Error handling | `src/middleware/errorHandler.ts` | - |
| DB queries | All `src/routes/*.ts` | - |

## 🛠️ Common Development Tasks

### Add New Database Field
1. Update schema in `src/db/schema.sql`
2. Add type to `src/types/index.ts`
3. Update queries in routes
4. Test with Postman

### Add New API Endpoint
1. Create route in `src/routes/`
2. Use existing pattern (see auth.ts)
3. Add types to `src/types/index.ts`
4. Add to Postman collection
5. Document in README

### Debug Database Queries
```bash
# Connect to postgres
psql -U postgres -d pravo_academy

# Check table structure
\d subjects

# Run queries directly
SELECT * FROM users;

# View indexes
\di
```

### Test API Locally
1. Start server: `npm run dev`
2. Use Postman collection
3. Check console logs for errors
4. Verify database with psql

## 🐛 Debugging Tips

### Common Errors

**"User already exists"**
- Cause: Duplicate email registration
- Fix: Check email uniqueness constraint

**"Invalid or expired token"**
- Cause: JWT token parsing failed
- Fix: Check JWT_SECRET matches between register and verify

**"Column not found"**
- Cause: Schema not created properly
- Fix: Run migrations: `psql -U postgres -d pravo_academy -f src/db/schema.sql`

**"Database connection failed"**
- Cause: PostgreSQL not running or wrong credentials
- Fix: Check DB_HOST, DB_USER, DB_PASSWORD in .env

### Logging
- Check console output in development
- Add `console.log()` for debugging
- Use `requestLogger` middleware to see all requests

## 🧪 Testing Workflow

### Manual Testing
1. Start server: `npm run dev`
2. Use Postman to test endpoints
3. Verify database changes with `psql`
4. Check response format matches spec

### Automated Testing (When Implemented)
```bash
npm run test                 # Run all tests
npm run test -- --watch     # Watch mode
npm run test -- --coverage  # Coverage report
```

## 📊 Database Query Examples

### Get quiz questions for quiz
```sql
SELECT id, question, option_a, option_b, option_c, option_d
FROM quiz_questions
WHERE quiz_id = 'quiz-id'
ORDER BY created_at;
```

### Calculate subject completion
```sql
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done
FROM progress
WHERE user_id = 'user-id'
  AND content_id IN (
    SELECT id FROM flashcards WHERE subject_id = 'subject-id'
  );
```

### Get user's latest quiz results
```sql
SELECT *
FROM quiz_results
WHERE user_id = 'user-id'
ORDER BY completed_at DESC
LIMIT 5;
```

## 🔐 Security Reminders

- ✅ Always validate user input
- ✅ Hash passwords with bcryptjs (already done)
- ✅ Verify JWT tokens (middleware in place)
- ✅ Use parameterized queries (pg-promise does this)
- ✅ Check authorization before sensitive operations
- ✅ Never return password_hash in API responses
- ✅ Rate limiting is configured (100 req/15min)

## 📚 Resources

- [Express.js Docs](https://expressjs.com/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [JWT Introduction](https://jwt.io/introduction)
- [REST API Best Practices](https://restfulapi.net/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🚀 Next Deployment Steps

### For Production
1. Set NODE_ENV=production
2. Update .env with production values
3. Generate new JWT_SECRET
4. Setup PostgreSQL on production server
5. Run migrations on production DB
6. Deploy Docker image or run: `npm install && npm run build && npm start`
7. Setup reverse proxy (nginx)
8. Enable HTTPS
9. Setup monitoring and logging
10. Backup database regularly

### For Docker Deployment
```bash
# Build image
docker build -t pravo-academy-backend .

# Run container
docker run -p 3000:3000 --env-file .env pravo-academy-backend

# Or use docker-compose
docker-compose up -d
```

## 💡 Performance Optimization Ideas

- [ ] Implement caching layer (Redis)
- [ ] Add database connection pooling tuning
- [ ] Optimize frequently-run queries
- [ ] Add pagination to all list endpoints
- [ ] Implement rate limiting per user
- [ ] Add query result caching
- [ ] Use database materialized views for complex calculations

## 📞 Support

For questions about:
- **Architecture**: Check POSTMAN_COLLECTION.json and README.md
- **Database Schema**: See `src/db/schema.sql` with comments
- **Type System**: Check `src/types/index.ts`
- **API Patterns**: Look at existing routes in `src/routes/`

---

**Last Updated**: August 2024
**Backend Version**: 1.0.0 (MVP)
**Estimated Hours Saved**: 50+ hours
