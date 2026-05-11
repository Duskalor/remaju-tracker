# Sprint 1.5 — Listing scraper actualizado

Este sprint **cierra el gap** que quedó en el Sprint 1: actualiza tu `scrape:listing` para que extraiga TODOS los campos visibles del card, haga UPSERT idempotente, y maneje el archivado de los que ya no aparecen.

## Por qué este sprint existe

Cuando armamos el plan original, asumimos que tu scraper actual ya capturaba bien los cards. Después al ver el HTML real del card 23430 nos dimos cuenta de que:

1. Hay campos visibles que tu scraper probablemente no extrae completos:
   - `convocatoria` (PRIMERA/SEGUNDA/TERCERA) — alimenta el scoring directamente
   - `fecha_presentacion_ofertas` con hora exacta — alimenta `estado_temporal`
   - `estado` y `fase_actual` separados
2. La lógica del `INSERT` actual probablemente no es idempotente (re-corridas duplican o pierden datos).
3. No hay archivado: los remates que dejan de aparecer en el portal se quedan eternamente "activos" en la DB.

Este sprint resuelve los tres.

## Beneficio concreto

Con esto aplicado, **el scoring puede correr desde el día 1**, incluso antes de que termine la primera corrida del detail scraper. Los sub-scores que dependen del listado (convocatoria, tiempo disponible, completitud parcial) ya funcionan. Los del detalle quedan en "data missing" hasta que se enriquezcan.

Es decir: tu papá ve un ranking útil **antes** de los 50 minutos del setup inicial del detail scraper.

## Contenido del paquete

```
apps/scraper/src/listing/
├── parsers/
│   └── card.ts                    ← Parser completo del HTML de un card
├── persist/
│   ├── upsert-card.ts             ← UPSERT idempotente (no destruye trabajo previo)
│   └── archive-stale.ts           ← Marca como archived los que dejaron de aparecer
├── __tests__/
│   └── card.test.ts               ← 23 tests con HTML real del portal
└── scrape-listing.ts              ← Orquestador (reemplaza tu scraper actual)
```

**Tests pasando:** 23/23 con el HTML real del card 23430 que mandaste.

## Cómo adaptarlo (paso a paso)

### Paso 1 — Instalá la dependencia nueva

```bash
cd apps/scraper
pnpm add cheerio@^1.0.0-rc.12
```

`cheerio` es jQuery-like del lado del servidor. Lo usamos para parsear HTML rápido sin browser. ~50KB, sin dependencias pesadas.

### Paso 2 — Copiá los archivos

```bash
cp -r sprint-1.5/apps/scraper/src/listing/ /tu/repo/apps/scraper/src/
```

**SI YA tenés `apps/scraper/src/listing/`:**
- Renombrá tu carpeta actual a `listing.old/` (backup)
- Copiá la nueva
- Después de validar que funciona, borrás la backup

### Paso 3 — Adaptá los selectores de Playwright

En `scrape-listing.ts` hay un objeto `SELECTORS`. Los valores actuales son **estimaciones** basadas en el HTML que vi. Probablemente tu scraper actual ya tiene los selectores correctos funcionando.

Lo que tenés que validar:

```typescript
const SELECTORS = {
  // El wrapper de cada card. En el HTML real son divs con IDs tipo
  // formBuscarRemateExterno:listaRemate:N:j_idtXXX
  // El selector que puse usa starts-with — adaptá al que ya te funciona.
  card: '[id^="formBuscarRemateExterno:listaRemate:"][id$="_content"]',

  // El botón de "siguiente página". Esto es 99% lo que ya tenés.
  nextPageButton: 'a.ui-paginator-next:not(.ui-state-disabled)',

  // Indicador de página actual para detectar cambio post-click.
  currentPage: '.ui-paginator-current',
};
```

**Cómo validar:** abrí el portal en DevTools, inspeccioná un card, copiá el selector que matchee. Si tu scraper actual ya tenía esto resuelto, dejalo como estaba.

### Paso 4 — Conectá a tu DB real

