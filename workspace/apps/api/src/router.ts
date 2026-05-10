import { router } from './trpc';
import { rematesRouter } from './routers/remates';

export const appRouter = router({
  remates: rematesRouter,
});

export type AppRouter = typeof appRouter;
