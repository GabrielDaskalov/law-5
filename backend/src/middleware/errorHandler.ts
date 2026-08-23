import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppError } from '../types';
import { config } from '../config';

/**
 * Общото съобщение за неочаквани грешки в производство.
 * ПОПРАВКА (изтичане на вътрешни данни): дотук отговорът връщаше `error.message`
 * дословно. При грешка от базата това означава SQL текст, имена на таблици и
 * колони, понякога и част от заявката — безплатна карта на схемата за всеки,
 * който умее да предизвика грешка.
 */
const GENERIC_ERROR_MESSAGE = 'Възникна неочаквана грешка. Опитай отново по-късно.';

export function errorHandler(
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Твърде голям payload (body-parser) → коректен 413, не 500
  if ((error as any)?.type === 'entity.too.large' || (error as any)?.status === 413) {
    res.status(413).json({
      success: false,
      error: 'Payload Too Large',
      message: 'Заявката е твърде голяма.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // request_id свързва оплакването на потребителя с конкретния ред в дневника:
  // той съобщава кода, поддръжката го търси в лога и вижда пълната грешка,
  // без тя някога да е напускала сървъра.
  const requestId = crypto.randomUUID();

  // Очакваните откази (403 „няма покупка“, 422 „сгрешена форма“) са
  // нормална работа, не авария. Ако се пишат в дневника, при 1000 гости
  // на ден дневникът се пълни с „грешки“, които не са грешки, и истинският
  // проблем се губи. Записваме само 5xx.
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  if (statusCode >= 500) {
    console.error(
      `[error] request_id=${requestId} ${req.method} ${req.originalUrl || req.path}`,
      error
    );
  }

  if (error instanceof AppError) {
    // Грешките по полета (валидация на форма) се пренасят до фронтенда,
    // за да се покажат до съответния вход, а не като общо съобщение.
    const fields = (error as AppError & { errors?: Record<string, string> }).errors;

    return res.status(error.statusCode).json({
      success: false,
      error: error.name,
      message: error.message,
      code: error.code,
      ...(fields ? { errors: fields } : {}),
      ...(statusCode >= 500 ? { request_id: requestId } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  // Неочаквана грешка (не е AppError) — всичко в нея е потенциално вътрешно,
  // затова навън отива само общо съобщение и кодът за проследяване.
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message:
      config.nodeEnv === 'production'
        ? GENERIC_ERROR_MESSAGE
        : error.message || 'An unexpected error occurred',
    request_id: requestId,
    timestamp: new Date().toISOString(),
  });
}
