/* Автоматично добавени връзки при разделянето на монолита. */
import { STATE_KEY } from './06-state.js';
import { apiFetch, backendReady, saveState, setJwt } from './09-backend-integraciya.js';
import { Activity } from './14-data-service.js';

/* =============================================================================
   API — BACKEND INTEGRATION POINTS
   --------------------------------------------------------------------------
   This is the ONLY layer the programmer needs to rewire when adding a real
   backend (Supabase / custom Node). All UI calls go through API.* — internals
   currently use localStorage but the signatures match real REST/RPC calls.
   ============================================================================= */
const API_BASE = ''; // future: 'https://api.pravo-academy.bg/v1'

const API = {
  // --- AUTH ---
  // Future: POST /auth/register {email, password, name} → {user, token}
  async register({ email, password, name }) {
    if (!email || !password) throw new Error('Email и парола са задължителни');
    if (password.length < 8) throw new Error('Паролата трябва да е поне 8 символа');
    // MOCK: store locally
    state.user = { email: email.toLowerCase(), name: name || email.split('@')[0], emailVerified: false };
    state.userCreatedAt = Date.now();
    state.onboardingDone = false;
    saveState();
    Activity.log('auth.register', null, { email });
    // Future: backend sends verification email here
    return { user: state.user };
  },
  // Future: POST /auth/login {email, password} → {user, token}
  async login({ email, password }) {
    if (!email || !password) throw new Error('Email и парола са задължителни');
    // MOCK: accept any non-empty
    state.user = { email: email.toLowerCase(), name: state.user?.name || email.split('@')[0], emailVerified: !!state.user?.emailVerified };
    if (!state.userCreatedAt) state.userCreatedAt = Date.now();
    saveState();
    Activity.log('auth.login', null, { email });
    return { user: state.user };
  },
  async logout() {
    Activity.log('auth.logout', null, null);
    // При жив сървър изходът трябва да значи нещо и ТАМ: докато сесията не се
    // затвори, токенът важи още 24 часа — на чужд компютър това е точно
    // проблемът, който бутонът уж решава.
    try {
      if (await backendReady()) await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* и без сървъра излизаме локално */ }
    setJwt(null);
    state.user = null;
    saveState();
  },

  // --- УСТРОЙСТВА ---
  /** Активните устройства на този акаунт. */
  async sessions() {
    const r = await apiFetch('/api/auth/sessions');
    return r.data || { sesii: [], limit: 1, ustrojstva_30_dni: 0 };
  },
  /** Маха устройство от месечния регистър — освобождава място. */
  async forgetDevice(id) {
    return apiFetch('/api/auth/devices/' + encodeURIComponent(id), { method: 'DELETE' });
  },
  /** Изключва конкретно устройство. */
  async revokeSession(id) {
    return apiFetch('/api/auth/sessions/' + encodeURIComponent(id), { method: 'DELETE' });
  },
  /** Изход от всички устройства — включително това. */
  async logoutAll() {
    const r = await apiFetch('/api/auth/logout-all', { method: 'POST' });
    setJwt(null);
    state.user = null;
    saveState();
    return r;
  },
  // Future: POST /auth/forgot-password {email}
  async forgotPassword(email) {
    Activity.log('auth.forgot-password', null, { email });
    return { sent: true }; // backend sends email
  },
  // Future: POST /auth/change-password {currentPassword, newPassword}
  // NOTE: in mock mode (no backend) we don't have a real stored password,
  // so currentPassword is optional. Backend integration will enforce it.
  async changePassword({ currentPassword, newPassword }) {
    if (!newPassword || newPassword.length < 8) throw new Error('Новата парола трябва да е поне 8 символа');
    // ПОПРАВКА: при жив сървър смяната наистина се извършва. Дотук този екран
    // само записваше събитие в дневника и казваше „готово" — паролата
    // оставаше старата, а човекът беше сигурен, че я е сменил.
    if (await backendReady()) {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      // Сървърът изхвърля всички устройства при смяна на парола — включително
      // това. Токенът тук вече не важи, затова се маха и се влиза наново.
      setJwt(null);
      Activity.log('auth.password-change', null, null);
      return { ok: true, ponovo: true };
    }
    Activity.log('auth.password-change', null, null);
    return { ok: true };
  },
  // Future: POST /auth/change-email {newEmail, password} → triggers re-verification
  async changeEmail({ newEmail }) {
    if (!newEmail || !/^[^@]+@[^@]+\.[^@]+$/.test(newEmail)) throw new Error('Невалиден email');
    state.user.email = newEmail.toLowerCase();
    state.user.emailVerified = false;
    saveState();
    Activity.log('auth.email-change', null, { newEmail });
    return { ok: true };
  },

  // --- PROFILE ---
  async updateProfile(patch) {
    state.user = Object.assign({}, state.user, patch);
    saveState();
    Activity.log('profile.update', null, Object.keys(patch));
    return { user: state.user };
  },

  // --- GDPR ---
  // При жив сървър данните идват ОТТАМ (чл. 15 и чл. 20 ОРЗД изискват всички
  // лични данни, не само тези в браузъра — покупки, плащания, тикети, профил).
  async exportMyData() {
    try {
      if (await backendReady()) {
        const r = await apiFetch('/api/me/export');
        return r.data || r;
      }
    } catch (e) { /* без сървър — падаме на локалното копие */ }
    return {
      profile: state.user,
      createdAt: state.userCreatedAt,
      purchased: state.purchased,
      progress: state.progress,
      srs: state.srs,
      examDrawHistory: state.examDrawHistory,
      streakDays: state.streakDays,
      notifPrefs: state.notifPrefs,
      events: state.events,
      supportTickets: state.supportTickets,
      exportedAt: new Date().toISOString(),
    };
  },
  // Изтриване на акаунт. При жив сървър ЗАДЪЛЖИТЕЛНО минава през бекенда —
  // иначе потребителят вижда „акаунтът е изтрит", а в базата остават имейлът,
  // името, хешът на паролата, плащанията и целият прогрес. Това е чл. 17 ОРЗД.
  async deleteAccount(password) {
    Activity.log('account.delete-request', null, null);
    if (await backendReady()) {
      // грешката НЕ се преглъща — потребителят трябва да разбере, ако не е станало
      const r = await apiFetch('/api/me', {
        method: 'DELETE',
        body: JSON.stringify({ password: password || '' }),
      });
      localStorage.removeItem(STATE_KEY);
      setJwt(null);
      state.user = null;
      return r.data || { scheduledFor: Date.now() + 30 * 86400000 };
    }
    localStorage.removeItem(STATE_KEY);
    state.user = null;
    return { scheduledFor: Date.now() + 30 * 86400000 };
  },

  // --- PAYMENT ---
  // Future: POST /checkout/create-session {packageId} → {checkoutUrl}
  async createCheckoutSession(packageId) {
    Activity.log('checkout.start', null, { packageId });
    // MOCK: simulate Stripe Checkout
    return { checkoutUrl: '#/mock-checkout?package=' + packageId };
  },
  // Future: Stripe webhook → backend records purchase → user gets access
  // Frontend just polls /me to see latest purchases
  async listMyPurchases() {
    return (state.purchases || []).map(p => ({ ...p }));
  },

  // --- SUPPORT ---
  // Future: POST /support/tickets {subject, body}
  async createSupportTicket({ subject, body }) {
    if (!subject || !body) throw new Error('Заглавие и съдържание са задължителни');
    const ticket = {
      id: 't_' + Math.random().toString(36).slice(2, 10),
      subject, body,
      createdAt: Date.now(),
      status: 'open',
      replies: [],
      userEmail: state.user?.email,
    };
    if (!state.supportTickets) state.supportTickets = [];
    state.supportTickets.unshift(ticket);
    Activity.log('support.create', null, { subject: subject.slice(0, 40) });
    saveState();
    return ticket;
  },
  async listMyTickets() {
    return (state.supportTickets || []).slice();
  },
  // Admin: list ALL tickets (future backend will join with users)
  async adminListTickets() {
    return (state.supportTickets || []).slice();
  },
  async adminReplyTicket(ticketId, body) {
    const t = (state.supportTickets || []).find(x => x.id === ticketId);
    if (!t) throw new Error('Ticket not found');
    t.replies.push({ from: 'admin', body, at: Date.now() });
    t.status = 'replied';
    saveState();
    Activity.log('support.admin-reply', null, { ticketId });
    return t;
  },
  async adminCloseTicket(ticketId) {
    const t = (state.supportTickets || []).find(x => x.id === ticketId);
    if (!t) throw new Error('Ticket not found');
    t.status = 'closed';
    saveState();
    return t;
  },
};

function localStorageSize() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      total += (k.length + (localStorage.getItem(k) || '').length) * 2; // UTF-16
    }
  } catch (e) { /* */ }
  return total;
}
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

export { API, API_BASE, fmtBytes, localStorageSize };
