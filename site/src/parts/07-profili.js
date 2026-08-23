/* Автоматично добавени връзки при разделянето на монолита. */
import { DEFAULT_STATE_JSON, STATE_KEY, loadState } from './06-state.js';

/* =============================================================================
   ПРОФИЛИ — индивидуален прогрес за всеки акаунт (по имейл)
   Всички лични данни (прогрес, покупки, streak, SRS, тестове, изпити)
   се пазят отделно за всеки влязъл потребител. При първо влизане
   досегашният „гост" прогрес се прехвърля към акаунта, за да не се губи.
   ============================================================================= */
const PROFILE_KEYS = [STATE_KEY, 'pa_streak', 'pa_srs', 'pa_quiz', 'pa_cases', 'pa_exam'];
// (pa_theme нарочно НЕ е тук — темата е настройка на устройството)

function currentProfileId() {
  return localStorage.getItem('pa_active_profile') || 'guest';
}

function snapshotProfile(id) {
  const snap = {};
  PROFILE_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) snap[k] = v;
  });
  try { localStorage.setItem('pa_profile::' + id, JSON.stringify(snap)); } catch (e) { /* quota */ }
}

function activateProfile(id) {
  // Зарежда снимката на профила в работните ключове и в паметта
  let snap = null;
  try { snap = JSON.parse(localStorage.getItem('pa_profile::' + id) || 'null'); } catch (e) { /* ignore */ }
  PROFILE_KEYS.forEach(k => localStorage.removeItem(k));
  if (snap) Object.entries(snap).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} });
  localStorage.setItem('pa_active_profile', id);
  state = JSON.parse(DEFAULT_STATE_JSON);
  loadState();
}

export { PROFILE_KEYS, activateProfile, currentProfileId, snapshotProfile };
