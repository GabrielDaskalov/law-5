# Промяна в `src/index.ts` — изключени стари маршрути за съдържание

## Дупката

Освен `/api/content/*` (новите, с проверка на достъпа), в приложението бяха
монтирани и по-стари маршрути за същото съдържание — **без никаква проверка**:

| маршрут | какво правеше |
|---|---|
| `GET /api/flashcards` | връщаше платени флашкарти на анонимен посетител |
| `GET /api/cases` | казуси |
| `GET /api/conspects` | конспекти |
| `GET /api/lectures` | лекции |
| `GET /api/quiz/subject/:id` | тестови въпроси |
| `GET /api/search` | търсене в цялото съдържание |
| `POST /api/conspects` | **писане** на конспект без вход |

Тоест paywall-ът на `/api/content/*` се заобикаляше с един друг адрес.

**Проверено на живо преди поправката:**

```
GET /api/flashcards        → 200, 20 платени карти, без вход
POST /api/conspects        → достига до базата без вход
```

## Защо са изключени, а не „закърпени“

Нищо не ги вика. Проверено с търсене по кода и на двата фронтенда:

* старият сайт вика `/api/auth/*`, `/api/user/profile`, `/api/me/*`,
  `/api/checkout/*`, `/api/admin/*`, `/api/ai/ask`, `/health`;
* новият — същите плюс `/api/content/*`.

Дублиран, неползван код с достъп до платените данни е чиста повърхност за
атака. По-малко код е по-добре от още един слой проверки.

## Как е сега

```ts
// app.use('/api/subjects', subjectsRoutes);
// app.use('/api/flashcards', flashcardsRoutes);
// app.use('/api/quiz', quizRoutes);
// app.use('/api/conspects', conspectRoutes);
// app.use('/api/lectures', lectureRoutes);
// app.use('/api/cases', caseRoutes);
// app.use('/api/search', searchRoutes);
```

Файловете остават в `src/routes/`. Ако някога потрябват, всеки първо трябва
да мине през същата проверка като `content.new.ts` — `assertSubjectAccess` /
`assertTopicAccess`.

**Проверено след поправката:** всичките изброени адреси връщат `404`, а
`/api/content/*` работят непроменено (37/37 + 10/10 проверки минали).
