'use client';

import { api } from '@/lib/trpc';
import Link from 'next/link';
import { BarChart3, Gavel, TrendingUp, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function HomePage() {
  const { data: stats, isLoading } = api.remates.stats.useQuery();

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">REMAJU Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Sistema de inteligencia de remates judiciales
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card className="py-0">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-2 bg-primary/10 rounded-full shrink-0">
              <Gavel className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Total Remates</p>
              {isLoading ? (
                <Skeleton className="h-9 w-24 mt-1" />
              ) : (
                <p className="text-3xl font-bold">{stats?.total ?? 0}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Remates judiciales registrados
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="py-0">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-2 bg-primary/10 rounded-full shrink-0">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">En Proceso</p>
              <p className="text-3xl font-bold">&mdash;</p>
              <p className="text-xs text-muted-foreground mt-1">Próximamente</p>
            </div>
          </CardContent>
        </Card>

        <Card className="py-0">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-2 bg-primary/10 rounded-full shrink-0">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Adjudicados</p>
              <p className="text-3xl font-bold">&mdash;</p>
              <p className="text-xs text-muted-foreground mt-1">Próximamente</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Link
        href="/remates"
        className={cn(buttonVariants({ variant: "default" }), "inline-flex items-center gap-2")}
      >
        Ver Remates
        <ExternalLink className="h-4 w-4" />
      </Link>
    </div>
  );
}
