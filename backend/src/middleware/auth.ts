import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db } from '../db';
import { AuthError, ForbiddenError } from '../types';
import { OBYASNENIE, sesiyataZhivaLi } from '../services/sessionService';

declare global {
  namespace Express {
    interface Request {
      user?: {
        user_id: string;
        email: string;
        role: string;
        /** Кое влизане е издало този токен — редът в user_sessions. */
        session_id?: string;
      };
    }
  }
}

/**
 * Токени без номер на сесия (`sid`).
 *
 * Издадените преди тази промяна нямат такова поле. По подразбиране НЕ се
 * приемат: ако се приемат, остава дупка — токен без сесия не може да бъде
 * изхвърлен от нищо и живее до 24 часа извън всякакъв контрол. Цената е, че
 * при пускането на промяната всички влезли влизат отново веднъж.
 *
 * Ако това пречи (пускане в час пик), SESSIONS_GRACE=true ги пропуска. Да се
 * върне на false до едно денонощие — дотогава всички стари токени са изтекли.
 */
const GRATSIYA_BEZ_SESIYA = process.env.SESSIONS_GRACE === 'true';

/**
 * Кеш на състоянието на акаунта (роля + активен), за да не струва DB заявка
 * на всяка отделна заявка към API-то. 60 секунди е компромисът: свален админ
 * или блокиран акаунт губи достъп до минута, а натоварването остава пренебрежимо.
 */
type UserState = {
  role: string;
  is_active: boolean;
  token_version: number;
  must_change_password: boolean;
  exp: number;
};
const USER_STATE_TTL_MS = 60 * 1000;
const userStateCache = new Map<string, UserState>();

/** Сваля потребителя от кеша или от базата. Хвърля, ако базата е недостъпна. */
type ZapisZaPotrebitel = {
  role: string;
  is_active: boolean;
  token_version: number;
  must_change_password: boolean;
};

async function loadUserState(userId: string): Promise<ZapisZaPotrebitel | null> {
  const now = Date.now();
  const cached = userStateCache.get(userId);
  if (cached && cached.exp > now) {
    return {
      role: cached.role,
      is_active: cached.is_active,
      token_version: cached.token_version,
      must_change_password: cached.must_change_password,
    };
  }

  // token_version идва заедно с ролята — същият ред, същата заявка, без цена.
  const user = await db.oneOrNone<ZapisZaPotrebitel>(
    'SELECT role, is_active, token_version, must_change_password FROM users WHERE id = $1',
    [userId]
  );

  if (!user) {
    // Изтрит акаунт — кешираме отрицателния резултат, иначе всяка заявка
    // с този (все още валиден) токен удря базата.
    userStateCache.set(userId, {
      role: 'none',
      is_active: false,
      token_version: 0,
      must_change_password: false,
      exp: now + USER_STATE_TTL_MS,
    });
    return null;
  }

  userStateCache.set(userId, { ...user, exp: now + USER_STATE_TTL_MS });
  return user;
}

/**
 * Какво остава отворено, когато акаунтът е спрян до смяна на паролата.
 *
 * Списъкът е нарочно къс, но не празен: човек трябва да може да види
 * съобщението, да смени паролата, да разгледа устройствата си и да излезе.
 * Заключване без изход е наказание, а не мярка.
 */
const RAZRESHENO_PRI_ISKANE_ZA_PAROLA = [
  '/api/auth/change-password',
  '/api/auth/logout',
  '/api/auth/logout-all',
  '/api/auth/sessions',
  '/api/auth/devices',
  '/api/auth/user',
  '/api/user/profile',
  '/health',
];

/**
 * Изхвърля потребителя от кеша — за след смяна на роля, деактивиране или
 * вдигане на token_version (изход, смяна на парола). Без това новото
 * състояние важи чак след изтичането на кеша, тоест до минута по-късно.
 */
export function invalidateUserState(userId: string): void {
  userStateCache.delete(userId);
}

/**
 * Версията на токените от полезния товар.
 *
 * Токените, издадени преди тази промяна, нямат `tv`. Ако липсата се броеше за
 * несъответствие, пускането щеше да изхвърли всички влезли потребители
 * наведнъж — затова липсващото се чете като 0, колкото е и стойността по
 * подразбиране в базата. Всеки изход или смяна на парола вдига версията и
 * тези стари токени отпадат от само себе си.
 */
