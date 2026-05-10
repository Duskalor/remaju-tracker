'use client';

import { use } from 'react';
import { api } from '@/lib/trpc';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground font-medium">{label}</dt>
      <dd className="text-sm">{value ?? '—'}</dd>
    </div>
  );
}

export default function RemateDetailPage({ params }: { params: Promise<{ expediente: string }> }) {
  const { expediente } = use(params);
  const decodedExpediente = decodeURIComponent(expediente);

  const { data: remate, isLoading } = api.remates.getByExpediente.useQuery(decodedExpediente);

  if (isLoading) {
    return (
      <div className="min-h-screen p-8">
        <div className="space-y-6 max-w-4xl">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-36" />
                </CardHeader>
                <CardContent className="space-y-4">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="flex gap-4">
                      <Skeleton className="h-4 w-24 shrink-0" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!remate) {
    return (
      <div className="min-h-screen p-8">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Remate no encontrado
          </CardContent>
        </Card>
        <Link
          href="/remates"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-4")}
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a remates
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <Link
        href="/remates"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-6 -ml-2")}
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a remates
      </Link>

      <h1 className="text-3xl font-bold tracking-tight mb-2">
        Remate {remate.expediente}
      </h1>
      <div className="flex gap-2 mb-8">
        <Badge>{remate.estado || '—'}</Badge>
        <Badge variant="secondary">{remate.tipoRemate || '—'}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
        {/* Información General */}
        <Card>
          <CardHeader>
            <CardTitle>Información General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldRow label="Expediente" value={remate.expediente} />
            <FieldRow label="N° de Remate" value={remate.remateNumero} />
            <FieldRow label="Tipo de Inmueble" value={remate.tipoInmueble} />
            <FieldRow label="Juzgado" value={remate.juzgado} />
            <FieldRow label="Bienes" value={remate.bienes} />
          </CardContent>
        </Card>

        {/* Ubicación */}
        <Card>
          <CardHeader>
            <CardTitle>Ubicación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldRow label="Dirección" value={remate.direccion} />
            <FieldRow label="Distrito" value={remate.distrito} />
            <FieldRow label="Provincia" value={remate.provincia} />
            <FieldRow label="Departamento" value={remate.departamento} />
          </CardContent>
        </Card>

        {/* Precios y Dimensiones */}
        <Card>
          <CardHeader>
            <CardTitle>Precios y Dimensiones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldRow label="Partida Registral" value={remate.partida} />
            <FieldRow
              label="Área (m²)"
              value={remate.areaM2 != null ? String(remate.areaM2) : null}
            />
            <FieldRow
              label="Precio por m²"
              value={
                remate.precioPorM2 != null
                  ? `S/. ${remate.precioPorM2.toFixed(2)}`
                  : null
              }
            />
          </CardContent>
        </Card>

        {/* Fechas y Fuente */}
        <Card>
          <CardHeader>
            <CardTitle>Fechas y Fuente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldRow label="Fecha de Remate" value={remate.fechaRemate} />
            <FieldRow label="Observaciones" value={remate.observaciones} />
            <FieldRow label="URL Fuente" value={remate.sourceUrl} />
            <FieldRow label="Extraído el" value={remate.scrapedAt} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
