import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db';
import { config } from '../config';
import { User, AuthResponse, AuthError, ForbiddenError, ValidationError } from '../types';
import { v4 as uuidv4 } from 'uuid';
import validator from 'validator';
import { InputValidator } from '../utils/validation';
// Кешът на състоянието на акаунта живее 60 секунди. Вдигнем ли версията на
// токените, без да го изчистим, старият токен работи още цяла минута.
import { invalidateUserState } from '../middleware/auth';
import { imeNaUstrojstvo, otvoriSesiya, prekratiVsichki } from './sessionService';
import { proveriDvizhenie, registrirajUstrojstvo } from './deviceService';
import { prilozhiStepenka } from './signalService';

/**
 * Откъде идва заявката за вход. Празно е позволено (скриптове, тестове,
 * стари клиенти) — тогава сесията просто няма етикет на устройство.
 */
export type KontekstNaVhod = {
  deviceId?: string;
  userAgent?: string;
  ip?: string;
};

/**
 * Цена на bcrypt хеша. 10 беше стойността по подразбиране от 2010-те; днешният
 * хардуер прави отгатването върху открадната база твърде евтино. 12 е ~4 пъти
 * по-скъпо за нападателя и все още незабележимо при вход.
 * Изнесено в променлива на средата, за да може да се вдигне без ново издание.
 */
const BCRYPT_COST = parseInt(process.env.BCRYPT_COST || '12', 10);

/**
 * Хеш на невъзможна парола, сметнат веднъж при старта.
 *
 * ПОПРАВКА (изброяване на имейли по време): при непознат имейл `login`
 * връщаше отговор веднага, без изобщо да смята bcrypt, а при познат — след
 * ~300ms. Разликата е измерима отвън, тоест всеки можеше да провери кой имейл
 * има акаунт. Сега сравнението се прави ВИНАГИ — срещу този хеш, когато
 * потребител няма — и двата случая струват еднакво време.
 */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_COST);

/**
 * Долен праг за времето на отговор при вход.
 *
 * Защо е нужен: bcrypt ползва цената, записана в самия хеш. Стар акаунт с
 * цена 10 се проверява за ~85 ms, а несъществуващ имейл минава през DUMMY_HASH
 * с цена 12 и отнема ~345 ms. Разликата е видима с просто око в браузъра и
 * издава кои имейли са регистрирани — без да се познава нито една парола.
 * Пре-хеширането при успешен вход изравнява това, но чак след първия вход,
 * тоест спящите акаунти остават разпознаваеми. Прагът затваря прозореца
 * веднага и за всички.
 */
const LOGIN_MIN_MS = parseInt(process.env.LOGIN_MIN_MS || '350', 10);

async function izchakajPrag(zapochnal: bigint): Promise<void> {
  const izteklo = Number(process.hrtime.bigint() - zapochnal) / 1e6;
  const ostava = LOGIN_MIN_MS - izteklo;
  if (ostava > 0) await new Promise((r) => setTimeout(r, ostava));
}

/**
 * Заключване на акаунт при налучкване на парола.
 *
 * Защо е нужно въпреки лимита по IP: лимитът брои опити от един адрес, а
 * password spraying (една популярна парола срещу целия списък имейли) прави
 * по един опит на акаунт от въртящи се адреси — не удря нито един праг.
 * Затова опитите се броят и ПО АКАУНТ.
 *
 * Заключването е ПРОГРЕСИВНО, а не твърдо. Твърдото („заключен до намеса на
 * администратор“) превръща защитата в оръжие: всеки, който знае имейла ти, те
 * държи навън колкото си иска. Тук всяко следващо сгрешване удвоява паузата —
 * 2, 4, 8, 16, 32 и най-много 60 минути — тоест отгатването става безсмислено
 * бавно, а честният потребител чака минути, не дни.
 */
const LOGIN_MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '8', 10);
const LOCK_BASE_MIN = parseInt(process.env.LOGIN_LOCK_BASE_MIN || '2', 10);
const LOCK_MAX_MIN = parseInt(process.env.LOGIN_LOCK_MAX_MIN || '60', 10);