function versiyaNaTokena(payload: any): number {
  const tv = Number(payload?.tv ?? 0);
  return Number.isFinite(tv) ? tv : -1;
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('No authorization token provided');
  }

  const token = authHeader.substring(7);

  let payload: any;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch (error) {
    throw new AuthError('Invalid or expired token');
  }

  req.user = {
    user_id: payload.user_id,
    email: payload.email,
    role: payload.role,
    session_id: typeof payload.sid === 'string' ? payload.sid : undefined,
  };

  // ПОПРАВКА: ролята живее в токена до 24ч — свален админ оставаше админ.
  //
  // Досега базата се питаше САМО когато токенът твърди 'admin'. Два проблема:
  //  1) Деактивиран (или изтрит) студент запазваше достъп до изтичането на
  //     токена — включително до платено съдържание след изтриване на акаунта.
  //  2) При грешка в базата `.catch(() => next())` пускаше заявката напред с
  //     ролята от токена — тоест срив на базата = отворена врата (fail-open).
  //
  // Сега: проверява се ВСЕКИ потребител, ролята се взима от базата (токенът е
  // само доказателство кой си, не какъв си), а при недостъпна база заявката се
  // отказва (fail-closed). Кешът от 60 секунди държи цената ниска.
  loadUserState(payload.user_id)
    .then(async (u) => {
      if (!u || !u.is_active) {
        return next(new AuthError('Account is inactive or no longer exists'));
      }
      // Токенът е обезсилен: потребителят е излязъл или си е сменил паролата,
      // а този токен е издаден преди това. Дотук „Изход“ не правеше нищо на
      // сървъра — открадната сесия живееше до 24 часа въпреки новата парола.
      if (versiyaNaTokena(payload) !== u.token_version) {
        return next(new AuthError('Token has been revoked'));
      }

      // Сесията: жив ли е още редът, издал този токен.
      const sid = req.user!.session_id;
      if (!sid) {
        if (!GRATSIYA_BEZ_SESIYA) {
          return next(new AuthError('Влез отново.', 'SESSION_REQUIRED'));
        }
      } else {
        const s = await sesiyataZhivaLi(sid, payload.user_id);
        if (!s.ok) {
          // Причината пътува до фронтенда, за да покаже изречение вместо
          // мълчалив изход. „Влезе от друго устройство“ е разликата между
          // „сайтът се счупи“ и „системата брои устройствата“.
          return next(
            new AuthError(
              OBYASNENIE[s.prichina] || 'Сесията е прекратена. Влез отново.',
              'SESSION_REVOKED:' + s.prichina
            )
          );
        }
      }

      req.user!.role = u.role;

      // Трета стъпка от прогресивната реакция: акаунтът е спрян до смяна на
      // паролата. Не е заключване — ключът е у самия човек, а точно смяната
      // е и правилното действие, ако паролата му е тръгнала по ръцете.
      if (u.must_change_password) {
        const pat = req.originalUrl || req.path || '';
        const razresheno = RAZRESHENO_PRI_ISKANE_ZA_PAROLA.some((r) => pat.startsWith(r));
        if (!razresheno) {
          return next(
            new ForbiddenError(
              'За да продължиш, смени паролата си от Настройки. '
              + 'Това изхвърля всички други устройства от акаунта.',
              'PASSWORD_CHANGE_REQUIRED'
            )
          );
        }
      }

      next();
    })
    .catch((err) => {
      console.error('[auth] проверката на акаунта се провали:', err);
      next(new AuthError('Authentication unavailable'));
    });
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AuthError('User not authenticated');
    }

    // ПОПРАВКА: липсата на права е 403, не 401. AuthError връщаше 401 и
    // фронтендът приемаше отказа за „изтекъл вход“ — влезлият потребител
    // биваше изхвърлян към формата за вход вместо да види „нямаш достъп“.
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    next();
  };
}

/**
 * Централната проверка за админ.
 *
 * Досега всеки маршрутен файл си носеше собствено копие на `requireAdmin`
 * (12 на брой) и точно затова някъде проверката липсваше. Новите маршрути
 * ползват този експорт; локалните копия се мигрират отделно, за да не се
 * пипат 12 файла наведнъж.
 */
export const requireAdmin = authorize('admin');

export function asyncHandler(
  // Promise<any>: позволява `return res.status(...).json(...)` в handler-ите —
  // това е стандартна Express практика и връщаната стойност не се използва.
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any> | any
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
