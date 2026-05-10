# API — Pendientes

## 1. Singleton de DB connection

**Problema**: `createContext()` crea un nuevo cliente SQLite en cada request, incluyendo correr las migrations.

**Fix**: Inicializar `db` y `RemateRepository` una sola vez al arrancar el server y pasarlos al contexto tRPC.

```ts
// src/trpc.ts
const db = createSqliteClient(process.env.DATABASE_PATH || './data/remates.db');
const repo = new RemateRepository(db);

export function createContext() {
  return { repo };
}
```

---

## 2. CORS

**Problema**: El dashboard (Next.js) y mobile (Expo) van a llamar a la API desde otro origen. Sin CORS el browser bloquea las requests.

**Fix**: Agregar middleware de CORS en Hono antes del tRPC handler.

```ts
// src/index.ts
import { cors } from 'hono/cors';

app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:8081'],
  allowMethods: ['GET', 'POST'],
}));
```

Agregar los orígenes de producción vía env var cuando se deployee.

---

## 3. Better Auth (próxima feature)

Login con email + password compartido entre dashboard y mobile.
Ver conversación para contexto de la decisión.
