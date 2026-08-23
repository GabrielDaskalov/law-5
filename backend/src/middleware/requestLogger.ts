import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const method = req.method;
  const url = req.path;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const statusColor =
      statusCode >= 500
        ? '\x1b[31m' // Red
        : statusCode >= 400
          ? '\x1b[33m' // Yellow
          : statusCode >= 300
            ? '\x1b[36m' // Cyan
            : '\x1b[32m'; // Green

    if (config.logLevel === 'debug' || statusCode >= 400) {
      console.log(
        `${statusColor}${method} ${url} ${statusCode}\x1b[0m ${duration}ms`
      );
    }
  });

  next();
}
