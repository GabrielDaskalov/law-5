/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { saveState } from './09-backend-integraciya.js';
import { daysUntil } from './20-exam-colloquium-config.js';

/* =============================================================================
   PLAN GENERATOR
   ============================================================================= */
function generatePlan(subjId, opts) {
  // opts: { topicsFrom, topicsTo, deadline (ISO), examType }
  const subj = SUBJECTS.find(s => s.id === subjId);
  if (!subj) return null;
  const totalDays = Math.max(1, daysUntil(opts.deadline));
  const numTopics = opts.topicsTo - opts.topicsFrom + 1;
  const days = [];
  const today = new Date(); today.setHours(0,0,0,0);

  // Distribute topics across days
  const topicsPerDay = numTopics / totalDays;
  const reviewEveryN = opts.examType === 'oral' ? 3 : 4;

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const tasks = [];

    const topicIdx = Math.min(numTopics - 1, Math.floor(i * topicsPerDay));
    const chapter = subj.chapters[opts.topicsFrom - 1 + topicIdx];

    // Sunday — light day
    if (d.getDay() === 0) {
      tasks.push({ kind: 'rest', text: 'Седмичен преговор или почивка' });
    } else if (i === totalDays - 1) {
      // Last day — final review
      tasks.push({ kind: 'review', text: 'Финален преговор на всички теми' });
      tasks.push({ kind: 'cards', text: 'Бързи флашкарти — 50 карти' });
      if (opts.examType === 'oral') tasks.push({ kind: 'oral', text: 'Тренирай отговор на глас по 3 произволни теми' });
      else tasks.push({ kind: 'cases', text: 'Реши 1 пробен казус с хронометър' });
    } else if ((i + 1) % reviewEveryN === 0) {
      // Review day
      tasks.push({ kind: 'review', text: 'Преговор на изминалите ' + reviewEveryN + ' теми' });
      tasks.push({ kind: 'test', text: 'Тест по обхванатия материал — 15 въпроса' });
    } else {
      // Regular learning day
      tasks.push({ kind: 'read', text: 'Тема ' + (opts.topicsFrom + topicIdx) + ': ' + chapter });
      tasks.push({ kind: 'cards', text: 'Флашкарти по темата — 25 карти' });
      if (opts.examType === 'oral') {
        tasks.push({ kind: 'oral', text: 'Изговори ключовите понятия на глас' });
      } else {
        tasks.push({ kind: 'cases', text: 'Прочети 1 казус по темата' });
      }
    }

    days.push({ date: d.toISOString().slice(0, 10), tasks });
  }

  const plan = { topicsFrom: opts.topicsFrom, topicsTo: opts.topicsTo, deadline: opts.deadline, examType: opts.examType, generatedAt: Date.now(), days };
  state.plans[subjId] = plan;
  saveState();
  return plan;
}

export { generatePlan };
