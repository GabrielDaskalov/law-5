/* Автоматично добавени връзки при разделянето на монолита. */
import { prepareRoute } from '../lib/prepare.js';
import { loadState } from './06-state.js';
import { backendPostLogin, backendReady, getJwt, pokazhiPreduprezhdenie } from './09-backend-integraciya.js';
import { $, $$, toast, updateNav } from './10-helpers.js';
import { applyTheme } from './19-feature.js';
import { renderExamPicker, renderForgotPassword, renderMistakes, renderMistakesReview, renderMockCheckout, renderResetPassword } from './24-lokalni-akaunti.js';
import { nalozhiVodenZnak, setupContentProtection, updatePrintWatermark } from './26-content-protection.js';
import { renderLanding } from './27-page.js';
import { renderPackages } from './28-page.js';
import { renderAbout, renderContact } from './29-page.js';
import { renderLogin, renderPotvardiUstrojstvo, renderRegister } from './30-page.js';
import { renderDashboard } from './31-page.js';
import { renderSubject } from './34-page.js';
import { renderFlashcards } from './35-page.js';
import { renderCases } from './36-page.js';
import { renderExamSetup } from './37-page.js';
import { renderConspect } from './38-page.js';
import { renderQuiz } from './39-page.js';
import { renderPlan } from './40-page.js';
import { renderReview } from './41-page.js';
import { renderExamDraw } from './42-page.js';
import { renderExamDrawRun } from './43-page.js';
import { renderSettings } from './45-page.js';
import { renderSupport } from './46-page.js';
import { maybeShowCookieBanner } from './51-cookie-consent-banner.js';
import { maybeShowOnboarding } from './53-onboarding-tour.js';
import { renderSearch } from './54-page.js';
import { renderNotesForSubject } from './55-page.js';
import { render404 } from './56-404.js';
import { renderAchievementsPage, renderStreakPage } from './57-v4-upgrades.js';

/* =============================================================================
   ROUTER
   ============================================================================= */
/**
 * ПРОМЯНА СПРЯМО СТАРИЯ САЙТ: рутерът е асинхронен.
 * Досега всички данни бяха в страницата и екранът се рисуваше веднага.
 * Сега нужното за конкретния маршрут се тегли от сървъра (само то и само
 * ако потребителят има право), показва се скелет, и чак тогава се рисува.
 * Самите екрани не са променяни — продължават да четат синхронно.
 */
