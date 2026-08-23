# Pravo Academy Backend - Complete API Reference

**API Base URL**: `http://localhost:3000/api`

**Authentication**: Bearer token in Authorization header for protected routes

---

## 📋 Table of Contents
1. [Authentication](#authentication)
2. [Subjects & Topics](#subjects--topics)
3. [Flashcards](#flashcards)
4. [Quizzes](#quizzes)
5. [Conspects](#conspects)
6. [Lectures](#lectures)
7. [Cases](#cases)
8. [Progress & Tracking](#progress--tracking)
9. [Study Plans](#study-plans)
10. [Notifications](#notifications)
11. [Search](#search)
12. [User Management](#user-management)
13. [Admin](#admin)

---

## Authentication

### Register
```
POST /auth/register
Body: {
  "email": "user@example.com",
  "password": "Password123",
  "first_name": "John",
  "last_name": "Doe"
}
Response: { "user_id": "uuid", "token": "jwt_token" }
```

### Login
```
POST /auth/login
Body: {
  "email": "user@example.com",
  "password": "Password123"
}
Response: { "user_id": "uuid", "token": "jwt_token" }
```

### Change Password
```
POST /auth/change-password
Authorization: Bearer {token}
Body: {
  "current_password": "OldPassword123",
  "new_password": "NewPassword123"
}
Response: { "message": "Password changed" }
```

### Request Password Reset
```
POST /auth/forgot-password
Body: { "email": "user@example.com" }
Response: { "message": "Reset link sent" }
```

### Reset Password
```
POST /auth/reset-password
Body: {
  "token": "reset_token",
  "new_password": "NewPassword123"
}
Response: { "message": "Password reset" }
```

---

## Subjects & Topics

### List Subjects
```
GET /subjects
Query: limit=20, offset=0
Response: {
  "data": [{ "id": "uuid", "title": "...", "description": "..." }],
  "pagination": { "limit": 20, "offset": 0, "total": 45 }
}
```

### Get Subject
```
GET /subjects/:id
Response: {
  "data": { "id": "uuid", "title": "...", "description": "..." }
}
```

### List Topics
```
GET /subjects/:subject_id/topics
Query: limit=20, offset=0
Response: {
  "data": [{ "id": "uuid", "subject_id": "...", "title": "..." }],
  "pagination": { ... }
}
```

### Get Topic
```
GET /subjects/:subject_id/topics/:topic_id
Response: { "data": { "id": "uuid", "title": "..." } }
```

---

## Flashcards

### List Flashcards
```
GET /flashcards
Query: subject_id=uuid, topic_id=uuid, difficulty=medium, limit=20, offset=0
Response: {
  "data": [
    {
      "id": "uuid",
      "subject_id": "uuid",
      "question": "What is...",
      "answer": "...",
      "difficulty": "medium",
      "created_at": "2026-08-05T..."
    }
  ],
  "pagination": { ... }
}
```

### Get Flashcard
```
GET /flashcards/:id
Response: {
  "data": {
    "id": "uuid",
    "subject_id": "uuid",
    "question": "...",
    "answer": "...",
    "difficulty": "medium"
  }
}
```

### Create Flashcard (Admin)
```
POST /flashcards
Authorization: Bearer {admin-token}
Body: {
  "subject_id": "uuid",
  "topic_id": "uuid (optional)",
  "question": "What is...",
  "answer": "Long answer...",
  "difficulty": "easy|medium|hard"
}
Response: { "data": { "id": "uuid" }, "message": "Flashcard created" }
```

### Create Flashcards (Bulk, Admin)
```
POST /flashcards/bulk
Authorization: Bearer {admin-token}
Body: {
  "flashcards": [
    { "subject_id": "uuid", "question": "Q1", "answer": "A1", "difficulty": "medium" },
    { "subject_id": "uuid", "question": "Q2", "answer": "A2", "difficulty": "hard" }
  ]
}
Response: { "data": { "created_count": 2, "ids": ["uuid1", "uuid2"] } }
```

### Update Flashcard (Admin)
```
PUT /flashcards/:id
Authorization: Bearer {admin-token}
Body: {
  "question": "Updated question (optional)",
  "answer": "Updated answer (optional)",
  "difficulty": "hard (optional)",
  "topic_id": "uuid (optional)"
}
Response: { "message": "Flashcard updated" }
```

### Delete Flashcard (Admin)
```
DELETE /flashcards/:id
Authorization: Bearer {admin-token}
Response: { "message": "Flashcard deleted" }
```

---

## Quizzes

### List Quizzes
```
GET /quiz
Query: subject_id=uuid, limit=20, offset=0
Response: {
  "data": [
    {
      "id": "uuid",
      "subject_id": "uuid",
      "title": "...",
      "description": "...",
      "question_count": 10,
      "created_at": "..."
    }
  ],
  "pagination": { ... }
}
```

### Get Quiz with Questions
```
GET /quiz/:id
Response: {
  "data": {
    "id": "uuid",
    "title": "...",
    "questions": [
      {
        "id": "uuid",
        "question": "...",
        "option_a": "...",
        "option_b": "...",
        "option_c": "...",
        "option_d": "..."
      }
    ]
  }
}
```

### Submit Quiz
```
POST /quiz/submit
Authorization: Bearer {token}
Body: {
  "quiz_id": "uuid",
  "answers": {
    "question_1": "A",
    "question_2": "B",
    "question_3": "C"
  }
}
Response: {
  "data": {
    "score": 75,
    "percentage": 75,
    "correct_count": 3,
    "wrong_count": 1,
    "detailed_results": [
      {
        "question_id": "uuid",
        "your_answer": "A",
        "correct_answer": "A",
        "correct": true,
        "explanation": "..."
      }
    ]
  }
}
```

### Get Quiz Result
```
GET /quiz/:id/results
Authorization: Bearer {token}
Response: {
  "data": {
    "quiz_id": "uuid",
    "score": 75,
    "percentage": 75,
    "took_at": "2026-08-05T...",
    "detailed_results": [...]
  }
}
```

### Get Quiz History
```
GET /quiz/history
Authorization: Bearer {token}
Query: limit=20, offset=0
Response: {
  "data": [
    {
      "id": "uuid",
      "quiz_id": "uuid",
      "score": 85,
      "percentage": 85,
      "took_at": "2026-08-05T..."
    }
  ],
  "pagination": { ... }
}
```

### Get Quiz Statistics
```
GET /quiz/stats
Authorization: Bearer {token}
Response: {
  "data": {
    "total_quizzes": 10,
    "average_score": 78.5,
    "best_score": 95,
    "pass_count": 8,
    "fail_count": 2,
    "pass_rate": 80
  }
}
```

### Create Quiz (Admin)
```
POST /admin/quizzes
Authorization: Bearer {admin-token}
Body: {
  "subject_id": "uuid",
  "title": "Quiz Title",
  "description": "Quiz description"
}
Response: { "data": { "id": "uuid" }, "message": "Quiz created" }
```

### Add Quiz Question (Admin)
```
POST /admin/quiz-questions
Authorization: Bearer {admin-token}
Body: {
  "quiz_id": "uuid",
  "question": "What is...",
  "option_a": "Option A",
  "option_b": "Option B",
  "option_c": "Option C",
  "option_d": "Option D",
  "correct_answer": "A",
  "explanation": "The answer is A because..."
}
Response: { "data": { "id": "uuid" }, "message": "Question added" }
```

---

## Conspects

### List Conspects
```
GET /conspects
Query: subject_id=uuid, limit=20, offset=0
Response: {
  "data": [
    {
      "id": "uuid",
      "subject_id": "uuid",
      "title": "...",
      "created_at": "..."
    }
  ],
  "pagination": { ... }
}
```

### Get Conspect
```
GET /conspects/:id
Response: {
  "data": {
    "id": "uuid",
    "subject_id": "uuid",
    "title": "...",
    "content": "...",
    "toc": { "chapters": [...] }
  }
}
```

### Create Conspect (Admin)
```
POST /admin/conspects
Authorization: Bearer {admin-token}
Body: {
  "subject_id": "uuid",
  "title": "Conspect Title",
  "content": "Long content here...",
  "toc": { "chapters": [...] }
}
Response: { "data": { "id": "uuid" } }
```

---

## Lectures

### List Lectures
```
GET /lectures
Query: subject_id=uuid, limit=20, offset=0
Response: {
  "data": [
    {
      "id": "uuid",
      "subject_id": "uuid",
      "title": "...",
      "youtube_url": "...",
      "duration": 45,
      "description": "..."
    }
  ],
  "pagination": { ... }
}
```

### Get Lecture
```
GET /lectures/:id
Response: {
  "data": {
    "id": "uuid",
    "subject_id": "uuid",
    "title": "...",
    "youtube_url": "...",
    "duration": 45,
    "chapters": [
      { "title": "Introduction", "timestamp": 0 },
      { "title": "Main content", "timestamp": 300 }
    ],
    "description": "..."
  }
}
```

### Get Lecture Chapters
```
GET /lectures/:id/chapters
Response: {
  "data": [
    { "title": "Introduction", "timestamp": 0 },
    { "title": "Main content", "timestamp": 300 }
  ]
}
```

### Create Lecture (Admin)
```
POST /admin/lectures
Authorization: Bearer {admin-token}
Body: {
  "subject_id": "uuid",
  "title": "Lecture Title",
  "youtube_url": "https://youtube.com/watch?v=...",
  "duration": 45,
  "chapters": [
    { "title": "Chapter 1", "timestamp": 0 },
    { "title": "Chapter 2", "timestamp": 300 }
  ],
  "description": "Lecture description"
}
Response: { "data": { "id": "uuid" } }
```

### Update Lecture (Admin)
```
PUT /lectures/:id
Authorization: Bearer {admin-token}
Body: {
  "title": "New title (optional)",
  "youtube_url": "new_url (optional)",
  "duration": 60,
  "description": "Updated description"
}
Response: { "message": "Lecture updated" }
```

### Update Lecture Chapters (Admin)
```
PUT /lectures/:id/chapters
Authorization: Bearer {admin-token}
Body: {
  "chapters": [
    { "title": "New Chapter 1", "timestamp": 0 },
    { "title": "New Chapter 2", "timestamp": 400 }
  ]
}
Response: { "message": "Lecture chapters updated" }
```

### Delete Lecture (Admin)
```
DELETE /lectures/:id
Authorization: Bearer {admin-token}
Response: { "message": "Lecture deleted" }
```

---

## Cases

### List Cases
```
GET /cases
Query: subject_id=uuid, topic_id=uuid, court=supreme, year=2020, limit=20, offset=0
Response: {
  "data": [
    {
      "id": "uuid",
      "subject_id": "uuid",
      "title": "...",
      "court": "Supreme Court",
      "year": 2020
    }
  ],
  "pagination": { ... }
}
```

### Get Case
```
GET /cases/:id
Response: {
  "data": {
    "id": "uuid",
    "subject_id": "uuid",
    "title": "...",
    "facts": "...",
    "legal_question": "...",
    "decision": "...",
    "analysis": "...",
    "references": [...],
    "court": "Supreme Court",
    "year": 2020
  }
}
```

### Create Case (Admin)
```
POST /admin/cases
Authorization: Bearer {admin-token}
Body: {
  "subject_id": "uuid",
  "topic_id": "uuid (optional)",
  "title": "Case Title",
  "facts": "Case facts...",
  "legal_question": "What is the legal issue?",
  "decision": "The court decided...",
  "analysis": "Analysis of the decision",
  "references": ["ref1", "ref2"],
  "court": "Supreme Court",
  "year": 2020
}
Response: { "data": { "id": "uuid" } }
```

### Update Case (Admin)
```
PUT /cases/:id
Authorization: Bearer {admin-token}
Body: {
  "title": "New title (optional)",
  "facts": "Updated facts",
  "decision": "Updated decision",
  "court": "New court (optional)",
  "year": 2021
}
Response: { "message": "Case updated" }
```

### Delete Case (Admin)
```
DELETE /cases/:id
Authorization: Bearer {admin-token}
Response: { "message": "Case deleted" }
```

---

## Progress & Tracking

### Update Progress
```
POST /progress/:content_type/:content_id
Authorization: Bearer {token}
Body: {
  "status": "completed|in_progress|not_started",
  "score": 85 (optional, for quizzes/tests)
}
Response: {
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "content_id": "uuid",
    "status": "completed",
    "completed_at": "2026-08-05T..."
  }
}
```

### Get Dashboard Statistics
```
GET /progress/dashboard
Authorization: Bearer {token}
Response: {
  "data": {
    "subjects_progress": {
      "subject_uuid_1": 75,
      "subject_uuid_2": 85
    },
    "total_completion": 72,
    "items_this_week": 15,
    "current_streak": 5,
    "next_exam": {
      "subject_id": "uuid",
      "title": "Constitutional Law",
      "exam_date": "2026-09-15",
      "days_remaining": 41
    }
  }
}
```

### Get Subject Progress
```
GET /progress/subject/:subject_id
Authorization: Bearer {token}
Response: {
  "data": {
    "subject_id": "uuid",
    "subject_title": "...",
    "completion_percentage": 75,
    "breakdown": {
      "flashcards": { "completed": 50, "total": 60, "percentage": 83 },
      "quizzes": { "completed": 3, "total": 4, "percentage": 75 },
      "lectures": { "completed": 5, "total": 6, "percentage": 83 },
      "cases": { "completed": 8, "total": 10, "percentage": 80 }
    }
  }
}
```

---

## Study Plans

### Generate Study Plan
```
POST /progress/study-plan/generate
Authorization: Bearer {token}
Body: {
  "exam_date": "2026-09-15",
  "subject_ids": ["uuid1", "uuid2"] (optional)
}
Response: { "data": { "plan_id": "uuid" }, "message": "Study plan generated" }
```

### Get Study Plan
```
GET /progress/study-plan
Authorization: Bearer {token}
Response: {
  "data": {
    "id": "uuid",
    "exam_date": "2026-09-15",
    "created_at": "2026-08-05T...",
    "days": [
      {
        "date": "2026-08-06",
        "tasks": [
          {
            "id": "uuid",
            "title": "Flashcard: What is...",
            "status": "upcoming",
            "content_type": "flashcard",
            "content_id": "uuid",
            "estimated_hours": 0.25
          }
        ],
        "total_hours": 4.5,
        "completed_count": 0,
        "total_count": 18
      }
    ]
  }
}
```

### Get Today's Focus
```
GET /progress/study-plan/today/focus
Authorization: Bearer {token}
Response: {
  "data": {
    "focus_task": {
      "id": "uuid",
      "title": "...",
      "status": "upcoming",
      "estimated_hours": 0.25
    },
    "all_today": [...],
    "completed_today": 0,
    "total_today": 6
  }
}
```

### Get Study Plan Statistics
```
GET /progress/study-plan/stats
Authorization: Bearer {token}
Response: {
  "data": {
    "total_tasks": 150,
    "completed_tasks": 35,
    "in_progress_tasks": 5,
    "total_hours": 300,
    "hours_completed": 80,
    "completion_percentage": 23
  }
}
```

### Reschedule Task
```
PUT /progress/study-plan/task/:task_id/reschedule
Authorization: Bearer {token}
Body: {
  "new_date": "2026-08-10"
}
Response: { "message": "Task rescheduled successfully" }
```

---

## Notifications

### List Notifications
```
GET /notifications
Authorization: Bearer {token}
Query: limit=20, offset=0
Response: {
  "data": [
    {
      "id": "uuid",
      "type": "quiz_reminder|exam_countdown|achievement|weekly_report|study_reminder",
      "title": "...",
      "message": "...",
      "scheduled_at": "2026-08-05T...",
      "sent_at": "2026-08-05T..."
    }
  ],
  "pagination": { ... }
}
```

### Get Pending Notifications
```
GET /notifications/pending
Authorization: Bearer {token}
Query: limit=10
Response: {
  "data": [
    {
      "id": "uuid",
      "type": "exam_countdown",
      "title": "Exam in 7 days",
      "message": "..."
    }
  ]
}
```

### Get Achievements
```
GET /notifications/achievements
Authorization: Bearer {token}
Response: {
  "data": [
    {
      "id": "uuid",
      "title": "Achievement: Week Warrior",
      "message": "Maintained a 7-day study streak!",
      "created_at": "2026-08-05T..."
    }
  ]
}
```

### Delete Notification
```
DELETE /notifications/:id
Authorization: Bearer {token}
Response: { "message": "Notification deleted" }
```

### Delete All Notifications
```
DELETE /notifications
Authorization: Bearer {token}
Response: { "message": "150 notifications deleted" }
```

### Get Notification Preferences
```
GET /notifications/preferences
Authorization: Bearer {token}
Response: {
  "data": {
    "email_quiz_reminders": true,
    "email_exam_countdowns": true,
    "email_weekly_reports": true,
    "email_achievements": true
  }
}
```

### Update Notification Preferences
```
PUT /notifications/preferences
Authorization: Bearer {token}
Body: {
  "email_quiz_reminders": true,
  "email_exam_countdowns": false,
  "email_weekly_reports": true,
  "email_achievements": true
}
Response: { "message": "Notification preferences updated" }
```

### Check for Achievements
```
POST /notifications/check-achievements
Authorization: Bearer {token}
Response: {
  "data": {
    "achievements": [
      { "name": "Week Warrior", "description": "Maintained a 7-day study streak!" }
    ],
    "count": 1
  },
  "message": "1 new achievement(s) unlocked!"
}
```

### Schedule Exam Countdown
```
POST /notifications/schedule-exam-countdown
Authorization: Bearer {token}
Body: {
  "subject_id": "uuid",
  "exam_date": "2026-09-15"
}
Response: { "message": "Exam countdown scheduled" }
```

### Schedule Weekly Report
```
POST /notifications/schedule-weekly-report
Authorization: Bearer {token}
Response: { "message": "Weekly report scheduled" }
```

### Schedule Study Reminder
```
POST /notifications/schedule-study-reminder
Authorization: Bearer {token}
Response: { "message": "Study reminder scheduled" }
```

---

## Search

### Global Search
```
GET /search?q=constitutional+law&limit=20&offset=0
Response: {
  "data": [
    {
      "id": "uuid",
      "type": "case|flashcard|lecture|conspect",
      "title": "...",
      "snippet": "First 100 characters...",
      "subject_id": "uuid",
      "relevance_score": 4,
      "created_at": "2026-08-05T..."
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "count": 15 }
}
```

### Search Flashcards
```
GET /search/flashcards?q=contract&subject_id=uuid&difficulty=medium&limit=10
Response: {
  "data": [
    {
      "id": "uuid",
      "subject_id": "uuid",
      "question": "What is contract...",
      "answer": "...",
      "difficulty": "medium"
    }
  ],
  "pagination": { ... }
}
```

### Search Cases
```
GET /search/cases?q=liability&court=supreme&year_from=2000&year_to=2020
Response: {
  "data": [
    {
      "id": "uuid",
      "subject_id": "uuid",
      "title": "...",
      "facts": "...",
      "court": "Supreme Court",
      "year": 2015
    }
  ],
  "pagination": { ... }
}
```

### Search Conspects
```
GET /search/conspects?q=criminal+procedure&subject_id=uuid
Response: {
  "data": [
    {
      "id": "uuid",
      "subject_id": "uuid",
      "title": "...",
      "preview": "First 200 characters..."
    }
  ],
  "pagination": { ... }
}
```

### Search Lectures
```
GET /search/lectures?q=tort+law&subject_id=uuid
Response: {
  "data": [
    {
      "id": "uuid",
      "subject_id": "uuid",
      "title": "...",
      "description": "...",
      "duration": 45
    }
  ],
  "pagination": { ... }
}
```

### Get Search Suggestions
```
GET /search/suggestions?q=con&limit=10
Response: {
  "data": [
    "constitutional law",
    "consumer protection",
    "contracts basics"
  ]
}
```

### Advanced Search
```
POST /search/advanced
Body: {
  "query": "liability",
  "type": "case|flashcard|lecture|conspect|all",
  "subject_id": "uuid (optional)",
  "difficulty": "easy|medium|hard (optional)",
  "court": "Supreme Court (optional)",
  "year_from": 2000,
  "year_to": 2020,
  "limit": 20,
  "offset": 0
}
Response: {
  "data": [
    {
      "id": "uuid",
      "type": "case",
      "title": "...",
      "snippet": "..."
    }
  ],
  "pagination": { ... }
}
```

---

## User Management

### Get User Profile
```
GET /user/profile
Authorization: Bearer {token}
Response: {
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "role": "student|teacher|admin",
    "created_at": "2026-08-01T...",
    "updated_at": "2026-08-05T..."
  }
}
```

### Update User Profile
```
PUT /user/profile
Authorization: Bearer {token}
Body: {
  "first_name": "Jonathan (optional)",
  "last_name": "Smith (optional)",
  "email": "newemail@example.com (optional)"
}
Response: { "message": "Profile updated" }
```

### Get User Progress
```
GET /user/progress
Authorization: Bearer {token}
Query: content_type=flashcard, limit=20, offset=0
Response: {
  "data": [
    {
      "id": "uuid",
      "content_id": "uuid",
      "content_type": "flashcard",
      "status": "completed",
      "completed_at": "2026-08-05T..."
    }
  ],
  "pagination": { ... }
}
```

---

## Admin

### Platform Statistics
```
GET /admin/statistics
Authorization: Bearer {admin-token}
Response: {
  "data": {
    "users": {
      "total": 150,
      "active_this_week": 85
    },
    "content": {
      "subjects": 10,
      "flashcards": 5000,
      "quizzes": 200,
      "cases": 500
    },
    "performance": {
      "average_quiz_score": 75
    }
  }
}
```

### Bulk Create Flashcards
```
POST /admin/flashcards/bulk
Authorization: Bearer {admin-token}
Body: {
  "flashcards": [
    { "subject_id": "uuid", "question": "Q1", "answer": "A1", "difficulty": "medium" },
    { "subject_id": "uuid", "question": "Q2", "answer": "A2", "difficulty": "hard" }
  ]
}
Response: { "data": { "created_count": 2, "ids": [...] } }
```

### Schedule Exam
```
POST /admin/exam-calendar
Authorization: Bearer {token}
Body: {
  "subject_id": "uuid",
  "exam_date": "2026-09-15",
  "exam_type": "midterm|final (optional)"
}
Response: { "data": { "id": "uuid" }, "message": "Exam scheduled" }
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "BadRequest|NotFound|Unauthorized|Forbidden|InternalServerError",
  "message": "Human-readable error message",
  "timestamp": "2026-08-05T12:34:56.000Z"
}
```

### Common Status Codes
- `200 OK` - Successful GET/PUT
- `201 Created` - Successful POST
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing/invalid token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource doesn't exist
- `500 Internal Server Error` - Server error

---

## Rate Limiting

All API endpoints are rate-limited to:
- **100 requests per 15 minutes per IP address**

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1628185200
```

---

## Pagination

List endpoints support pagination:
- `limit`: Number of results (default: 20, max: 100)
- `offset`: Number of results to skip (default: 0)

Response includes:
```json
{
  "data": [...],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 150
  }
}
```

---

**API Documentation Last Updated**: August 5, 2026
**Total Endpoints**: 100+
**Production Status**: Ready for MVP
