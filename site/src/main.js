/**
 * Входна точка на приложението.
 *
 * Модулите се внасят в реда, в който бяха в стария един файл — редът има
 * значение, защото част от тях се изпълняват при зареждане (тема, рутер,
 * слушатели за клавиши).
 *
 * ЗАЩО СЪЩЕСТВУВА ТОЗИ ФАЙЛ:
 * Целият сайт беше един файл от 13 MB. Сега е 58 модула по
 * теми, които се сглобяват при build. Видът и поведението са същите.
 */
import '../styles/app.css';

/* Мостът към стария `window.PA_DATA` се вдига ПРЕДИ модулите, защото част
   от тях четат данни още при зареждането си. */
import './lib/padata-bridge.js';

import './parts/00-seed.js';
import './parts/01-seed.js';
import './parts/02-seed.js';
import './parts/03-conspect-content.js';
import './parts/04-glossary.js';
import './parts/05-case-studies.js';
import './parts/06-state.js';
import './parts/07-profili.js';
import { clearMistake, copyTopicLink, toggleBookmark } from './parts/08-tetradka-na-greshkite.js';
import { authSubmit, saveState } from './parts/09-backend-integraciya.js';
import { escapeHtml, toast } from './parts/10-helpers.js';
import './parts/11-topic-progress-streak-theme.js';
import './parts/12-srs.js';
import './parts/13-exam-draw.js';
import './parts/14-data-service.js';
import './parts/15-api.js';
import './parts/16-feature.js';
import './parts/17-feature.js';
import './parts/18-feature.js';
import './parts/19-feature.js';
import './parts/20-exam-colloquium-config.js';
import './parts/21-file-uploads.js';
import './parts/22-plan-generator.js';
import './parts/23-auth.js';
import { completeMockPurchase, logout, purchaseSubject, renderMistakes, submitForgotPassword, submitResetPassword } from './parts/24-lokalni-akaunti.js';
import { router } from './parts/25-router.js';
import './parts/26-content-protection.js';
import './parts/27-page.js';
import { tryFreeCards } from './parts/28-page.js';
import './parts/29-page.js';
import './parts/30-page.js';
import './parts/31-page.js';
import './parts/32-ai-assistant.js';
import './parts/33-ai-asistent-v2.js';
import './parts/34-page.js';
import './parts/35-page.js';
import './parts/36-page.js';
import './parts/37-page.js';
import './parts/38-page.js';
import { renderQuiz } from './parts/39-page.js';
import './parts/40-page.js';
import './parts/41-page.js';
import './parts/42-page.js';
import './parts/43-page.js';
import './parts/45-page.js';
import './parts/46-page.js';
import './parts/51-cookie-consent-banner.js';
import './parts/52-user-menu-dropdown.js';
import { toggleUserMenu } from './parts/53-onboarding-tour.js';
import './parts/54-page.js';
import './parts/55-page.js';
import './parts/56-404.js';
import { closeCmdPalette, cmdKey, pomoReset, pomoStart, runCmd, toggleFocusMode, togglePomo, toggleTheme, updateCmdResults } from './parts/57-v4-upgrades.js';

/* Екраните 44 (админ), 47–50 (правни текстове, ЧЗВ, цени) НЕ се внасят тук.
   Рутерът ги тегли при отваряне (`await import(...)`), защото обикновеният
   студент не ги отваря и няма причина да ги сваля всеки път. */

/* ---------------------------------------------------------------------------
   МОСТ КЪМ ГЛОБАЛНАТА ОБЛАСТ
   Част от бутоните в шаблоните ползват inline onclick="...". Тези атрибути
   се изпълняват в глобалната област, а модулите имат своя. Затова точно
   тези функции — и само те — се закачат на window.
   При бъдещо пренаписване на шаблоните към addEventListener този блок
   отпада изцяло.
   --------------------------------------------------------------------------- */
Object.assign(window, {
  authSubmit,
  clearMistake,
  closeCmdPalette,
  cmdKey,
  completeMockPurchase,
  copyTopicLink,
  escapeHtml,
  logout,
  pomoReset,
  pomoStart,
  purchaseSubject,
  renderMistakes,
  renderQuiz,
  router,
  runCmd,
  saveState,
  submitForgotPassword,
  submitResetPassword,
  toast,
  toggleBookmark,
  toggleFocusMode,
  togglePomo,
  toggleTheme,
  toggleUserMenu,
  tryFreeCards,
  updateCmdResults,
});
