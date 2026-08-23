/** Проверка на админските маршрути за съдържание срещу истинска база. */
import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { db } from './db';
import adminRouter from './routes/adminContent';
import { errorHandler } from './middleware/errorHandler';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/admin/content', adminRouter);
// НЕ собствен handler — същият, който работи в production.
app.use(errorHandler);

const PORT = 4601;

const server = app.listen(PORT, async () => {
  const base = `http://localhost:${PORT}/api/admin/content`;
  const out: string[] = [];
  const mark = (label: string, ok: boolean, extra = '') =>
    out.push(`${label.padEnd(38)}→ ${ok ? '✓' : '✗ ПРОБЛЕМ'} ${extra}`);

  // ---- участници -------------------------------------------------------
  const admin = await db.one(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ('admin@lawplus.bg','x','Админ','admin')
     ON CONFLICT (email) DO UPDATE SET role='admin', is_active=true RETURNING id`,
  );
  const student = await db.one(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ('stud@lawplus.bg','x','Студент','student')
     ON CONFLICT (email) DO UPDATE SET role='student' RETURNING id`,
  );

  const tok = (id: string, role: string) =>
    jwt.sign({ user_id: id, email: 'x', role }, config.jwt.secret);
  const adminTok = tok(admin.id, 'admin');
  const studTok = tok(student.id, 'student');
  // Токен, който ТВЪРДИ admin, но потребителят е студент в базата.
  const forgedTok = tok(student.id, 'admin');

  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };

  const topic = await db.one(
    `SELECT t.id, t.subject_id FROM topics t JOIN subjects s ON s.id = t.subject_id
      WHERE s.code = 'oblp' AND t.position = 3`,
  );
  const foreignTopic = await db.one(
    `SELECT t.id FROM topics t JOIN subjects s ON s.id = t.subject_id
      WHERE s.code = 'nk' AND t.position = 1`,
  );

  try {
    /* ---------------------------------------------------------- достъп */

    const anon = await call('GET', '/quiz?subject=oblp', undefined);
    mark('анонимен към админ API', anon.status === 401 || anon.status === 403, `(${anon.status})`);

    const asStudent = await call('GET', '/quiz?subject=oblp', studTok);
    mark('студент към админ API', asStudent.status === 403, `(${asStudent.status})`);

    const forged = await call('GET', '/quiz?subject=oblp', forgedTok);
    mark('токен с фалшива роля admin', forged.status === 403, `(${forged.status})`);

    const asAdmin = await call('GET', '/quiz?subject=oblp', adminTok);
    mark(
      'админ чете въпроси',
      asAdmin.status === 200 && Array.isArray(asAdmin.body),
      `(${asAdmin.status}, ${Array.isArray(asAdmin.body) ? asAdmin.body.length : 0} бр.)`,
    );

    const hasAnswers =
      Array.isArray(asAdmin.body) &&
      asAdmin.body.some((q: any) => q.correctIndex !== null || q.answer !== null);
    mark('админът вижда верните отговори', hasAnswers);

    /* ----------------------------------------------------- валидация */

    const bad1 = await call('POST', '/subjects/oblp/quiz', adminTok, {
      kind: 'mcq',
      question: 'Кратък?',
      options: ['А'],
      correctIndex: 0,
    });
    mark('отказ: под 2 опции', bad1.status === 422, `(${bad1.status})`);

    const bad2 = await call('POST', '/subjects/oblp/quiz', adminTok, {
      kind: 'mcq',
      question: 'Кой отговор е верен според закона за задълженията?',
      options: ['Първи вариант', 'Втори вариант', 'Трети вариант', 'Четвърти вариант'],
      correctIndex: 7,
    });
    mark('отказ: correctIndex извън опциите', bad2.status === 422, `(${bad2.status})`);

    const bad3 = await call('POST', '/subjects/oblp/quiz', adminTok, {
      kind: 'mcq',
      question: 'Повтарящи се опции водят до неверен въпрос, нали?',
      options: ['Един и същ', 'Един и същ', 'Трети', 'Четвърти'],
      correctIndex: 0,
    });
    mark('отказ: повтарящи се опции', bad3.status === 422, `(${bad3.status})`);

    const bad4 = await call('POST', '/subjects/oblp/quiz', adminTok, {
      kind: 'mcq',
      question: 'Въпрос с тема от чужд предмет — трябва да бъде отказан?',
      options: ['А', 'Б', 'В', 'Г'],
      correctIndex: 1,
      topicId: foreignTopic.id,
    });
    mark('отказ: тема от друг предмет', bad4.status === 422, `(${bad4.status})`);

    const bad5 = await call('POST', '/subjects/oblp/quiz', adminTok, {
      kind: 'mcq',
      question: 'Обяснение за несъществуваща опция трябва да се откаже?',
      options: ['А', 'Б', 'В', 'Г'],
      correctIndex: 2,
      optionExplanations: { '9': 'няма такава опция' },
    });
    mark('отказ: обяснение за липсваща опция', bad5.status === 422, `(${bad5.status})`);

    const badLevel = await call('POST', '/subjects/oblp/quiz', adminTok, {
      kind: 'mcq',
      question: 'Ниво на латиница трябва да бъде отказано?',
      options: ['А', 'Б', 'В', 'Г'],
      correctIndex: 0,
      level: 'easy',
    });
    mark('отказ: непознато ниво', badLevel.status === 422, `(${badLevel.status})`);

    /* ------------------------------------------------- създаване (mcq) */

    const created = await call('POST', '/subjects/oblp/quiz', adminTok, {
      kind: 'mcq',
      question: 'ТЕСТ Кой е носителят на задължението в облигационното отношение?',
      options: ['Длъжникът', 'Кредиторът', 'Съдът', 'Третото лице'],
      correctIndex: 0,
      explanation: 'Длъжникът дължи изпълнение.',
      optionExplanations: { '1': 'Кредиторът е носител на вземането, не на дълга.' },
      methodNote: 'Разграничавай вземане от дълг.',
      level: 'базово',
      topicId: topic.id,
    });
    mark('създаване на въпрос', created.status === 201 && !!created.body?.id, `(${created.status})`);
    const quizId: string = created.body?.id;

    const readBack = await call('GET', `/quiz/${quizId}`, adminTok);
    mark(
      'прочитане на създадения въпрос',
      readBack.status === 200 &&
        readBack.body.correctIndex === 0 &&
        readBack.body.optionExplanations?.['1']?.includes('вземането'),
    );

    const withLetters = await call('POST', '/subjects/oblp/quiz', adminTok, {
      kind: 'mcq',
      question: 'ТЕСТ Обяснения с букви от рецензираните партиди?',
      options: ['Първи', 'Втори', 'Трети', 'Четвърти'],
      correctIndex: 0,
      optionExplanations: { 'Б': 'обяснение за втората', 'Г)': 'обяснение за четвъртата' },
    });
    mark(
      'буквите се превръщат в индекси',
      withLetters.status === 201 &&
        withLetters.body.optionExplanations?.['1'] === 'обяснение за втората' &&
        withLetters.body.optionExplanations?.['3'] === 'обяснение за четвъртата',
      `(${withLetters.status})`,
    );

    /* ------------------------------------------------ създаване (fill) */

    const fill = await call('POST', '/subjects/oblp/quiz', adminTok, {
      kind: 'fill',
      question: 'Преведете: pacta sunt servanda',
      answer: 'договорите трябва да се спазват',
      accept: ['договорите се спазват'],
    });
    mark('създаване на въпрос със свободен отговор', fill.status === 201, `(${fill.status})`);
    const fillOk =
      fill.status === 201 &&
      Array.isArray(fill.body.accept) &&
      fill.body.accept.includes('договорите трябва да се спазват');
    mark('самият отговор влиза в приетите', fillOk);

    /* ---------------------------------------------------- редактиране */

    const patched = await call('PATCH', `/quiz/${quizId}`, adminTok, {
      question: 'ТЕСТ Кой дължи изпълнение по облигационното отношение?',
    });
    mark(
      'частична редакция пази останалото',
      patched.status === 200 &&
        patched.body.correctIndex === 0 &&
        patched.body.options.length === 4 &&
        patched.body.level === 'базово',
      `(${patched.status})`,
    );

    const patchBad = await call('PATCH', `/quiz/${quizId}`, adminTok, {
      options: ['Само две', 'Опции'],
    });
    mark(
      'смяна на опции иска нов верен отговор',
      patchBad.status === 422,
      `(${patchBad.status})`,
    );

    const patchShrink = await call('PATCH', `/quiz/${quizId}`, adminTok, {
      options: ['Само две', 'Опции'],
      correctIndex: 5,
    });
    mark('отказ: верен отговор извън новите опции', patchShrink.status === 422, `(${patchShrink.status})`);

    const fieldErrors = patchShrink.body?.errors;
    mark('грешките идват по полета', !!fieldErrors && !!fieldErrors.correctIndex,
      fieldErrors ? JSON.stringify(fieldErrors) : '(липсват)');

    /* --------------------------------------------------------- казуси */

    const caseCreated = await call('POST', '/subjects/oblp/cases', adminTok, {
      number: 'T-1',
      title: 'ТЕСТ Забава на длъжника',
      theme: 'Неизпълнение',
      level: 'средно',
      concepts: ['забава', 'покана'],
      goals: ['Да се разграничи забава от неизпълнение'],
      facts: 'А. дължи на Б. сумата от 5000 лв. с падеж 1 март. Плащане не последва.',
      questions: ['От кой момент е в забава А.?', 'Дължи ли лихва?'],
      hints: ['Проверете дали падежът е определен.'],
      solution: 'Длъжникът изпада в забава от падежа, когато той е определен.',
      conclusion: 'Определеният падеж прави поканата излишна.',
      mistakes: ['Смесване на забава с невъзможност за изпълнение.'],
      topicId: topic.id,
    });
    mark('създаване на казус', caseCreated.status === 201, `(${caseCreated.status})`);
    const caseId: string = caseCreated.body?.id;

    const caseBad = await call('POST', '/subjects/oblp/cases', adminTok, {
      title: 'ТЕСТ Казус без въпроси',
      facts: 'Достатъчно дълга фактическа обстановка за проверката.',
      questions: [],
    });
    mark('отказ: казус без въпроси', caseBad.status === 422, `(${caseBad.status})`);

    const casePatched = await call('PATCH', `/cases/${caseId}`, adminTok, {
      conclusion: 'Поправено заключение.',
    });
    mark(
      'редакция на казус пази останалото',
      casePatched.status === 200 &&
        casePatched.body.questions.length === 2 &&
        casePatched.body.conclusion === 'Поправено заключение.',
      `(${casePatched.status})`,
    );

    /* ------------------------------------------------------ конспекти */

    const conspect = await call('PUT', `/topics/${topic.id}/conspect`, adminTok, {
      heading: 'ТЕСТ Заглавие',
      refs: ['ЗЗД чл. 79'],
      sections: [
        {
          position: 0,
          title: 'Понятие',
          blocks: [
            { position: 0, type: 'p', text: 'Текст на параграф.' },
            { position: 1, type: 'list', items: ['първо', 'второ'] },
          ],
        },
      ],
    });
    mark('запис на конспект', conspect.status === 200, `(${conspect.status})`);

    const conspectAgain = await call('PUT', `/topics/${topic.id}/conspect`, adminTok, {
      heading: 'ТЕСТ Заглавие 2',
      refs: [],
      sections: [{ position: 0, title: null, blocks: [{ position: 0, type: 'h', text: 'Само заглавие' }] }],
    });
    mark(
      'повторен запис обновява, не дублира',
      conspectAgain.status === 200 && conspectAgain.body.id === conspect.body.id,
      `(${conspectAgain.status})`,
    );

    const conspectBad = await call('PUT', `/topics/${topic.id}/conspect`, adminTok, {
      heading: 'Лош',
      refs: [],
      sections: [{ position: 0, blocks: [{ position: 0, type: 'table', text: 'x' }] }],
    });
    mark('отказ: непознат тип блок', conspectBad.status === 422, `(${conspectBad.status})`);

    /* ------------------------------------------------------ флашкарти */

    const flash = await call('POST', '/subjects/oblp/flashcards', adminTok, {
      question: 'ТЕСТ Какво е новация?',
      answer: 'Подновяване на задължение с ново.',
      topicId: topic.id,
    });
    mark('създаване на флашкарта', flash.status === 201, `(${flash.status})`);
    const flashId: string = flash.body?.id;

    /* --------------------------------------------------------- журнал */

    const revs = await call('GET', `/revisions/quiz_item/${quizId}`, adminTok);
    mark(
      'журналът пази промените',
      revs.status === 200 && revs.body.length >= 2 && revs.body[0].actorEmail === 'admin@lawplus.bg',
      `(${revs.body?.length} записа)`,
    );

    /* ----------------------------------------------------- публикуване */

    const unpub = await call('PATCH', `/publish/quiz/${quizId}`, adminTok, { isPublished: false });
    mark('скриване без триене', unpub.status === 200 && unpub.body.isPublished === false);

    const hidden = await db.oneOrNone(
      `SELECT id FROM quiz_items WHERE id = $1 AND is_published`,
      [quizId],
    );
    mark('скритият въпрос не е публикуван', hidden === null);

    /* ---------------------------------------------------- масов внос */

    const dry = await call('POST', '/subjects/oblp/import', adminTok, {
      dryRun: true,
      quiz: [
        {
          kind: 'mcq',
          question: 'ТЕСТ ВНОС Какво е суброгация?',
          options: ['Встъпване в правата', 'Прехвърляне на дълг', 'Опрощаване', 'Прихващане'],
          correctIndex: 0,
          topicId: topic.id,
        },
      ],
      cases: [],
    });
    mark('пробен внос не пише', dry.status === 200 && dry.body.inserted === 0, `(${dry.status})`);

    const importBad = await call('POST', '/subjects/oblp/import', adminTok, {
      quiz: [
        {
          kind: 'mcq',
          question: 'ТЕСТ ВНОС Добър въпрос с достатъчна дължина?',
          options: ['А', 'Б', 'В', 'Г'],
          correctIndex: 1,
        },
        { kind: 'mcq', question: 'къс', options: ['А'], correctIndex: 0 },
      ],
    });
    const countAfterBad = await db.one(
      `SELECT count(*)::int AS n FROM quiz_items WHERE question LIKE 'ТЕСТ ВНОС%'`,
    );
    mark(
      'един лош ред отменя целия внос',
      importBad.status === 422 && countAfterBad.n === 0,
      `(${importBad.status}, ${countAfterBad.n} записа)`,
    );

    const importOk = await call('POST', '/subjects/oblp/import', adminTok, {
      quiz: [
        {
          kind: 'mcq',
          question: 'ТЕСТ ВНОС Какво е суброгация?',
          options: ['Встъпване в правата', 'Прехвърляне на дълг', 'Опрощаване', 'Прихващане'],
          correctIndex: 0,
          topicId: topic.id,
        },
      ],
      cases: [
        {
          title: 'ТЕСТ ВНОС Казус за суброгация',
          facts: 'Поръчителят плаща дълга на кредитора и търси права срещу длъжника.',
          questions: ['В какъв обем встъпва поръчителят?'],
          topicId: topic.id,
        },
      ],
    });
    mark('внос на партида', importOk.status === 200 && importOk.body.inserted === 2, `(${JSON.stringify(importOk.body)})`);

    const importTwice = await call('POST', '/subjects/oblp/import', adminTok, {
      quiz: [
        {
          kind: 'mcq',
          question: 'ТЕСТ ВНОС Какво е суброгация?',
          options: ['Встъпване в правата', 'Прехвърляне на дълг', 'Опрощаване', 'Прихващане'],
          correctIndex: 0,
          topicId: topic.id,
        },
      ],
    });
    mark(
      'повторен внос обновява, не дублира',
      importTwice.status === 200 && importTwice.body.inserted === 0 && importTwice.body.updated === 1,
      `(${JSON.stringify(importTwice.body)})`,
    );

    /* ---------------------------------------------------------- триене */

    const del = await call('DELETE', `/quiz/${quizId}`, adminTok);
    const gone = await db.oneOrNone(`SELECT id FROM quiz_items WHERE id = $1`, [quizId]);
    mark('триене на въпрос', del.status === 204 && gone === null, `(${del.status})`);

    const delRev = await db.oneOrNone(
      `SELECT before_data FROM content_revisions
        WHERE entity_id = $1 AND action = 'delete'`,
      [quizId],
    );
    mark(
      'изтритото се пази в журнала',
      !!delRev?.before_data?.question,
      delRev?.before_data?.question ? '' : '(няма следа!)',
    );

    const delStudent = await call('DELETE', `/cases/${caseId}`, studTok);
    mark('студент не може да трие', delStudent.status === 403, `(${delStudent.status})`);

    /* ------------------------------------------------------ почистване */

    await db.none(`DELETE FROM quiz_items  WHERE question LIKE 'ТЕСТ%'`);
    await db.none(`DELETE FROM study_cases WHERE title    LIKE 'ТЕСТ%'`);
    await db.none(`DELETE FROM flashcards  WHERE question LIKE 'ТЕСТ%'`);
    await db.none(`DELETE FROM quiz_items  WHERE question LIKE 'Преведете: pacta%'`);
    void flashId;

    console.log('\n  ПРОВЕРКА НА АДМИНСКИТЕ МАРШРУТИ');
    console.log('  ' + '─'.repeat(58));
    out.forEach((line) => console.log('  ' + line));
    const failed = out.filter((l) => l.includes('✗')).length;
    console.log('  ' + '─'.repeat(58));
    console.log(`  ${out.length - failed}/${out.length} минали\n`);
  } catch (err) {
    console.error('СРИВ:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
