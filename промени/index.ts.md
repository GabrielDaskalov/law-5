# Промени в `src/index.ts`

Два реда за импорт и два за монтиране. Редът им има значение.

## 1. Импорти — до останалите маршрути

```ts
import accountRoutes from './routes/account';
// Law+ (нов модел на съдържанието, миграция 010)
import contentRoutes from './routes/content.new';
import adminContentRoutes from './routes/adminContent';
```

## 2. Монтиране — ПРЕДИ всички останали `/api` маршрути

```ts
// Law+ (нов модел): монтират се ПЪРВИ.
// accountRoutes е закачен на голото '/api' и съдържа стария '/content/:id';
// ако мине преди тях, той прихваща новите адреси и връща 401 на публичния
// каталог. adminRoutes пък е по-общ от '/api/admin/content'.
app.use('/api/admin/content', adminContentRoutes);
app.use('/api/content', contentRoutes);

app.use('/api/auth', authRoutes);
// … останалите както са били
```

**Ако се монтират по-надолу, симптомът е:** публичният каталог започва да
връща `401 No authorization token provided` без видима причина. Причината е
`app.use('/api', accountRoutes)`, който отговаря на `/api/content/:subjectId`
преди новия маршрутизатор.
