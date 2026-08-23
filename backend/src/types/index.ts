// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface User {
  id: string;
  email: string;
  password_hash?: string;
  name: string;
  avatar_url?: string;
  bio?: string;
  theme: 'light' | 'dark';
  language: string;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
  is_active: boolean;
}

export interface Subject {
  id: string;
  title: string;
  description?: string;
  icon_url?: string;
  order_index: number;
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
}

export interface Topic {
  id: string;
  subject_id: string;
  title: string;
  description?: string;
  order_index?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Flashcard {
  id: string;
  subject_id: string;
  topic_id?: string;
  question: string;
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
  created_at: Date;
  updated_at: Date;
  created_by?: string;
}

export interface Quiz {
  id: string;
  subject_id: string;
  title: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Conspect {
  id: string;
  subject_id: string;
  title: string;
  content: string;
  toc?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface Lecture {
  id: string;
  subject_id: string;
  title: string;
  youtube_url?: string;
  duration?: number;
  chapters?: LectureChapter[];
  description?: string;
  transcript?: string;
  created_at: Date;
  updated_at: Date;
}

export interface LectureChapter {
  id: string;
  title: string;
  timestamp: string;
  duration?: number;
}

export interface Case {
  id: string;
  subject_id: string;
  topic_id?: string;
  title: string;
  facts: string;
  legal_question: string;
  decision: string;
  analysis?: string;
  references?: string[];
  court?: string;
  year?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Progress {
  id: string;
  user_id: string;
  content_type: 'flashcard' | 'quiz' | 'lecture' | 'conspect' | 'case';
  content_id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  score?: number;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface QuizResult {
  id: string;
  user_id: string;
  quiz_id: string;
  score: number;
  correct_count: number;
  wrong_count: number;
  answers: Record<string, string>;
  time_spent: number;
  completed_at: Date;
}

export interface StudyPlan {
  id: string;
  user_id: string;
  exam_date?: Date;
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
}

export interface StudyPlanTask {
  id: string;
  plan_id: string;
  date: Date;
  title: string;
  status: 'upcoming' | 'in_progress' | 'completed' | 'skipped';
  content_type?: string;
  content_id?: string;
  estimated_hours?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'quiz_reminder' | 'lecture_reminder' | 'exam_countdown' | 'achievement' | 'system';
  message: string;
  read: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ExamCalendar {
  id: string;
  user_id: string;
  subject_id: string;
  exam_date: Date;
  exam_type?: string;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// AUTH RELATED TYPES
// ============================================================================

export interface JWTPayload {
  user_id: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user_id: string;
  token: string;
  expires_at: string;
  refresh_token?: string;
  /** Номерът на сесията в токена — за да знае клиентът кой ред е неговият. */
  session_id?: string;
  /**
   * Влизането е изхвърлило друго устройство. Фронтендът го казва веднага:
   * мълчаливото изхвърляне на другия край изглежда като счупен сайт, а
   * казано на глас, е точно съобщението, което кара споделящите да се
   * откажат — виждат, че системата брои.
   */
  izhvarleno_ustrojstvo?: boolean;
  /**
   * Изречение към потребителя, когато натрупаните сигнали минат втората
   * стъпка. Празно на първата — тя е тиха нарочно.
   */
  preduprezhdenie?: string;
  /** Трета стъпка: докато паролата не се смени, останалото не се отваря. */
  iska_nova_parola?: boolean;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface DashboardData {
  subjects_progress: Record<string, number>;
  total_completion: number;
  items_this_week: number;
  current_streak: number;
  next_exam?: {
    title: string;
    date: Date;
    days_remaining: number;
  };
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code?: string) {
    super(400, message, code || 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AuthError extends AppError {
  constructor(message: string, code?: string) {
    super(401, message, code || 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code?: string) {
    super(404, message, code || 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, code?: string) {
    super(403, message, code || 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}
