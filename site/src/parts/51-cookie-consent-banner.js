/* Автоматично добавени връзки при разделянето на монолита. */
import { saveState } from './09-backend-integraciya.js';
import { Activity } from './14-data-service.js';

/* =============================================================================
   COOKIE CONSENT BANNER
   ============================================================================= */
function maybeShowCookieBanner() {
  if (state.cookieConsent) return; // already decided
  if (document.getElementById('cookieBanner')) return; // already shown
  const banner = document.createElement('div');
  banner.id = 'cookieBanner';
  banner.className = 'cookie-banner';
  banner.innerHTML = `
    <div class="cookie-banner-inner">
      <div class="cookie-banner-text">
        <strong>Бисквитки</strong>
        Ползваме <strong>технически бисквитки</strong> (за сесия и предпочитания), които са задължителни. <strong>Аналитични бисквитки</strong> (Plausible — анонимизирани) ни помагат да подобряваме платформата. Можеш да приемеш всички или само техническите. Виж <a href="#/privacy">Privacy Policy</a>.
      </div>
      <div class="cookie-banner-actions">
        <button class="btn btn-outline btn-sm" onclick="window.__cookieDecide('essential-only')">Само технически</button>
        <button class="btn btn-gold btn-sm" onclick="window.__cookieDecide('accepted')">Приемам всички</button>
      </div>
    </div>`;
  document.body.appendChild(banner);
}
window.__cookieDecide = function(choice) {
  state.cookieConsent = choice;
  saveState();
  Activity.log('cookie.consent', null, { choice });
  const b = document.getElementById('cookieBanner');
  if (b) b.remove();
};

export { maybeShowCookieBanner };