async function router() {
  const hash = location.hash || '#/';
  const [path, query] = hash.slice(1).split('?');
  const params = new URLSearchParams(query || '');

  // Layout toggling — hide footer on dashboard/full-screen views
  const fullScreen = ['/dashboard', '/flashcards', '/lectures', '/conspect', '/quiz', '/plan', '/subject', '/review', '/exam-draw-run', '/admin'].some(p => path.startsWith(p));
  $('#footer').style.display = fullScreen && (path.startsWith('/flashcards') || path.startsWith('/quiz') || path.startsWith('/review') || path.startsWith('/exam-draw-run') || path.startsWith('/admin')) ? 'none' : '';

  // Белезите се опресняват при всяко минаване: акаунтът може да се е сменил,
  // датата в тях трябва да е днешната, а водният знак на екрана зависи от
  // това кой точно екран се отваря.
  updatePrintWatermark();
  nalozhiVodenZnak(path);
  pokazhiPreduprezhdenie();

  const app = $('#app');
  app.innerHTML = '';
  app.classList.add('fade-in');
  setTimeout(() => app.classList.remove('fade-in'), 400);

  // Clean up any orphaned AI bubbles from previous routes
  $$('body > .ai-bubble, body > .ai-panel').forEach(n => n.remove());

  // Данните за този маршрут — преди да се рисува каквото и да е.
  const ready = await prepareRoute(path, params, app);
  if (!ready) return;

  // Route matching
  if (path === '/' || path === '') return renderLanding();
  if (path === '/packages') return renderPackages(params.get('year'));
  if (path === '/about') return renderAbout();
  if (path === '/contact') return renderContact();
  if (path === '/login') return renderLogin();
  if (path === '/register') return renderRegister();
  // Линкът от имейла за ново устройство. Нарочно достъпен без вход — човекът
  // е тук точно защото не може да влезе.
  if (path === '/potvardi-ustrojstvo') return renderPotvardiUstrojstvo(params);
  if (path === '/dashboard') return renderDashboard();
  if (path === '/plan') return renderPlan(query);
  if (path.startsWith('/subject/')) return renderSubject(path.split('/')[2]);
  if (path.startsWith('/flashcards/')) return renderFlashcards(path.split('/')[2]);
  if (path.startsWith('/conspect/')) return renderConspect(path.split('/')[2]);
  if (path.startsWith('/cases/')) return renderCases(path.split('/')[2]);
  if (path.startsWith('/exam-setup/')) return renderExamSetup(path.split('/')[2]);
  if (path.startsWith('/exam-draw-run/')) return renderExamDrawRun(path.split('/')[2]);
  if (path.startsWith('/exam-draw/')) return renderExamDraw(path.split('/')[2]);
  if (path.startsWith('/review/')) return renderReview(path.split('/')[2]);
  if (path.startsWith('/quiz/')) return renderQuiz(path.split('/')[2]);
  /* Тези екрани се теглят чак когато потрябват (import при нужда).
     Админският панел и правните текстове са едри, а обикновеният студент
     не ги отваря — няма причина да ги сваля с всяко зареждане. */
  if (path === '/admin' || path.startsWith('/admin')) {
    const m = await import('./44-page.js');
    return m.renderAdmin(params);
  }
  if (path === '/settings') return renderSettings();
  if (path === '/support') return renderSupport();
  if (path === '/privacy') { const m = await import('./47-page.js'); return m.renderPrivacy(); }
  if (path === '/terms') { const m = await import('./48-page.js'); return m.renderTerms(); }
  if (path === '/faq') { const m = await import('./49-page.js'); return m.renderFAQ(); }
  if (path === '/pricing') { const m = await import('./50-page.js'); return m.renderPricing(); }
  if (path === '/search') return renderSearch(query);
  if (path.startsWith('/notes/')) return renderNotesForSubject(path.split('/')[2]);
  if (path === '/streak') return renderStreakPage();
  if (path === '/achievements') return renderAchievementsPage();
  if (path === '/exam') return renderExamPicker();
  if (path === '/mistakes') return renderMistakes();
  if (path === '/forgot-password') return renderForgotPassword();
  if (path === '/reset-password') return renderResetPassword(params);
  if (path.startsWith('/mistakes-review/')) return renderMistakesReview(path.split('/')[2]);
  if (path === '/mock-checkout') return renderMockCheckout(params);
  return render404();
}

window.addEventListener('hashchange', () => { window.scrollTo(0, 0); void router(); updateNav(); });
// Swipe жестове за флашкартите на телефон: ← = не знам, → = знам (след обръщане)
(function () {
  let x0 = null, y0 = null;
  document.addEventListener('touchstart', (e) => {
    if (!document.getElementById('fcCard')) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const card = document.getElementById('fcCard');
    if (!card || x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null; y0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return; // не е хоризонтален swipe
    if (!card.classList.contains('flipped')) return;              // първо се обръща с тап
    if (typeof window.__fcAnswer === 'function') window.__fcAnswer(dx > 0);
  }, { passive: true });
})();

// Клавишни комбинации за флашкартите (Space=обърни, →/1=Знам, ←/2=Не знам)
document.addEventListener('keydown', (e) => {
  const card = document.getElementById('fcCard');
  if (!card) return;                          // само по време на сесия с карти
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;  // не пречи на писане

  if (e.code === 'Space' || e.key === 'Enter') {
    e.preventDefault();
    card.click();                             // обърни картата
  } else if (e.key === 'ArrowRight' || e.key === '1') {
    if (typeof window.__fcAnswer === 'function' && card.classList.contains('flipped')) {
      e.preventDefault();
      window.__fcAnswer(true);                // Знам
    }
  } else if (e.key === 'ArrowLeft' || e.key === '2') {
    if (typeof window.__fcAnswer === 'function' && card.classList.contains('flipped')) {
      e.preventDefault();
      window.__fcAnswer(false);               // Не знам
    }
  }
});

window.addEventListener('DOMContentLoaded', () => {
  window.__pageLoadedAt = Date.now();
  loadState();
  applyTheme();

  // Backend интеграция: ако сървърът е наличен и има запазен вход — синхронизирай
  backendReady().then((ok) => {
    if (ok && getJwt()) backendPostLogin();
    if (ok && location.hash.includes('purchase=success')) {
      setTimeout(() => toast('🎉 Плащането е успешно! Достъпът ти се активира.', true), 900);
    }
  });
  setupContentProtection();
  router();
  setTimeout(() => { if (typeof maybeShowCookieBanner === 'function') maybeShowCookieBanner(); }, 800);
  setTimeout(() => { if (typeof maybeShowOnboarding === 'function') maybeShowOnboarding(); }, 1200);
  updateNav();
});

export { router };
