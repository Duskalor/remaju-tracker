# REMAJU — Estado de implementación
**Última actualización:** 2026-05-12

---

## Resumen rápido

| Sprint | Descripción | Estado |
|--------|-------------|--------|
| S1 — Schema + migration | Nuevas tablas y columnas en DB | ⏳ Listo en deliverables, NO aplicado |
| S2 — Detail scraper | Scraper de página de detalle por remate | 🔨 Esqueleto en deliverables, NO aplicado |
| S3 — Scoring engine | Motor de puntuación de oportunidades | ⏳ Completo en deliverables, NO aplicado |
| S4 — API + Dashboard ranking | Endpoint ranking + vista UI | ❌ No empezado |

---

## Lo que está funcionando HOY en el monorepo

### `workspace/apps/scraper`
- Scraper de listado funcionando con Playwright
- 352 remates en DB
- Anti-WAF: user agent real, delays, comportamiento humano
- Estructura: `main.ts` → `scraper.ts` → `browser/` + `parsing/`

### `workspace/apps/api`
- tRPC + Hono, 3 endpoints: `remates.findAll`, `remates.findById`, `remates.stats`
- Paginación funcional

### `workspace/apps/dashboard`
- Next.js 15, React 19, Tailwind v4
- Vista de remates con tRPC client

### `workspace/packages/database`
- Schema Drizzle + SQLite
- Tabla `remates` con campos del listado únicamente
- **Sin tablas**: `remate_inmuebles`, `remate_cronograma`, `scraping_runs`
- **Sin columnas**: tasacion, precio_base, score, convocatoria, num_inscritos, etc.

---

## `remaju-deliverables/` — Qué hay y qué falta aplicar

### Sprint 1 — Schema + Migration
**Archivo:** `remaju-deliverables/migrations/0001_add_scoring_and_detail_enrichment.sql`
**Estado:** ⏳ LISTO — pendiente de aplicar

Qué hace:
- Agrega ~25 columnas nuevas a `remates` (tasacion, precio_base, score, convocatoria, etc.)
- Crea tabla `remate_inmuebles` (relación 1:N — un remate puede tener N inmuebles)
- Crea tabla `remate_cronograma` (5 fases del proceso judicial)
- Crea tabla `scraping_runs` (auditoría de corridas)
- Crea índices de performance
- Backfill automático de `last_seen_at`

Para aplicar:
```bash
sqlite3 workspace/apps/scraper/data/remates.db < remaju-deliverables/migrations/0001_add_scoring_and_detail_enrichment.sql
```

**Archivo:** `remaju-deliverables/packages/database/schema.ts`
**Estado:** ⏳ LISTO — reemplaza `workspace/packages/database/src/schema.ts`

---

### Sprint 2 — Detail scraper
**Archivo:** `remaju-deliverables/apps/scraper/src/detail/scrape-detail.ts`
**Estado:** 🔨 ESQUELETO — estructura completa, faltan parsers y conexión DB

Lo que SÍ está implementado:
- Orquestador con loop de retries (3 intentos por remate)
- Rate limiting: 3s entre requests (respeta el portal)
- CLI: `--limit N`, `--remate NNNNN`, `--force`, `--refresh-days N`
- Navegación Playwright: buscador → captcha "x" → click Detalle → 3 tabs
- Selectores semánticos estables (no usa IDs JSF hasheados)
- `parseCargas()`: detecta hipoteca / embargo / embargo de terceros del texto crudo
- `computeEstadoTemporal()`: calcula estado desde fechas del cronograma

Lo que FALTA implementar:
- `parsers/tab-remate.ts` — parsear campos económicos y legales de la pestaña Remate
- `parsers/tab-inmuebles.ts` — parsear tabla de inmuebles (tipo, distrito, cargas, etc.)
- `parsers/tab-cronograma.ts` — parsear tabla de 5 fases con fechas
- Descommentar y conectar todos los `db.update/insert/select` a `@remaju/database`
- `selectPendingRemates()` actualmente tira `throw new Error` — conectar a Drizzle

