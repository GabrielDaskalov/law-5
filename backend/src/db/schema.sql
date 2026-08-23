-- ============================================================================
-- PRAVO ACADEMY - DATABASE SCHEMA
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(500),
  bio TEXT,
  theme VARCHAR(20) DEFAULT 'light',
  language VARCHAR(10) DEFAULT 'bg',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- ============================================================================
-- 2. SUBJECTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  icon_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  order_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_subjects_order ON subjects(order_index);

-- ============================================================================
-- 3. TOPICS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  order_index INT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_topics_subject_id ON topics(subject_id);
CREATE INDEX idx_topics_order ON topics(subject_id, order_index);

-- ============================================================================
-- 4. FLASHCARDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS flashcards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  difficulty VARCHAR(20) DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_flashcards_subject ON flashcards(subject_id);
CREATE INDEX idx_flashcards_topic ON flashcards(topic_id);
CREATE INDEX idx_flashcards_difficulty ON flashcards(difficulty);

-- ============================================================================
-- 5. QUIZZES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quizzes_subject ON quizzes(subject_id);

-- ============================================================================
-- 6. QUIZ QUESTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
  explanation TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quiz_questions_quiz ON quiz_questions(quiz_id);

-- ============================================================================
-- 7. CONSPECTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS conspects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  toc JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conspects_subject ON conspects(subject_id);

-- ============================================================================
-- 8. LECTURES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS lectures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  youtube_url VARCHAR(500),
  duration INT,
  chapters JSONB,
  description TEXT,
  transcript TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_lectures_subject ON lectures(subject_id);

-- ============================================================================
-- 9. CASES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  facts TEXT NOT NULL,
  legal_question TEXT NOT NULL,
  decision TEXT NOT NULL,
  analysis TEXT,
  "references" JSONB,  -- quoted: reserved SQL keyword
  court VARCHAR(255),
  year INT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cases_subject ON cases(subject_id);
CREATE INDEX idx_cases_topic ON cases(topic_id);
CREATE INDEX idx_cases_year ON cases(year);

-- ============================================================================
-- 10. PROGRESS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('flashcard', 'quiz', 'lecture', 'conspect', 'case')),
  content_id UUID NOT NULL,
  status VARCHAR(50) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  score INT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, content_type, content_id)
);

CREATE INDEX idx_progress_user_id ON progress(user_id);
CREATE INDEX idx_progress_content ON progress(content_type, content_id);
CREATE INDEX idx_progress_status ON progress(status);

-- ============================================================================
-- 11. QUIZ RESULTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS quiz_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  score INT NOT NULL,
  correct_count INT,
  wrong_count INT,
  answers JSONB,
  time_spent INT,
  completed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quiz_results_user ON quiz_results(user_id);
CREATE INDEX idx_quiz_results_quiz ON quiz_results(quiz_id);
CREATE INDEX idx_quiz_results_completed ON quiz_results(completed_at);

-- ============================================================================
-- 12. STUDY PLANS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS study_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_study_plans_user ON study_plans(user_id);

-- ============================================================================
-- 13. STUDY PLAN TASKS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS study_plan_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'completed', 'skipped')),
  content_type VARCHAR(50),
  content_id UUID,
  estimated_hours NUMERIC(3,1),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_study_plan_tasks_date ON study_plan_tasks(date);
CREATE INDEX idx_study_plan_tasks_plan ON study_plan_tasks(plan_id);
CREATE INDEX idx_study_plan_tasks_status ON study_plan_tasks(status);

-- ============================================================================
-- 14. NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('quiz_reminder', 'lecture_reminder', 'exam_countdown', 'achievement', 'system')),
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- ============================================================================
-- 15. EXAM CALENDAR TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS exam_calendar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_date DATE NOT NULL,
  exam_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_exam_calendar_user ON exam_calendar(user_id);
CREATE INDEX idx_exam_calendar_subject ON exam_calendar(subject_id);
CREATE INDEX idx_exam_calendar_date ON exam_calendar(exam_date);

-- ============================================================================
-- 16. PASSWORD RESET TOKENS TABLE
--
-- ВАЖНО: колоната `token` НЕ пази токена, а SHA-256 хеша му (64 знака hex).
-- Токенът в чист вид съществува само в имейла на потребителя. Така копие на
-- базата (дъмп, бекъп, достъп на трето лице) не дава на никого възможност да
-- смени чужда парола. Виж AuthService.hashResetToken.
-- Срокът на живот е 1 час — задава се от приложението в `expires_at`.
-- ============================================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL, -- SHA-256 хеш на токена, не самият токен
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON COLUMN password_reset_tokens.token IS
  'SHA-256 хеш (hex) на токена за нова парола. Оригиналът не се съхранява.';

CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- ============================================================================
-- PERFORMANCE OPTIMIZATION - Additional Indexes
-- ============================================================================
CREATE INDEX idx_subjects_active ON subjects(is_active);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_progress_user_status ON progress(user_id, status);
CREATE INDEX idx_quiz_results_user_completed ON quiz_results(user_id, completed_at);