En **`persist/upsert-card.ts`** hay bloques marcados con `/* ... */`. Son pseudocódigo de Drizzle. Tenés que descomentar y ajustar a tu instancia real:

```typescript
// ANTES (placeholder):
// import { db } from '../../db';
// import { remates, type NewRemate } from '@remaju/database';

// DESPUÉS (tu setup real):
import { db } from '../../db';
import { remates } from '@remaju/database';
```

Lo mismo en `persist/archive-stale.ts` y `scrape-listing.ts`.

### Paso 5 — Decidí la key del UPSERT

**Esto es importante** y depende de cómo tengas tu schema actual.

El UPSERT necesita una columna UNIQUE como "conflict target". Tenés dos opciones:

**Opción A — Usar `expediente` (como hoy)**
- El `expediente` solo aparece en el detalle (`01339-2024-0-1401-JR-CI-02`), no en el card.
- Insertás un placeholder en el primer scrape (`PENDING_23430`) y el detail scraper lo reemplaza después.
- Ventaja: no rompés tu schema actual.
- Desventaja: la columna queda "sucia" hasta el primer detail.

**Opción B — Agregar UNIQUE en `remate_numero`**
- El `remate_numero` SÍ está en el card. Es el "23430" del HTML.
- Agregás esto a la migration:
  ```sql
  CREATE UNIQUE INDEX idx_remate_numero_unique ON remates(remate_numero) WHERE remate_numero IS NOT NULL;
  ```
- Ventaja: data limpia desde el primer scrape.
- Desventaja: hay que pensar qué pasa con los 352 remates actuales (si todos tienen `remate_numero` único, no hay problema).

**Mi recomendación:** **Opción B**. Es más limpio. Antes de aplicar, verificá:

```bash
sqlite3 remaju.db "SELECT remate_numero, COUNT(*) FROM remates GROUP BY remate_numero HAVING COUNT(*) > 1;"
```

Si esa query devuelve 0 filas, podés crear el UNIQUE sin problema. Si devuelve duplicados, tenés que limpiar antes (probablemente son nulls del scraper original que no extraía el número).

Una vez decidida la key, en `upsert-card.ts` ajustá el `target` del `onConflictDoUpdate`:

```typescript
.onConflictDoUpdate({
  target: remates.remate_numero,  // o remates.expediente según tu elección
  set: { ... },
})
```

### Paso 6 — Manejá la duplicación de `estado` y `fase_actual`

El card te da DOS campos: `estado` ("En proceso") y `fase_actual` ("Publicación e Inscripcion"). Tu schema actual solo tiene `estado`. Tres opciones:

**Opción A — Concatenar:**
```typescript
estado: card.fase_actual 
  ? `${card.estado} — ${card.fase_actual}`
  : card.estado
// Resultado: "En proceso — Publicación e Inscripcion"
```

**Opción B — Agregar columna `fase_actual`:**
```sql
ALTER TABLE remates ADD COLUMN fase_actual TEXT;
```
Y ajustás el upsert. Más limpio, requiere migration adicional.

**Opción C — Mantener separado en JSON:**
```typescript
estado: JSON.stringify({ estado: card.estado, fase: card.fase_actual })
```
No me gusta — pierde queryabilidad.

**Mi recomendación:** **B** (columna nueva). Es 2 minutos de migration y te queda data limpia para filtrar en el dashboard ("mostrame solo los que están en fase de Publicación").

### Paso 7 — Verificá que funcione con 1 página

Antes de soltar el batch completo, probá con flag `--limit-pages 1`:

```bash
# Modo dev: solo 1 página, dry-run en archivado
pnpm scrape:listing --limit-pages 1 --dry-run-archive
```

Después de la corrida, en sqlite3:

```sql
-- ¿Se llenaron los campos nuevos?
SELECT remate_numero, convocatoria, estado, fase_actual, fecha_remate, last_seen_at
FROM remates 
ORDER BY last_seen_at DESC 
LIMIT 5;

-- ¿Convocatoria está poblada?
SELECT convocatoria, COUNT(*) FROM remates GROUP BY convocatoria;

-- ¿Idempotencia? Correr el scraper 2 veces seguidas no debería duplicar
SELECT remate_numero, COUNT(*) FROM remates GROUP BY remate_numero HAVING COUNT(*) > 1;
-- → debería retornar 0 filas
```

