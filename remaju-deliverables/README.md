# Entregables — REMAJU Scoring System

Este paquete contiene el plan completo + código inicial para el proyecto. **No reemplaza tu código existente** — agrega cosas nuevas y modifica el schema. Hacé backup antes de aplicar nada.

## Contenido

```
.
├── PRD.md                                       ← Plan completo del proyecto
├── README.md                                    ← Este archivo
│
├── migrations/
│   └── 0001_add_scoring_and_detail_enrichment.sql   ← Migration SQL para SQLite
│
├── packages/
│   ├── database/
│   │   └── schema.ts                            ← Reemplaza tu schema actual
│   │
│   └── scoring-engine/                          ← Package nuevo, copiar entero
│       ├── package.json
│       ├── README.md
│       └── src/
│           ├── index.ts
│           ├── types.ts
│           ├── weights.ts
│           ├── score.ts
│           ├── rules/                           ← 8 reglas
│           ├── filters/
│           └── __tests__/
│
└── apps/
    └── scraper/
        └── src/
            └── detail/
                └── scrape-detail.ts             ← Esqueleto del Sprint 2
```

## Orden de aplicación

### Paso 1 — Lee el PRD

Abrí `PRD.md` y revisá que el plan refleje lo que conversamos. Si hay algo que querés ajustar (pesos, frecuencia, prioridades), modificalo antes de codear.

### Paso 2 — Backup de la DB

```bash
cp apps/api/remaju.db apps/api/remaju.db.backup-$(date +%Y%m%d)
```

### Paso 3 — Aplicar la migration

```bash
cd apps/api  # o donde tengas remaju.db
sqlite3 remaju.db < /ruta/a/migrations/0001_add_scoring_and_detail_enrichment.sql
```

Verificá:
```bash
sqlite3 remaju.db "SELECT COUNT(*) AS pendientes FROM remates WHERE detail_scraped_at IS NULL;"
# Debería decir 352 (todos pendientes)

sqlite3 remaju.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'remate%';"
# Debería listar: remates, remate_inmuebles, remate_cronograma
```

### Paso 4 — Reemplazar el schema de Drizzle

```bash
cp packages/database/schema.ts /ruta/a/tu/repo/packages/database/src/schema.ts
```

Verificá que compile:
```bash
cd /ruta/a/tu/repo
pnpm type-check
```

### Paso 5 — Copiar el scoring-engine package

```bash
cp -r packages/scoring-engine /ruta/a/tu/repo/packages/
```

Agregalo al workspace si Turborepo lo necesita (probablemente ya lo detecte automáticamente con pnpm workspaces). Después:

```bash
cd /ruta/a/tu/repo
pnpm install  # registra el nuevo package
cd packages/scoring-engine
pnpm test     # debería pasar 19/19 tests
```

### Paso 6 — Copiar el esqueleto del detail scraper

```bash
mkdir -p /ruta/a/tu/repo/apps/scraper/src/detail
cp apps/scraper/src/detail/scrape-detail.ts /ruta/a/tu/repo/apps/scraper/src/detail/
```

**Este archivo NO está completo.** Es un esqueleto con la estructura y la lógica documentada. Lo que falta:

1. **Conectar a la DB real:** los `// db.update(...)` están comentados. Reemplazalos con tus imports de `@remaju/database`.
2. **Implementar los 3 parsers** (`parsers/tab-remate.ts`, `parsers/tab-inmuebles.ts`, `parsers/tab-cronograma.ts`).
3. **Probar contra el portal real** con 1-2 remates antes de soltar el batch completo.

Los parsers son trabajo de ~1 día. Los HTMLs ejemplo están en el PRD para guiarte.

### Paso 7 — Agregar scripts al package.json

En `apps/scraper/package.json`:

```json
{
  "scripts": {
    "scrape:listing": "tsx src/listing/index.ts",
    "scrape:detail": "tsx src/detail/scrape-detail.ts",
    "rescore": "tsx src/rescore/index.ts"
  }
}
```

## Cómo correr todo en orden (cuando esté implementado)

```bash
# Setup inicial (una sola vez)
pnpm scrape:listing                # ya lo tenés, llena 352 remates
pnpm scrape:detail                 # toma ~50min, llena el detalle de los 352
pnpm rescore                       # calcula score de todos

# Operación diaria (cron 3am)
0 3 * * * pnpm scrape:listing && pnpm scrape:detail && pnpm rescore
```

## Sprints pendientes

Lo que entregué cubre Sprint 1 (schema) y Sprint 3 (scoring engine completo). Los otros sprints quedan pendientes:

- **Sprint 2 — Detail scraper**: esqueleto entregado, falta implementar parsers + conexión a DB (~2-3 días)
- **Sprint 4 — API + Dashboard**: agregar endpoint `remates.ranking` + vista de ranking (~1-2 días)

El PRD tiene los detalles de cada uno.

## Validación rápida del scoring engine

Probá que funciona con un remate sintético:

```typescript
import { scoreRemate } from '@remaju/scoring-engine';

const result = scoreRemate({
  id: 1,
  expediente: 'TEST',
  remate_numero: 'TEST',
  tasacion: 200000,
  precio_base: 100000, // 50% descuento
  convocatoria: 'SEGUNDA',
  num_inscritos: 0,
  materia: 'EJECUCION DE GARANTIAS',
  inmueble: {
    tipo_inmueble: 'DEPARTAMENTO',
    distrito: 'CUSCO',
    provincia: 'CUSCO',
    departamento: 'CUSCO',
    porcentaje_rematar: 100,
    num_cargas: 1,
    tiene_hipoteca: true,
    tiene_embargo: false,
    embargo_terceros: false,
  },
  fecha_fin_inscripcion: new Date(Date.now() + 10 * 86400000).toISOString(),
  fecha_fin_ofertas: new Date(Date.now() + 13 * 86400000).toISOString(),
  estado_temporal: 'inscripcion_abierta',
  archived_at: null,
  detail_extraction_failed: false,
  detail_scraped_at: new Date().toISOString(),
});

console.log(JSON.stringify(result, null, 2));
// Debería dar score ~85+ (excelente oportunidad)
```

## Dudas o problemas

Si algo no encaja con tu setup actual del monorepo (paths, configs de Turborepo, etc.), avisame y ajustamos. El scoring engine es completamente independiente y debería funcionar tal cual; el schema y el scraper sí dependen de cómo tengas armado tu proyecto.
