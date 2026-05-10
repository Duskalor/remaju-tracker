'use client';

import { useState } from 'react';
import { api } from '@/lib/trpc';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function RematesPage() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = api.remates.list.useQuery({ page, limit });
  const totalPages = Math.ceil((data?.total ?? 0) / limit);

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2 -ml-2")}
        >
          ← Volver al Dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Remates Judiciales</h1>
        <p className="text-muted-foreground mt-1">
          Lista completa de remates extraídos del sistema REMAJU
          {data && (
            <span> — Total: <strong>{data.total}</strong> remates</span>
          )}
        </p>
      </header>

      {isLoading ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Expediente</TableHead>
                <TableHead>Distrito</TableHead>
                <TableHead>Provincia</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : !data || data.data.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No se encontraron remates
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Expediente</TableHead>
                  <TableHead>Distrito</TableHead>
                  <TableHead>Provincia</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((remate) => (
                  <TableRow key={remate.expediente}>
                    <TableCell className="font-medium">{remate.expediente}</TableCell>
                    <TableCell className="text-muted-foreground">{remate.distrito || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{remate.provincia || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{remate.departamento || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={remate.estado === 'ADJUDICADO' ? 'default' : 'secondary'}>
                        {remate.estado || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{remate.tipoRemate || '—'}</TableCell>
                    <TableCell>
                      <Link
                        href={`/remates/${encodeURIComponent(remate.expediente)}`}
                        className={buttonVariants({ variant: "link", size: "sm" })}
                      >
                        Ver detalle
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Página {page} de {totalPages || 1}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(data?.data.length ?? 0) < limit}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
