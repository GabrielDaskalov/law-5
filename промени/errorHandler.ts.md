# Промяна в `src/middleware/errorHandler.ts`

Две неща.

## 1. Грешките по полета стигат до фронтенда

```ts
const fields = (error as AppError & { errors?: Record<string, string> }).errors;

return res.status(error.statusCode).json({
  success: false,
  error: error.name,
  message: error.message,
  code: error.code,
  ...(fields ? { errors: fields } : {}),
  timestamp: new Date().toISOString(),
});
```

Формите в админския панел показват съобщението до съответния вход,
вместо едно общо „невалидни данни“.

## 2. Очакваните откази не се пишат в дневника

```ts
const statusCode = error instanceof AppError ? error.statusCode : 500;
if (statusCode >= 500) console.error('Error:', error);
```

403 „няма покупка“ и 422 „сгрешена форма“ са нормална работа. Ако се
записват, при 1000 посетители на ден дневникът се пълни с „грешки“, които
не са грешки, и истинският проблем се губи в тях.

---

## Важно за новите маршрути

И `content.ts`, и `adminContent.ts` хвърлят `HttpError`, който **наследява
`AppError`**. Това не е стилово решение: `errorHandler` разпознава само
`AppError` (по полето `statusCode`). Собствен клас с поле `status` минаваше
през него като непозната грешка и всеки отказ 403/422 излизаше пред
потребителя като „500 сървърна грешка“.
