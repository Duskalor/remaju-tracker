import { createTRPCReact, type CreateTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@remaju/api';

export const api: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();