/** Имейлите се сравняват и пазят в единен вид — иначе „Ivan@“ и „ivan@“ са два акаунта. */
function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export class AuthService {
  static async register(
    email: string,
    password: string,
    name: string,
    kontekst?: KontekstNaVhod
  ): Promise<AuthResponse> {
    const normalizedEmail = normalizeEmail(email);

    // Validate input
    if (!validator.isEmail(normalizedEmail)) {
      throw new ValidationError('Invalid email format');
    }

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    if (name.length < 2 || name.length > 100) {
      throw new ValidationError('Name must be between 2 and 100 characters');
    }

    // Check if user exists
    const existing = await db.oneOrNone(
      'SELECT id FROM users WHERE lower(email) = lower($1)',
      [normalizedEmail]
    );

    if (existing) {
      throw new ValidationError('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const userId = uuidv4();

    // Create user — версията на токените се връща от базата, а не се
    // предполага „0“: така стойността в токена винаги идва от един източник.
    const sazdaden = await db.one<{ token_version: number }>(
      `INSERT INTO users (id, email, password_hash, name)
       VALUES ($1, $2, $3, $4)
       RETURNING token_version`,
      [userId, normalizedEmail, passwordHash, name]
    );

    // Регистрацията също отваря сесия — иначе новият акаунт получава токен
    // без `sid` и първата му заявка го изхвърля обратно към формата за вход.
    const sesiya = await otvoriSesiya({
      userId,
      deviceId: kontekst?.deviceId,
      userAgent: kontekst?.userAgent,
      ip: kontekst?.ip,
    });

    return this.generateAuthResponse(
      userId,
      normalizedEmail,
      'student',
      sazdaden.token_version,
      sesiya.sessionId,
      false
    );
  }

  static async login(
    email: string,
    password: string,
    kontekst?: KontekstNaVhod
  ): Promise<AuthResponse> {
    const zapochnal = process.hrtime.bigint();
    const normalizedEmail = normalizeEmail(email);

    // Validate input
    if (!validator.isEmail(normalizedEmail)) {
      throw new ValidationError('Invalid email format');
    }

    // Find user
    // Сравнението „заключен ли е“ се прави от базата, а не в Node: колоната е
    // TIMESTAMP без часова зона и всяко пресмятане отвън зависи от това каква
    // зона има процесът — база и приложение трябва да мерят с един часовник.
    const user = await db.oneOrNone<User & { token_version: number; e_zaklyuchen: boolean }>(
      `SELECT *, (locked_until IS NOT NULL AND locked_until > NOW()) AS e_zaklyuchen
         FROM users
        WHERE lower(email) = lower($1) AND is_active = true`,
      [normalizedEmail]
    );

    // Сравнението се прави и когато потребител няма — виж DUMMY_HASH.
    // Затова НЕ се излиза по-рано: и двата случая минават през bcrypt.
    const passwordMatch = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);

    // Заключен акаунт: отговорът е ДУМА ПО ДУМА същият като при грешна парола.
    // „Акаунтът е временно заключен“ би казало на нападателя две неща наведнъж —
    // че имейлът съществува и че вече е налучквал достатъчно, за да го спрат.
    // Затова пътят минава и през izchakajPrag: тук се спестява работа (няма
    // пре-хеширане, няма запис), а по-бързият отговор издава състоянието и
    // когато текстът мълчи.
    if (user && user.e_zaklyuchen) {
      await izchakajPrag(zapochnal);
      throw new AuthError('Invalid email or password');
    }

    if (!user || !passwordMatch) {
      // Броим само когато акаунтът съществува — за непознат имейл няма ред,
      // в който да пишем, а и няма какво да се заключва.
      if (user) await this.otbelezhiNeuspeshenOpit(user.id);
      await izchakajPrag(zapochnal);
      throw new AuthError('Invalid email or password');
    }

    // Стар хеш с по-ниска цена се пре-хешира при първия успешен вход.
    // Две неща наведнъж: (1) паролите постепенно минават на текущата цена,
    // без никой да бъде изгонен; (2) времето за отговор при съществуващ и
    // при несъществуващ имейл се изравнява — иначе разликата издава кои
    // имейли са регистрирани, без да се познава нито една парола.
    try {
      if (bcrypt.getRounds(user.password_hash || '') < BCRYPT_COST) {
        const presnyah = await bcrypt.hash(password, BCRYPT_COST);
        await db.none('UPDATE users SET password_hash = $1 WHERE id = $2', [presnyah, user.id]);
      }
    } catch (e) {
      // Пре-хеширането е подобрение, не условие за вход — не бива да го чупи.
    }

    // ---------------------------------------------------------- устройството
    // Всичко оттук нататък се случва СЛЕД потвърдена парола. Ако беше преди
    // нея, всеки с чужд имейл можеше да пълни регистъра на жертвата с
    // измислени устройства и да я изкара над лимита — защитата щеше да е
    // оръжие срещу собственика.
    const etiket = imeNaUstrojstvo(kontekst?.userAgent);
    const ustrojstvo = await registrirajUstrojstvo({
      userId: user.id,
      deviceId: kontekst?.deviceId,
      label: etiket,
      ip: kontekst?.ip,
    });

    if (ustrojstvo.vid === 'chaka-potvarzhdenie') {
      // Влизането спира дотук — но акаунтът НЕ се заключва и паролата остава
      // вярна. Единственото, което липсва, е достъп до пощата на акаунта.
      const { EmailService } = await import('./emailService');
      EmailService.sendNovoUstrojstvoZaPotvarzhdenie(
        user.email, ustrojstvo.kod, ustrojstvo.label, kontekst?.ip
      ).catch((e: any) => console.error('[email] потвърждение на устройство:', e));

      throw new ForbiddenError(
        `Това е ново устройство, а акаунтът вече е ползван от ${ustrojstvo.limit} различни `
        + 'устройства този месец. Изпратихме имейл — отвори линка от него и влез отново.',
        'DEVICE_CONFIRM_REQUIRED'
      );
    }

    // Проверката на движението иска СТАРИЯ `last_login`, затова е преди
    // ъпдейта отдолу.
    await proveriDvizhenie(user.id, kontekst?.ip);

    if (ustrojstvo.vid === 'novo') {
      const { EmailService } = await import('./emailService');
      EmailService.sendVhodOtNovoUstrojstvo(
        user.email, ustrojstvo.label, kontekst?.ip
      ).catch((e: any) => console.error('[email] ново устройство:', e));
    }

    // Update last login
    // Успешният вход нулира брояча и вдига заключването: доказал си, че знаеш
    // паролата, значи предишните грешки са били твои опечатки, а не атака.
    await db.none(
      'UPDATE users SET last_login = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [user.id]
    );

    // Прогресивната реакция се смята СЛЕД успешния вход. Преди него човек с
    // наистина открадната парола би бил спрян, без изобщо да може да влезе и
    // да я смени — тоест мярката щеше да работи в полза на крадеца.
    const stepenka = await prilozhiStepenka(user.id);

    // Сесията се отваря СЛЕД като паролата е потвърдена — иначе всеки
    // непознат с чужд имейл би могъл да изхвърля собственика му от акаунта
    // просто като бърка паролата достатъчно често.
    const sesiya = await otvoriSesiya({
      userId: user.id,
      deviceId: kontekst?.deviceId,
      userAgent: kontekst?.userAgent,
      ip: kontekst?.ip,
    });

    // Generate token — ролята идва от базата (поправка: беше хардкодната 'student')
    const otgovor = this.generateAuthResponse(
      user.id,
      user.email,
      (user as any).role || 'student',
      user.token_version,
      sesiya.sessionId,
      sesiya.izhvarleni > 0
    );

    // Съобщението пътува до фронтенда само от степен 2 нагоре. На степен 0 и
    // 1 потребителят не вижда нищо — първата стъпка е тиха нарочно.
    if (stepenka.sabshtenie) otgovor.preduprezhdenie = stepenka.sabshtenie;
    if (stepenka.stepen >= 3) otgovor.iska_nova_parola = true;

    return otgovor;
  }

  /**
   * Отбелязва провален опит и, щом опитите стигнат прага, заключва акаунта за
   * прогресивно нарастващо време.
   *
   * Всичко е в ЕДНА заявка (`failed_login_attempts + 1` се чете и записва от
   * базата), за да не могат две едновременни налучквания да прочетат едно и
   * също число и да презапишат опита си взаимно.
   */
  private static async otbelezhiNeuspeshenOpit(userId: string): Promise<void> {
    try {
      await db.none(
        `UPDATE users
            SET failed_login_attempts = failed_login_attempts + 1,
                locked_until = CASE
                  WHEN failed_login_attempts + 1 >= $2::int
                    THEN NOW() + (LEAST(
                           $4::int,
                           ($3::int * POWER(2, LEAST(20, failed_login_attempts + 1 - $2::int)))::int
                         )::int * INTERVAL '1 minute')
                  ELSE locked_until
                END
          WHERE id = $1`,
        [userId, LOGIN_MAX_ATTEMPTS, LOCK_BASE_MIN, LOCK_MAX_MIN]
      );
    } catch (e) {
      // Броенето е защита, не част от отговора. Ако писането се провали,
      // потребителят трябва да види точно същия отказ — иначе разликата
      // между „не успях да броя“ и „преброих“ пак издава състоянието.
      console.error('[auth] провален опит не беше записан:', e);
    }
  }

  static async validateToken(token: string): Promise<{ user_id: string; email: string; role: string }> {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as any;
      return {
        user_id: payload.user_id,
        email: payload.email,
        role: payload.role,
      };
    } catch (error) {
      throw new AuthError('Invalid or expired token');
    }
  }

  /**
   * Хешът, с който токенът за нова парола се пази в базата.
   *
   * ПОПРАВКА: досега токенът стоеше в чист вид. Всеки с достъп до базата —
   * копие на дъмп, срив в друга услуга, любопитен колега — можеше да вземе
   * жив токен и да смени чужда парола. Сега базата пази само хеша: от него
   * токен не се възстановява, а проверката работи по същия начин.
   */
  private static hashResetToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  static async requestPasswordReset(email: string): Promise<string> {
    const normalizedEmail = normalizeEmail(email);
    const neutralResponse = 'If email exists, reset link has been sent';

    const user = await db.oneOrNone<User>(
      'SELECT id FROM users WHERE lower(email) = lower($1)',
      [normalizedEmail]
    );

    if (!user) {
      // Don't reveal if email exists for security
      return neutralResponse;
    }

    // Старите токени на този потребител спират да важат. Иначе всяко ново
    // искане само добавяше още един жив ключ към акаунта.
    await db.none(
      'UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false',
      [user.id]
    );

    // 32 случайни байта от crypto — uuidv4 носи само 122 бита и част от него
    // е предвидима (версия/вариант, а при някои реализации и време).
    const resetToken = crypto.randomBytes(32).toString('base64url');
    // 1 час: достатъчно да отвориш имейла си, недостатъчно токенът да живее
    // ден в пощенска кутия, до която някой друг може да се добере.
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.none(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, this.hashResetToken(resetToken), expiresAt]
    );

    // Изпрати имейла с линка (не блокира отговора при грешка).
    // По имейл отива ОРИГИНАЛЪТ — в базата остана само хешът му.
    const { EmailService } = await import('./emailService');
    EmailService.sendPasswordResetEmail(normalizedEmail, resetToken).catch((e: any) =>
      console.error('[email] password reset:', e)
    );

    // Токенът НЕ се връща на извикващия — единственият му път навън е имейлът.
    return neutralResponse;
  }

  static async resetPassword(token: string, newPassword: string): Promise<void> {
    // ПОПРАВКА: тук стоеше само проверка за дължина, тоест през „забравена
    // парола“ се заобикаляше политиката, която важи при регистрация и смяна.
    InputValidator.validatePassword(newPassword);

    if (!token || typeof token !== 'string') {
      throw new AuthError('Invalid or expired reset token');
    }

    // Хешът се смята извън транзакцията — bcrypt държи връзка към базата
    // заета за нищо, ако е вътре.
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    const tokenHash = this.hashResetToken(token);

    // Проверката и отбелязването „използван“ са ЕДНА стъпка: `UPDATE ...
    // WHERE used = false RETURNING user_id` — редът се заключва от базата,
    // така че от две едновременни заявки с един и същ токен минава точно
    // едната. Разделени (SELECT, после UPDATE) двете можеха да минат заедно.
    const userId = await db.tx(async (t) => {
      const resetRecord = await t.oneOrNone<{ user_id: string }>(
        `UPDATE password_reset_tokens
            SET used = true
          WHERE token = $1 AND expires_at > NOW() AND used = false
        RETURNING user_id`,
        [tokenHash]
      );

      if (!resetRecord) {
        throw new AuthError('Invalid or expired reset token');
      }

      // Версията на токените се вдига В СЪЩАТА транзакция като хеша.
      // „Забравена парола“ се ползва точно когато акаунтът е компрометиран —
      // ако старите токени преживеят смяната, нападателят остава вътре до 24
      // часа, а потребителят си мисли, че се е спасил.
      await t.none(
        `UPDATE users
            SET password_hash = $1, token_version = token_version + 1,
                must_change_password = false, signali_ochisteni_do = NOW()
          WHERE id = $2`,
        [passwordHash, resetRecord.user_id]
      );

      return resetRecord.user_id;
    });

    // Извън транзакцията: кешът се чисти чак след като смяната е потвърдена.
    invalidateUserState(userId);

    // И редовете на сесиите падат. Вдигнатата версия на токените и без това
    // ги обезсилва, но ако останат отбелязани като активни, „Моите
    // устройства“ ще показва устройства, които вече не са вътре — а точно
    // този екран се гледа, когато човек се съмнява, че някой му ползва акаунта.
    await prekratiVsichki(userId, 'nova-parola');
  }

  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    // Find user
    const user = await db.oneOrNone<User>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (!user) {
      throw new AuthError('User not found');
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash || '');

    if (!passwordMatch) {
      throw new AuthError('Current password is incorrect');
    }

    // Validate new password
    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters long');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

    // Update password
    // Хешът и версията на токените се сменят с ЕДНА заявка, тоест атомарно:
    // не бива да има миг, в който паролата е нова, а старите сесии още важат.
    // Смяната на парола е това, което човек прави, щом усети, че някой му е
    // влязъл — ако не изхвърли чуждата сесия, не е свършила нищо.
    await db.none(
      `UPDATE users
          SET password_hash = $1, token_version = token_version + 1,
              must_change_password = false, signali_ochisteni_do = NOW()
        WHERE id = $2`,
      [newPasswordHash, userId]
    );

    // Иначе старият токен минава още до минута — колкото е кешът в authenticate.
    invalidateUserState(userId);
    await prekratiVsichki(userId, 'nova-parola');
  }

  private static generateAuthResponse(
    userId: string,
    email: string,
    role: string,
    tokenVersion: number,
    sessionId: string,
    izhvarlenoUstrojstvo: boolean
  ): AuthResponse {
    const expiresIn = '24h';
    const token = jwt.sign(
      {
        user_id: userId,
        email,
        role,
        // Версия на токените на акаунта. При изход и при смяна на парола
        // версията в базата се вдига с 1 и всеки токен с по-стара стойност
        // спира да важи веднага, вместо да живее до изтичането си.
        tv: tokenVersion,
        // Номер на сесията. Дотук токенът казваше само КОЙ си; сега казва и
        // ОТКЪДЕ — от кое влизане е издаден. Прекрати ли се това влизане,
        // токенът пада заедно с него, макар подписът му да е още валиден.
        sid: sessionId,
      },
      config.jwt.secret,
      { expiresIn }
    );

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return {
      user_id: userId,
      token,
      expires_at: expiresAt,
      session_id: sessionId,
      izhvarleno_ustrojstvo: izhvarlenoUstrojstvo,
    };
  }
}