Estimado: ~2 días de trabajo para los 3 parsers + conexión DB.

---

### Sprint 3 — Scoring engine
**Carpeta:** `remaju-deliverables/packages/scoring-engine/`
**Estado:** ⏳ COMPLETO — pendiente de copiar al monorepo

Qué incluye:
- `src/types.ts` — interfaces `RemateInput`, `ScoreResult`, `SubScore`, `ScoringConfig`
- `src/weights.ts` — `DEFAULT_CONFIG` con 8 pesos + `loadConfig()` desde JSON externo + `normalizeWeights()`
- `src/score.ts` — `scoreRemate()` pura + `scoreRemates()` para batch
- `src/filters/hard-filters.ts` — 4 filtros de exclusión (archivado, falló, cerrado, <50%)
- `src/rules/` — 8 reglas implementadas:

| Regla | Peso | Qué mide |
|-------|------|----------|
| `descuento_tasacion` | 30% | `(tasacion - precio_base) / tasacion` → margen de flip |
| `riesgo_legal` | 20% | Penaliza cargas, embargos, embargo de terceros |
| `convocatoria` | 10% | 1ra=33, 2da=66, 3ra=100 |
| `porcentaje_rematar` | 10% | 100% = ideal, <100% penalizado |
| `competencia` | 10% | Menos inscritos = mejor |
| `tipo_inmueble` | 10% | DEPARTAMENTO/CASA=100, TERRENO=70, OFICINA=40 |
| `tiempo_disponible` | 5% | Días hasta fin de inscripción |
| `completitud` | 5% | % de campos críticos con datos |

- `src/__tests__/score.test.ts` — 19 tests con Vitest (casos extremos, hard filters, determinismo)
- Config tunable vía JSON externo sin redeploy

Para aplicar:
```bash
cp -r remaju-deliverables/packages/scoring-engine workspace/packages/
# agregar al workspace en pnpm-workspace.yaml si no se detecta automático
pnpm install
cd workspace/packages/scoring-engine && pnpm test  # debería pasar 19/19
```

---

### Sprint 4 — API + Dashboard ranking
**Estado:** ❌ NO EMPEZADO

Qué falta construir:
- Endpoint tRPC `remates.ranking` (paginado, filtros por departamento/tipo/score)
- Endpoint tRPC `remates.scoreBreakdown` (desglose de un remate específico)
- Vista "Top Oportunidades" en dashboard
- Cards con score + botón "ver desglose"
- Filtros UI

Estimado: ~1-2 días una vez que S1+S2+S3 estén aplicados.

---

## Flujo objetivo cuando todo esté implementado

```
3:00 AM  pnpm scrape:listing     → descubre nuevos remates, UPSERT en DB
3:10 AM  pnpm scrape:detail      → enriquece con datos de la página de detalle
3:15 AM  pnpm rescore            → calcula score de todos los remates activos
```

Dashboard muestra top oportunidades con score 0-100 y desglose explicado.

---

## Orden de aplicación recomendado

```
1. Backup de la DB
   cp workspace/apps/scraper/data/remates.db workspace/apps/scraper/data/remates.db.backup

2. Aplicar migration SQL  [S1 — 5 min]
   sqlite3 workspace/apps/scraper/data/remates.db < remaju-deliverables/migrations/0001_add_scoring_and_detail_enrichment.sql

3. Reemplazar schema Drizzle  [S1 — 5 min]
   cp remaju-deliverables/packages/database/schema.ts workspace/packages/database/src/schema.ts
   pnpm type-check

4. Copiar scoring-engine al monorepo  [S3 — 10 min]
   cp -r remaju-deliverables/packages/scoring-engine workspace/packages/
   pnpm install && pnpm test

5. Implementar parsers del detail scraper  [S2 — ~2 días]
   - parsers/tab-remate.ts
   - parsers/tab-inmuebles.ts
   - parsers/tab-cronograma.ts
   - Conectar db a selectPendingRemates + persistDetail

6. API + Dashboard ranking  [S4 — ~1-2 días]
   - remates.ranking endpoint
   - Vista Top Oportunidades
```
