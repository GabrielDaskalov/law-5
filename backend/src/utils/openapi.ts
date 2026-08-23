/**
 * OpenAPI/Swagger Specification Generator
 * Generates OpenAPI 3.0.0 specification for the API
 */

export const generateOpenAPISpec = () => {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Pravo Academy Backend API',
      description: 'Comprehensive REST API for online legal education platform',
      version: '1.0.0',
      contact: {
        name: 'Development Team',
        email: 'dev@pravo-academy.com',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/api',
        description: 'Development server',
      },
      {
        url: 'https://api.pravo-academy.com/api',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authentication',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            role: { type: 'string', enum: ['student', 'teacher', 'admin'] },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Flashcard: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            subject_id: { type: 'string', format: 'uuid' },
            topic_id: { type: 'string', format: 'uuid' },
            question: { type: 'string' },
            answer: { type: 'string' },
            difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            created_at: { type: 'string', format: 'date-time' },
          },
          required: ['subject_id', 'question', 'answer'],
        },
        Quiz: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            subject_id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            question_count: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        QuizQuestion: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            quiz_id: { type: 'string', format: 'uuid' },
            question: { type: 'string' },
            option_a: { type: 'string' },
            option_b: { type: 'string' },
            option_c: { type: 'string' },
            option_d: { type: 'string' },
            correct_answer: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
            explanation: { type: 'string' },
          },
          required: ['quiz_id', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer'],
        },
        StudyPlan: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            exam_date: { type: 'string', format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' },
            days: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string', format: 'date' },
                  tasks: { type: 'array' },
                  total_hours: { type: 'number' },
                  completed_count: { type: 'integer' },
                  total_count: { type: 'integer' },
                },
              },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            limit: { type: 'integer' },
            offset: { type: 'integer' },
            total: { type: 'integer' },
          },
        },
      },
    },
    paths: {
      '/auth/register': {
        post: {
          tags: ['Authentication'],
          summary: 'Register new user',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    first_name: { type: 'string' },
                    last_name: { type: 'string' },
                  },
                  required: ['email', 'password', 'first_name', 'last_name'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'User registered successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          user_id: { type: 'string' },
                          token: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Invalid input',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Authentication'],
          summary: 'User login',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                  required: ['email', 'password'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          user_id: { type: 'string' },
                          token: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': {
              description: 'Invalid credentials',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/flashcards': {
        get: {
          tags: ['Flashcards'],
          summary: 'List flashcards',
          parameters: [
            {
              name: 'subject_id',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by subject',
            },
            {
              name: 'difficulty',
              in: 'query',
              schema: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 20 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'List of flashcards',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Flashcard' },
                      },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Flashcards'],
          summary: 'Create flashcard (admin)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Flashcard' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Flashcard created',
            },
            '403': {
              description: 'Admin access required',
            },
          },
        },
      },
      '/quiz/submit': {
        post: {
          tags: ['Quizzes'],
          summary: 'Submit quiz answers',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    quiz_id: { type: 'string', format: 'uuid' },
                    answers: {
                      type: 'object',
                      additionalProperties: { type: 'string' },
                    },
                  },
                  required: ['quiz_id', 'answers'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Quiz submitted and scored',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          score: { type: 'integer' },
                          percentage: { type: 'integer' },
                          correct_count: { type: 'integer' },
                          detailed_results: { type: 'array' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/search': {
        get: {
          tags: ['Search'],
          summary: 'Global content search',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string', minLength: 2 },
              description: 'Search query',
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 20 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            type: { type: 'string', enum: ['flashcard', 'case', 'lecture', 'conspect'] },
                            title: { type: 'string' },
                            snippet: { type: 'string' },
                            relevance_score: { type: 'number' },
                          },
                        },
                      },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/progress/study-plan/generate': {
        post: {
          tags: ['Study Plans'],
          summary: 'Generate personalized study plan',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    exam_date: { type: 'string', format: 'date-time' },
                    subject_ids: {
                      type: 'array',
                      items: { type: 'string', format: 'uuid' },
                    },
                  },
                  required: ['exam_date'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Study plan generated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          plan_id: { type: 'string', format: 'uuid' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Authentication', description: 'User authentication endpoints' },
      { name: 'Flashcards', description: 'Flashcard management' },
      { name: 'Quizzes', description: 'Quiz operations' },
      { name: 'Search', description: 'Content search' },
      { name: 'Study Plans', description: 'Study plan generation' },
      { name: 'Admin', description: 'Admin operations' },
    ],
  };
};