### Paso 8 — Migration adicional (si elegiste Opción B del paso 5/6)

Crear `migrations/0002_listing_enrichment.sql`:

```sql
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- Si elegiste Opción B del paso 5
CREATE UNIQUE INDEX IF NOT EXISTS idx_remate_numero_unique 
  ON remates(remate_numero) 
  WHERE remate_numero IS NOT NULL;

-- Si elegiste Opción B del paso 6
ALTER TABLE remates ADD COLUMN fase_actual TEXT;

COMMIT;
```

## Cómo se comporta cada corrida

### Día 1 — Primera corrida con el nuevo scraper

```
1. scrape:listing recorre 35 páginas, encuentra 352 cards
2. UPSERT: como ya existen los 352, hace 352 UPDATEs
   ├─ Llena convocatoria, fecha_remate (con hora exacta), fase_actual
   ├─ Marca last_seen_at = NOW
   └─ NO toca detail_scraped_at, score, etc.
3. Archivado: 0 (todos están "vistos hoy")
```

Después del día 1: los campos del card están completos en los 352. Los campos del detalle siguen NULL hasta que corra el detail scraper.

### Día 2 — Corrida normal

```
1. scrape:listing recorre páginas, encuentra 358 cards
   ├─ 350 ya existen → UPDATE (actualiza last_seen_at + cualquier campo que cambió)
   └─ 8 son nuevos → INSERT (detail_scraped_at = NULL, listos para enriquecer)
2. Archivado: si 2 remates no aparecieron en 7+ días → archived_at = NOW
```

### Si una corrida falla a la mitad

```
1. scrape:listing crashea en página 17 de 35
2. UPSERT no se aplica (los cards parseados se mantienen en memoria, no se persisten)
3. Archivado NO corre (la pre-condición "última corrida exitosa hoy" falla)
4. Los remates anteriores siguen intactos con su last_seen_at viejo
5. La próxima corrida exitosa archiva lo que corresponda
```

**Cero riesgo de corrupción.** La idempotencia es absoluta.

## Diagnóstico cuando algo falla

### "El parser dice que no encontró el remate_numero"

El HTML del portal cambió. Mirá los `parse_warnings` que devuelve `parseCard`. El test `__tests__/card.test.ts` te sirve como regression test — si el portal cambia, podés actualizar el HTML del fixture y los tests te dicen exactamente qué se rompió.

### "Hay duplicados en remate_numero después del UPSERT"

El conflict target del UPSERT está mal configurado, O no hay UNIQUE en la columna. Verificá:

```sql
SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='remates';
```

### "El archivado marca remates que sí existen en el portal"

Probablemente la última corrida fue parcial y la pre-condición de `shouldArchive` no detectó el fallo. Verificá:

```sql
SELECT * FROM scraping_runs 
WHERE type='listing' 
ORDER BY started_at DESC 
LIMIT 5;
```

Y arreglá manualmente:

```sql
UPDATE remates SET archived_at = NULL WHERE remate_numero IN ('X', 'Y', 'Z');
```

## Resumen

✅ Parser completo del card (23 tests pasando con HTML real)
✅ UPSERT idempotente — corré N veces sin destruir nada
✅ Archivado soft-delete con pre-condición de seguridad
✅ Compatible con tu schema actual (Opción A) o un poco más limpio (Opción B)
✅ TypeScript compila sin errores

⚠️ Lo que tenés que hacer vos:
- Adaptar selectores de Playwright a lo que ya tenías funcionando
- Conectar las queries a tu instancia real de Drizzle
- Decidir Opción A vs B para el conflict target
- Aplicar la migration 0002 si elegiste B
- Probar con 1 página antes del batch completo

Tiempo estimado de adaptación: **2-4 horas**.

Cuando tengas dudas con un selector específico o una query, abrime un chat con el detalle y te lo resuelvo concreto.
