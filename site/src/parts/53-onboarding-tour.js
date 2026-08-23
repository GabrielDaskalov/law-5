/* Автоматично добавени връзки при разделянето на монолита. */
import { saveState } from './09-backend-integraciya.js';
import { escapeHtml, isLoggedIn, toast } from './10-helpers.js';

/* =============================================================================
   ONBOARDING TOUR
   ============================================================================= */
const ONBOARDING_STEPS = [
  { icon: '👋', title: 'Добре дошъл в Law+', body: 'Ще ти покажа в 5 кратки стъпки кое къде се намира. Можеш да го пропуснеш и да го пуснеш по-късно от Настройки.' },
  { icon: '📖', title: 'Конспектът', body: 'Пълен текстов материал по всяка тема, с препратки към закона и съдебна практика. Това е твоят учебник.' },
  { icon: '🃏', title: 'Флашкарти + SRS', body: 'Карти с въпрос и отговор, организирани по теми. Алгоритъмът SRS ти ги показва точно когато започваш да забравяш — оптимално за дългосрочно запомняне.' },
  { icon: '✓', title: 'Тестове и казуси', body: 'Тестови въпроси по теми за самопроверка. Казуси с реалистични факти и пълно решение — за тренировка на писмен изпит.' },
  { icon: '🎯', title: 'Тегли билет', body: 'Симулация на устен изпит — теглиш случайни 2-3 теми, имаш 30 мин да напишеш план, после виждаш конспекта за самосверяване. Най-близкото до реалната изпитна обстановка.' },
];
function showOnboarding(step = 0) {
  const existing = document.querySelector('.onb-overlay'); if (existing) existing.remove();
  const s = ONBOARDING_STEPS[step];
  if (!s) { state.onboardingDone = true; saveState(); return; }
  const overlay = document.createElement('div');
  overlay.className = 'onb-overlay';
  overlay.innerHTML = `
    <div class="onb-card">
      <div class="onb-icon">${s.icon}</div>
      <h3>${escapeHtml(s.title)}</h3>
      <p>${escapeHtml(s.body)}</p>
      <div class="onb-dots">${ONBOARDING_STEPS.map((_, i) => `<span class="dot ${i === step ? 'active' : ''}"></span>`).join('')}</div>
      <div class="onb-actions">
        ${step > 0 ? '<button class="btn btn-outline" onclick="window.__onbGo(' + (step - 1) + ')">← Назад</button>' : ''}
        ${step < ONBOARDING_STEPS.length - 1
          ? '<button class="btn btn-outline" onclick="window.__onbSkip()">Пропусни</button><button class="btn btn-gold" onclick="window.__onbGo(' + (step + 1) + ')">Напред →</button>'
          : '<button class="btn btn-gold" onclick="window.__onbFinish()">Започвам ✓</button>'}
      </div>
    </div>`;
  document.body.appendChild(overlay);
}
window.__onbGo = function(n) { document.querySelector('.onb-overlay')?.remove(); showOnboarding(n); };
window.__onbSkip = function() { state.onboardingDone = true; saveState(); document.querySelector('.onb-overlay')?.remove(); };
window.__onbFinish = function() { state.onboardingDone = true; saveState(); document.querySelector('.onb-overlay')?.remove(); toast('Готов си — успех в ученето!', true); };
function maybeShowOnboarding() {
  if (!isLoggedIn()) return;
  if (state.onboardingDone) return;
  // Only show on dashboard or first subject visit
  const path = (location.hash || '#/').slice(1).split('?')[0];
  if (path === '/dashboard' || path === '/' || path === '') {
    setTimeout(() => showOnboarding(0), 500);
  }
}

function toggleUserMenu(e) {
  e && e.stopPropagation();
  const drop = document.getElementById('userMenuDrop');
  if (drop) drop.classList.toggle('open');
}
document.addEventListener('click', (e) => {
  const drop = document.getElementById('userMenuDrop');
  if (drop && !e.target.closest('.user-menu')) drop.classList.remove('open');
});

export { ONBOARDING_STEPS, maybeShowOnboarding, showOnboarding, toggleUserMenu };
