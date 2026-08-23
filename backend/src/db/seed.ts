/**
 * Seed script for Pravo Academy Database
 *
 * This script populates the database with sample data for testing and development
 * Run with: npm run seed
 */

import { db } from './index';
import { v4 as uuidv4 } from 'uuid';

const seed = async () => {
  try {
    console.log('🌱 Starting database seed...\n');

    // ================================================================
    // CLEAR EXISTING DATA (development only)
    // ================================================================
    console.log('Clearing existing data...');
    await db.none('TRUNCATE TABLE subjects, topics, flashcards, quizzes, quiz_questions CASCADE');

    // ================================================================
    // SUBJECTS
    // ================================================================
    console.log('Creating subjects...');
    const subjects = [
      {
        id: uuidv4(),
        title: 'Конституционно право',
        description: 'Основите на конституционното право и государствено устройство',
        order_index: 1,
      },
      {
        id: uuidv4(),
        title: 'Гражданско право',
        description: 'Главната маса на частното право',
        order_index: 2,
      },
      {
        id: uuidv4(),
        title: 'Наказателно право',
        description: 'Наказателната отговорност и престъпления',
        order_index: 3,
      },
      {
        id: uuidv4(),
        title: 'Административно право',
        description: 'Управление и административни процедури',
        order_index: 4,
      },
    ];

    for (const subject of subjects) {
      await db.none(
        `INSERT INTO subjects (id, title, description, order_index, is_active)
         VALUES ($1, $2, $3, $4, $5)`,
        [subject.id, subject.title, subject.description, subject.order_index, true]
      );
    }

    // ================================================================
    // TOPICS
    // ================================================================
    console.log('Creating topics...');
    const topics = [
      {
        subject_id: subjects[0].id,
        title: 'Основни принципи',
        order_index: 1,
      },
      {
        subject_id: subjects[0].id,
        title: 'Правомощия на президента',
        order_index: 2,
      },
      {
        subject_id: subjects[1].id,
        title: 'Договори',
        order_index: 1,
      },
      {
        subject_id: subjects[1].id,
        title: 'Собственост',
        order_index: 2,
      },
      {
        subject_id: subjects[2].id,
        title: 'Престъпления против личност',
        order_index: 1,
      },
      {
        subject_id: subjects[2].id,
        title: 'Наказания',
        order_index: 2,
      },
    ];

    for (const topic of topics) {
      const id = uuidv4();
      await db.none(
        `INSERT INTO topics (id, subject_id, title, order_index, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [id, topic.subject_id, topic.title, topic.order_index]
      );
    }

    // ================================================================
    // FLASHCARDS
    // ================================================================
    console.log('Creating flashcards...');
    const flashcardPairs = [
      {
        subject_id: subjects[0].id,
        question: 'Какво е конституцията?',
        answer:
          'Конституцията е основния закон на държавата, който регламентира държавното устройство, правата и задълженията на гражданите.',
      },
      {
        subject_id: subjects[0].id,
        question: 'Какъв е принципът на разделението на властите?',
        answer:
          'Принципът разделя правомощията между три власти: законодателна (парламент), изпълнителна (правителство) и съдебна (съдилища).',
      },
      {
        subject_id: subjects[1].id,
        question: 'Какво е договор?',
        answer:
          'Договорът е съглашение между две или повече страни, чрез което те съзнателно поемат взаимни задължения.',
      },
      {
        subject_id: subjects[1].id,
        question: 'Какви видове собственост съществуват?',
        answer:
          'Собствеността може да бъде: частна (на физически или юридически лица), държавна (общественост) и общинска.',
      },
      {
        subject_id: subjects[2].id,
        question: 'Какво е престъпление?',
        answer:
          'Престъплението е опасно за обществото противозаконно действие (или бездействие), учинено с вина, за което законът предвижда наказание.',
      },
      {
        subject_id: subjects[2].id,
        question: 'Какви са видовете наказания?',
        answer:
          'Видовете наказания са: смъртни присъди (отменени), затвор, домашен арест, лишаване от право, глоба и конфискация.',
      },
    ];

    for (const pair of flashcardPairs) {
      const id = uuidv4();
      await db.none(
        `INSERT INTO flashcards (id, subject_id, question, answer, difficulty, created_at)
         VALUES ($1, $2, $3, $4, 'medium', NOW())`,
        [id, pair.subject_id, pair.question, pair.answer]
      );
    }

    // ================================================================
    // QUIZZES
    // ================================================================
    console.log('Creating quizzes...');
    const quizzes = [
      {
        id: uuidv4(),
        subject_id: subjects[0].id,
        title: 'Конституционно право - Основи',
        description: 'Тест за проверка на знанията по основния закон',
      },
      {
        id: uuidv4(),
        subject_id: subjects[1].id,
        title: 'Гражданско право - Договори',
        description: 'Тест по договорното право',
      },
    ];

    for (const quiz of quizzes) {
      await db.none(
        `INSERT INTO quizzes (id, subject_id, title, description)
         VALUES ($1, $2, $3, $4)`,
        [quiz.id, quiz.subject_id, quiz.title, quiz.description]
      );
    }

    // ================================================================
    // QUIZ QUESTIONS
    // ================================================================
    console.log('Creating quiz questions...');
    const quizQuestions = [
      {
        quiz_id: quizzes[0].id,
        question: 'На какво поколение права принадлежат правата на човека?',
        option_a: 'Първо поколение',
        option_b: 'Второ поколение',
        option_c: 'Трето поколение',
        option_d: 'Всички поколения',
        correct_answer: 'A',
        explanation: 'Правата на човека tartozят към първо поколение права.',
      },
      {
        quiz_id: quizzes[0].id,
        question: 'Кой избира президента на България?',
        option_a: 'Парламентът',
        option_b: 'Народът чрез преки избори',
        option_c: 'Министър-председателят',
        option_d: 'Върховният съд',
        correct_answer: 'B',
        explanation: 'Президентът се избира от народа чрез преки всеобщи избори.',
      },
      {
        quiz_id: quizzes[1].id,
        question: 'Какво е съществено условие на договорите?',
        option_a: 'Наличието на страни',
        option_b: 'Съгласието на страните',
        option_c: 'Законният предмет и причина',
        option_d: 'Всички горни отговори',
        correct_answer: 'D',
        explanation:
          'Съществени условия на договорите са наличието на страни, тяхното съгласие, законният предмет и причина.',
      },
    ];

    for (const question of quizQuestions) {
      const id = uuidv4();
      await db.none(
        `INSERT INTO quiz_questions
         (id, quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          question.quiz_id,
          question.question,
          question.option_a,
          question.option_b,
          question.option_c,
          question.option_d,
          question.correct_answer,
          question.explanation,
        ]
      );
    }

    console.log('\n✅ Database seed completed successfully!\n');
    console.log('Summary:');
    console.log(`  - ${subjects.length} subjects created`);
    console.log(`  - ${topics.length} topics created`);
    console.log(`  - ${flashcardPairs.length} flashcards created`);
    console.log(`  - ${quizzes.length} quizzes created`);
    console.log(`  - ${quizQuestions.length} quiz questions created\n`);
  } catch (error) {
    console.error('❌ Error during seed:', error);
    process.exit(1);
  }
};

// Run if executed directly
if (require.main === module) {
  seed().then(() => process.exit(0));
}

export default seed;
