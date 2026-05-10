import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';
import { appRouter } from './router';
import { createContext } from './trpc';

export type { AppRouter } from './router';

const app = new Hono();

app.use(
  '/trpc/*',
  trpcServer({
    router: appRouter,
    createContext: (_opts, _c) => createContext(),
  }),
);

app.get('/', (c) => c.json({ status: 'ok', service: 'remaju-api', version: '1.0.0' }));

const PORT = Number(process.env.PORT || 3001);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
