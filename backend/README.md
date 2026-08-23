# Pravo Academy Backend API

Professional legal education platform backend API built with Node.js, Express, and PostgreSQL.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Docker (optional)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd pravo-academy-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment**
```bash
cp .env.example .env
```

Edit `.env` with your database credentials.

4. **Create database**
```bash
createdb pravo_academy
```

5. **Run migrations**
```bash
psql -U postgres -d pravo_academy -f src/db/schema.sql
```

6. **Start development server**
```bash
npm run dev
```

Server runs at `http://localhost:3000`

## 🐳 Docker Setup

```bash
# Build and run with Docker Compose
docker-compose up --build

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication
All protected endpoints require JWT token in Authorization header:
```
Authorization: Bearer <token>
```

### Response Format
All responses follow this format:
```json
{
  "success": true/false,
  "data": {},
  "message": "Optional message",
  "error": "Optional error",
  "timestamp": "2024-08-05T12:00:00Z"
}
```

## 🔑 Auth Endpoints

### Register
```
POST /api/auth/register
Body: { email, password, name }
```

### Login
```
POST /api/auth/login
Body: { email, password }
```

### Get Current User
```
GET /api/auth/user
Headers: { Authorization: Bearer <token> }
```

### Change Password
```
POST /api/auth/change-password
Headers: { Authorization: Bearer <token> }
Body: { current_password, new_password }
```

## 📖 Main Modules

### Subjects
```
GET /api/subjects                    # List all subjects
GET /api/subjects/:id                # Get subject with topics
GET /api/subjects/:id/progress      # Get user progress for subject
```

### Flashcards
```
GET /api/flashcards                  # List flashcards (filters: subject_id, topic_id, difficulty)
GET /api/flashcards/:id              # Get specific flashcard
POST /api/flashcards                 # Create flashcard (admin)
POST /api/flashcards/bulk            # Bulk create flashcards (admin)
```

### Quiz
```
GET /api/quiz/subject/:subject_id    # Get quizzes for subject
GET /api/quiz/:id/questions          # Get quiz questions
POST /api/quiz/submit                # Submit answers
GET /api/quiz/:id/results            # Get user results
```

### Conspects
```
GET /api/conspects                   # List conspects (filter: subject_id)
GET /api/conspects/:id               # Get full conspect with content
```

### Lectures
```
GET /api/lectures                    # List lectures (filter: subject_id)
GET /api/lectures/:id                # Get lecture details
GET /api/lectures/:id/chapters       # Get lecture chapters
```

### Cases
```
GET /api/cases                       # List cases (filters: subject_id, topic_id)
GET /api/cases/:id                   # Get case details
```

### Progress
```
GET /api/progress                    # List user progress (filter: content_type)
GET /api/progress/dashboard          # Get dashboard statistics
POST /api/progress/:type/:id         # Mark content as complete/in-progress
GET /api/progress/study-plan         # Get personalized study plan
PUT /api/progress/study-plan         # Update study plan
```

### User
```
GET /api/user/profile                # Get user profile
PUT /api/user/profile                # Update profile
PUT /api/user/preferences            # Update preferences (theme, language)
```

### Notifications
```
GET /api/notifications               # List user notifications
POST /api/notifications/:id/read     # Mark as read
POST /api/notifications/email/subscribe
DELETE /api/notifications/email/unsubscribe
```

## 🗄️ Database Schema

### Core Tables
- `users` - User accounts and preferences
- `subjects` - Legal subjects/courses
- `topics` - Topics within subjects
- `flashcards` - Study flashcards
- `quizzes` - Quiz collections
- `quiz_questions` - Individual questions
- `conspects` - Study materials
- `lectures` - Video lectures
- `cases` - Legal cases
- `progress` - User progress tracking
- `quiz_results` - Quiz submission results
- `study_plans` - Personalized study plans
- `study_plan_tasks` - Tasks in study plans
- `notifications` - User notifications
- `exam_calendar` - User exam dates

## 🔒 Security Features

- JWT authentication with 24-hour expiration
- Password hashing with bcryptjs
- CORS protection
- Rate limiting (100 requests per 15 minutes)
- SQL injection prevention via parameterized queries
- XSS protection via Helmet
- Input validation on all endpoints

## 📊 Performance Optimization

- Database indexes on frequently queried fields
- Connection pooling with pg-promise
- Lazy loading support for large datasets
- Pagination on all list endpoints
- Efficient JSON storage for nested data

## 🛠️ Development

### Scripts
```bash
npm run dev        # Start development server
npm run build      # Compile TypeScript
npm run start      # Run production build
npm run migrate    # Run migrations
npm run test       # Run tests
npm run lint       # Run ESLint
npm run format     # Format code with Prettier
```

### Project Structure
```
src/
├── index.ts              # Application entry point
├── config.ts             # Configuration management
├── types/               # TypeScript types and interfaces
├── db/                  # Database connection and schema
├── middleware/          # Express middleware
│   ├── auth.ts         # Authentication middleware
│   ├── errorHandler.ts # Error handling
│   └── requestLogger.ts
├── services/           # Business logic
│   └── authService.ts
└── routes/            # API endpoints
    ├── auth.ts
    ├── subjects.ts
    ├── flashcards.ts
    ├── quiz.ts
    ├── conspects.ts
    ├── lectures.ts
    ├── cases.ts
    ├── progress.ts
    ├── user.ts
    └── notifications.ts
```

## 🚦 Development Roadmap

### Phase 1: MVP (Foundation)
- ✅ Auth system
- ✅ Basic CRUD operations
- ✅ Progress tracking
- ✅ API structure

### Phase 2: Enhancement
- [ ] Email notifications
- [ ] Advanced analytics
- [ ] Study plan algorithm
- [ ] Image upload to S3

### Phase 3: Premium
- [ ] AI personalization
- [ ] Live sessions
- [ ] Mentoring system
- [ ] Forum/Comments

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run tests and linting
4. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 📧 Support

For issues or questions, contact: support@pravo-academy.bg
