import { Router } from 'express';
import type { Request } from 'express';
import { AuthService } from '../services/authService';
import { authenticate, asyncHandler, invalidateUserState } from '../middleware/auth';
import { InputValidator } from '../utils/validation';
import { db } from '../db';
import {
  aktivniSesii,
  prekrati,
  prekratiVsichki,
} from '../services/sessionService';
import {
  brojRazlichniUstrojstva,
  potvardiUstrojstvo,
  ustrojstvaNaAkaunt,
  zabraviUstrojstvo,
} from '../services/deviceService';
import { NotFoundError, ValidationError } from '../types';

const router = Router();

/**
 * Откъде идва влизането.
 *
 * `X-Device-Id` е случайно число, което браузърът си пази. Служи само за
 * едно: повторният вход от същото устройство да не се брои за ново и да не
 * изхвърля собственика му. Клиентът го подава, тоест може да лъже — затова
 * на него не виси нито едно разрешение, а лимитът се смята по редовете в
 * базата. Отрязва се, защото идва отвън.
 */
function kontekstNaVhod(req: Request) {
  const raw = req.headers['x-device-id'];
  const deviceId = typeof raw === 'string' ? raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) : undefined;
  return {
    deviceId: deviceId || undefined,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
    ip: req.ip || undefined,
  };
}

// POST /api/auth/register
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;

    // Validate input
    InputValidator.validateEmail(email);
    InputValidator.validatePassword(password);
    InputValidator.validateName(name);

    const result = await AuthService.register(email, password, name, kontekstNaVhod(req));
    res.status(201).json({
      success: true,
      data: result,
      message: 'User registered successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Validate input
    InputValidator.validateEmail(email);
    if (!password) {
      throw new Error('Password is required');
    }

    const result = await AuthService.login(email, password, kontekstNaVhod(req));
    res.json({
      success: true,
      data: result,
      message: 'Login successful',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/auth/logout
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const sid = req.user!.session_id;

    // ПОПРАВКА: „Изход“ не правеше нищо на сървъра — токенът оставаше валиден
    // до 24 часа след като потребителят е натиснал бутона. На чужд компютър
    // или при откраднат токен това е точно моментът, в който излизането
    // трябва да значи нещо.
    //
    // Затваря се ТАЗИ сесия, не всички. Преди сесиите единственият лост беше
    // token_version, тоест изходът от лаптопа изхвърляше и телефона. Сега
    // всяко устройство се затваря само за себе си; за другите има отделен
    // бутон по-долу.
    if (sid) {
      await prekrati(sid, 'izhod', userId);
    } else {
      // Токен отпреди въвеждането на сесиите — няма ред, който да се затвори,
      // затова единственото средство е старото.
      await db.none('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId]);
      invalidateUserState(userId);
    }

    res.json({
      success: true,
      message: 'Logout successful',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/auth/logout-all — изход от всички устройства
router.post(
  '/logout-all',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    // Тук ударът е тежък нарочно: този бутон се натиска, когато човек се
    // съмнява, че някой му ползва акаунта. Вдигаме и версията на токените —
    // така падат и евентуалните стари токени без номер на сесия, които редът
    // в user_sessions не може да достигне.
    const broj = await prekratiVsichki(userId, 'izhod-vsichki');
    await db.none('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId]);
    invalidateUserState(userId);

    res.json({
      success: true,
      data: { prekrateni: broj },
      message: 'Излезе от всички устройства.',
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/auth/sessions — моите активни устройства
router.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const sid = req.user!.session_id;

    const [sesii, ustrojstva30, ustrojstva] = await Promise.all([
      aktivniSesii(userId, sid),
      brojRazlichniUstrojstva(userId),
      ustrojstvaNaAkaunt(userId),
    ]);

    const limit = await db.one<{ max_sessions: number; max_devices_30d: number }>(
      'SELECT max_sessions, max_devices_30d FROM users WHERE id = $1',
      [userId]
    );

    res.json({
      success: true,
      data: {
        sesii,
        limit: limit.max_sessions,
        // Показва се и на самия потребител нарочно: човек, чиято парола е
        // тръгнала по ръцете, вижда числото и се сеща да я смени. А този,
        // който е споделил акаунта, вижда, че се брои.
        ustrojstva_30_dni: ustrojstva30,
        limit_ustrojstva: limit.max_devices_30d,
        ustrojstva: ustrojstva.map((u) => ({
          id: u.id,
          label: u.label,
          first_seen_at: u.first_seen_at,
          last_seen_at: u.last_seen_at,
          potvardeno: !!u.confirmed_at,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// DELETE /api/auth/devices/:id — забравя устройство и освобождава място
router.delete(
  '/devices/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Невалиден номер на устройство');

    // Човек, който си е продал лаптопа, освобождава място сам, вместо да чака
    // 30 дни или да пише на поддръжката.
    const uspq = await zabraviUstrojstvo(userId, id);
    if (!uspq) throw new NotFoundError('Няма такова устройство');

    res.json({
      success: true,
      message: 'Устройството е премахнато от списъка.',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/auth/confirm-device — потвърждаване по код от имейла
//
// Нарочно БЕЗ authenticate: точно защото човекът не може да влезе, е получил
// този код. Кодът сам по себе си е доказателството — той е стигнал до пощата
// на акаунта, а тя е на собственика.
router.post(
  '/confirm-device',
  asyncHandler(async (req, res) => {
    const kod = String(req.body?.kod || req.body?.token || '');

    const r = await potvardiUstrojstvo(kod);
    if (!r.ok) {
      throw new ValidationError('Линкът е изтекъл или вече е използван. Влез отново, за да получиш нов.');
    }

    res.json({
      success: true,
      data: { ustrojstvo: r.label },
      message: 'Устройството е потвърдено. Вече можеш да влезеш от него.',
      timestamp: new Date().toISOString(),
    });
  })
);

// DELETE /api/auth/sessions/:id — затваря конкретно устройство
router.delete(
  '/sessions/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const id = String(req.params.id || '');

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new ValidationError('Невалиден номер на сесия');
    }

    // `userId` се подава на заявката, а не се проверява отделно: така не
    // съществува миг между „намерихме сесията“ и „затворихме я“, в който
    // чужда сесия да бъде затворена. Чужд номер просто не съвпада с нищо.
    const uspya = await prekrati(id, 'izhod', userId);
    if (!uspya) throw new NotFoundError('Няма такова активно устройство');

    res.json({
      success: true,
      message: 'Устройството беше изключено.',
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/auth/user
router.get(
  '/user',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { db } = require('../db');

    const user = await db.oneOrNone(
      'SELECT id, email, name, avatar_url, theme, language FROM users WHERE id = $1',
      [userId]
    );

    res.json({
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    InputValidator.validateEmail(email);

    // ПОПРАВКА НА СИГУРНОСТТА: токенът НИКОГА не се връща в отговора —
    // отива само по имейл. Иначе всеки може да смени чужда парола.
    await AuthService.requestPasswordReset(email);

    // Един и същ отговор независимо дали имейлът съществува
    // (не разкриваме кои имейли имат акаунт)
    res.json({
      success: true,
      message: 'Ако този имейл има акаунт, изпратихме линк за нова парола.',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, new_password } = req.body;
    await AuthService.resetPassword(token, new_password);
    res.json({
      success: true,
      message: 'Password reset successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/auth/change-password
router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { current_password, new_password } = req.body;

    // Validate input
    if (!current_password) {
      throw new Error('current_password is required');
    }
    InputValidator.validatePassword(new_password);

    await AuthService.changePassword(userId, current_password, new_password);
    res.json({
      success: true,
      message: 'Password changed successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
