import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const rematesRouter = router({
  list: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        estado: z.string().optional(),
        distrito: z.string().optional(),
        tipoRemate: z.string().optional(),
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.repo.findAll(input);
    }),

  getByExpediente: publicProcedure
    .input(z.string().min(1))
    .query(({ ctx, input }) => {
      return ctx.repo.findByExpediente(input) ?? null;
    }),

  stats: publicProcedure.query(({ ctx }) => {
    return { total: ctx.repo.countAll() };
  }),
});
