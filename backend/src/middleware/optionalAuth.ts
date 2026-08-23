/**
 * Разпознава потребителя, ако носи валиден токен, но НЕ отказва заявката,
 * ако няма такъв.
 *
 * Нужно е за витрината: каталогът и първите теми на всеки предмет се
 * виждат и от нерегистриран посетител, но ако е влязъл — вижда и това,
 * което е купил. Без такъв междинен слой всеки публичен маршрут трябва
 * да разчита токена ръчно.
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db } from '../db';
import { sesiyataZhivaLi } from '../services/sessionService';

interface TokenPayload {
  user_id: string;
  email: string;
  role: string;
  /** Версия на токените на акаунта; липсва в токените, издадени преди въвеждането ѝ. */
  tv?: number;
  /** Номер на сесията; липсва в токените, издадени преди въвеждането ѝ. */
  sid?: string;
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }

  let payload: TokenPayload;
  try {
    payload = jwt.verify(header.substring(7), config.jwt.secret) as TokenPayload;
  } catch {
    // Невалиден или изтекъл токен — третираме заявката като анонимна,
    // вместо да я отхвърляме. Защитените маршрути пазят сами.
    next();
    return;
  }

  req.user = {
    user_id: payload.user_id,
    email: payload.email,
    role: payload.role,
    session_id: payload.sid,
  };

  // Ролята и активността в токена живеят до изтичането му (24 ч). Затова
  // сверяваме с базата за ВСЕКИ потребител, не само за admin — иначе
  // деактивиран акаунт продължава да чете платено съдържание цяло денонощие.
  db.oneOrNone<{ role: string; is_active: boolean; token_version: number; must_change_password: boolean }>(
    'SELECT role, is_active, token_version, must_change_password FROM users WHERE id = $1',
    [payload.user_id],
  )
    .then(async (user) => {
      // Липсващо `tv` се чете като 0 (стойността по подразбиране в базата) —
      // токените отпреди тази промяна не бива да падат наведнъж.
      const tv = Number(payload.tv ?? 0);
      if (!user || !user.is_active) {
        // Изтрит или деактивиран акаунт — заявката продължава като анонимна.
        req.user = undefined;
      } else if (tv !== user.token_version) {
        // Обезсилен токен (изход или смяна на парола). Тук маршрутът е по
        // избор, затова не отказваме заявката — просто спираме да я броим за
        // влязъл потребител и тя вижда само публичното.
        req.user = undefined;
      } else if (user.must_change_password) {
        // Трета стъпка от прогресивната реакция. Тук маршрутът е публичен,
        // затова заявката не се отказва — просто спира да се брои за влязъл
        // потребител, тоест витрината показва само безплатното. Иначе
        // спряният акаунт продължава да чете купеното точно оттук.
        req.user = undefined;
      } else if (payload.sid && !(await sesiyataZhivaLi(payload.sid, payload.user_id)).ok) {
        // Изхвърлено устройство. Без тази проверка изхвърленият продължава
        // да чете купеното съдържание оттук: маршрутите за витрината минават
        // през този слой, а той дотук гледаше само акаунта, не сесията.
        req.user = undefined;
      } else {
        req.user!.role = user.role;
      }
      next();
    })
    .catch(() => {
      // При проблем с базата НЕ оставяме правата да минат — по-добре
      // отказан достъп, отколкото повишени права при срив.
      req.user = undefined;
      next();
    });
}
