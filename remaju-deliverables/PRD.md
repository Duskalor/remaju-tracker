# PRD — REMAJU Scoring Engine + Detail Scraper

**Proyecto:** `remaju-scrapper`
**Versión:** 1.0
**Fecha:** Mayo 2026
**Autor:** Paul (Cusco, Perú)
**Cliente final:** Padre del autor — inversor de remates judiciales para flip inmobiliario

---

## 1. Contexto y problema

### 1.1 Situación actual

`remaju-scrapper` es un monorepo Turborepo + pnpm que scrapea el portal REMAJU del Poder Judicial de Perú (`remaju.pj.gob.pe`). Ya tiene:

- Scraper de listado funcionando (Playwright, 352 remates en DB)
- API tRPC + Hono con 3 endpoints
- Dashboard Next.js 14
- Schema Drizzle + SQLite

### 1.2 El problema

Hay 300+ remates activos y revisarlos manualmente es inviable. El cliente final (padre del autor, inversor inmobiliario) necesita identificar **oportunidades de flip** (comprar bajo precio en remate, vender al precio de mercado) automáticamente.

Diagnóstico de los datos actuales:

| Campo enriquecido | Cobertura | Estado |
|---|---|---|
| `distrito` | 57.7% | Mitad llena |
| `tipo_inmueble` | 49.1% | Mitad (con sesgo, 57% es "oficina") |
| `area_m2` | 26.7% | Muy bajo, con outliers (max 740,000 m²) |
| Los 3 juntos | 8.2% | Crítico |

**Causa raíz identificada:** el listado del portal expone metadata pobre. La información rica (tasación, precio base, cargas legales, cronograma) vive en la pantalla de detalle, accesible solo via navegación con estado JSF/PrimeFaces.

### 1.3 Hallazgos del análisis del portal

Durante el análisis se identificaron tres hechos clave que definen la solución:

1. **El detalle es navegación, no modal.** Click en "Detalle" reemplaza el contenido y emite un nuevo ViewState; el botón "Regresar" tira a página 1 del listado. Imposible navegar lista → detalle → lista preservando estado.

2. **Existe un buscador por número de remate** que acepta solo el número (sin distrito judicial ni año). Esto permite acceso directo al detalle sin paginar.

3. **El captcha del buscador es teatro.** Cualquier valor (incluso 1 carácter) lo pasa. La validación del lado del servidor está rota o desactivada. No requiere OCR.

### 1.4 Información disponible en el detalle (3 pestañas)

**Pestaña Remate:**
- Expediente, Distrito Judicial, Órgano, Juez, Especialista, Materia
- **Convocatoria** (1ra/2da/3ra), **Tasación**, **Precio Base**
- Incremento entre ofertas, Arancel, Oblaje
- **N° de inscritos**, Descripción
- Resolución (número, fecha, PDF)

**Pestaña Inmuebles** (tabla, soporta múltiples filas):
- Partida Registral, **Tipo Inmueble** (estructurado, no texto libre)
- Departamento, Provincia, Distrito (separados)
- Dirección completa
- **Carga y/o Gravamen** (texto crítico para riesgo legal)
- **Porcentaje a Rematar**
- Imágenes del inmueble

**Pestaña Cronograma** (tabla, 5 fases):
1. Publicación e Inscripción (~10 días)
2. Validación de Inscripción
3. **Presentación de Ofertas** (~24 horas, evento clave)
4. Pago Saldo
5. Validación del Saldo

---

## 2. Objetivos

### 2.1 Objetivo principal

Construir un sistema que rankee automáticamente los 300+ remates activos por **probabilidad de ser una buena oportunidad de flip inmobiliario**, con un breakdown explicable que permita al cliente entender por qué cada remate ocupa su posición.

### 2.2 Objetivos específicos

1. **Enriquecimiento de datos:** elevar la cobertura de campos críticos del 8% actual a >80% mediante un detail scraper.
2. **Scoring transparente:** cada remate tiene un score 0-100 con desglose de sub-scores ponderados.
3. **Automatización completa:** sistema corre sin intervención (cron diario), descubre nuevos remates, los enriquece, los rankea.
4. **Idempotencia:** las corridas son retomables, idempotentes, y no reprocesan lo ya procesado.
5. **Tuneable:** los pesos del scoring viven en config JSON, modificables sin tocar código.

### 2.3 No-objetivos (explícitamente fuera de alcance v1)

- Validación contra mercado externo (Urbania, Adondevivir) — pasa a v2
- Notificaciones push/email cuando aparecen oportunidades — pasa a v2
- Análisis del PDF de resolución judicial — pasa a v2
- Análisis de imágenes del inmueble — pasa a v2
- Soporte multi-usuario (un solo cliente: el padre del autor)
- App móvil

---

## 3. Usuarios

### 3.1 Usuario primario

**Padre del autor.** Inversor inmobiliario que quiere entrar al mundo de remates judiciales con estrategia de flip. Conocimiento básico del rubro. Necesita:
- Ver "los top 20" sin esfuerzo
- Entender por qué cada uno está rankeado así
- Filtrar por departamento/provincia/tipo
- Confiar en el sistema (datos faltantes deben ser visibles, no ocultos)

### 3.2 Usuario secundario

**Paul (autor).** Programador que mantiene el sistema. Necesita:
- Logs claros cuando algo falla
- Reintentos manuales sobre expedientes específicos
- Tunear pesos del scoring sin redeploy
- Diagnóstico rápido cuando el portal del PJ cambia

---

## 4. Arquitectura

### 4.1 Estructura del monorepo (post-cambios)

```
workspace/
├── apps/
│   ├── scraper/
│   │   ├── src/
│   │   │   ├── listing/        ← existente (modo descubrimiento)
│   │   │   └── detail/         ← NUEVO (modo enriquecimiento)
│   │   │       ├── scrape-detail.ts
│   │   │       ├── parsers/
│   │   │       │   ├── tab-remate.ts
│   │   │       │   ├── tab-inmuebles.ts
│   │   │       │   └── tab-cronograma.ts
│   │   │       └── browser-context.ts
│   │   └── package.json (scripts: scrape:listing, scrape:detail, rescore)
│   ├── api/                    ← existente + endpoint ranking
│   └── dashboard/              ← existente + vista ranking
└── packages/
    ├── database/               ← schema actualizado + nuevas tablas
    ├── shared/                 ← tipos compartidos (sin cambios mayores)
    ├── regex-engine/           ← existente, ahora se usa SOLO para texto libre
    │                              de la descripción del listado (fallback)
    └── scoring-engine/         ← NUEVO
        ├── src/
        │   ├── index.ts
        │   ├── types.ts
        │   ├── weights.ts
        │   ├── score.ts
        │   ├── rules/
        │   │   ├── descuento-tasacion.ts
        │   │   ├── convocatoria.ts
        │   │   ├── riesgo-legal.ts
        │   │   ├── porcentaje-rematar.ts
        │   │   ├── competencia.ts
        │   │   ├── tipo-inmueble.ts
        │   │   ├── tiempo-disponible.ts
        │   │   └── completitud.ts
        │   └── filters/
        │       └── hard-filters.ts
        └── package.json
```

### 4.2 Flujo de datos diario

```
3:00 AM  →  pnpm scrape:listing
            ├─ Recorre todas las páginas del listado (~5 min)
            ├─ UPSERT cada card (insert nuevos, update existentes)
            ├─ Marca last_seen_at = NOW()
            └─ Si corrida exitosa: archiva los no vistos en >7 días

3:10 AM  →  pnpm scrape:detail
            ├─ Query: detail_scraped_at IS NULL OR (activo AND viejo)
            ├─ Por cada expediente:
            │  ├─ Browser context fresco (Opción A: máxima robustez)
            │  ├─ Buscador → ingresa remate_numero + captcha "x"
            │  ├─ Click APLICAR → click Detalle
            │  ├─ Parsea pestaña Remate (default activa)
            │  ├─ Click tab Inmuebles → espera AJAX → parsea
            │  ├─ Click tab Cronograma → espera AJAX → parsea
            │  └─ UPSERT en remates + remate_inmuebles + remate_cronograma
            └─ Tiempo estimado:
               ├─ Setup inicial: 50-75 min para 352 remates
               └─ Régimen estable: 1-3 min por solo los nuevos (~5-10/día)

3:15 AM  →  pnpm rescore
            ├─ Recalcula score de los remates con cambios
            └─ Actualiza score, score_breakdown, score_computed_at
```

### 4.3 Decisiones arquitectónicas clave

| Decisión | Elección | Razón |
|---|---|---|
| Tablas inmuebles/cronograma | **Separadas (1:N)** | Modela la realidad (un remate puede tener N inmuebles), evita migración futura |
| Browser strategy | **Context fresco por iteración** | Robustez sobre velocidad. 50 min vs 25 min es irrelevante para job nocturno |
| Captcha | **Constante "x"** | Confirmado teatro. No requiere OCR ni dependencias |
| Buscador vs paginación | **Buscador (acceso directo)** | Cada iteración independiente, idempotente, retomable |
| Scoring | **Sub-scores ponderados con breakdown** | Explicabilidad > black box |
| Pesos | **JSON config, no hardcoded** | Tuneables sin redeploy |
| Frecuencia | **Diaria** | Fases del PJ duran ~10 días, semanal pierde oportunidades |
| Refresh detail | **Solo "vivos" cuyo data >2 días** | num_inscritos cambia, lo demás es estable |

---

## 5. Schema de base de datos (cambios)

### 5.1 Tabla `remates` — columnas nuevas

```typescript
// Datos económicos del detalle
tasacion: real(),                    // S/. valor pericial
precio_base: real(),                 // S/. valor mínimo de remate
descuento_tasacion: real(),          // CALCULADO: (tasacion - precio_base) / tasacion
convocatoria: text(),                // 'PRIMERA' | 'SEGUNDA' | 'TERCERA'
incremento_oferta: real(),
arancel: real(),
oblaje: real(),                      // 10% de tasación, garantía
num_inscritos: integer().default(0),

// Datos legales del detalle
materia: text(),                     // 'EJECUCION DE GARANTIAS', etc.
juzgado_completo: text(),
juez: text(),
especialista: text(),
resolucion_numero: text(),
resolucion_fecha: text(),
resolucion_pdf_url: text(),
descripcion_detalle: text(),

// Datos temporales (calculados desde cronograma)
fecha_inicio_inscripcion: text(),
fecha_fin_inscripcion: text(),
fecha_inicio_ofertas: text(),
fecha_fin_ofertas: text(),
estado_temporal: text(),             // 'inscripcion_abierta' | 'inscripcion_cerrada' | 'ofertando' | 'cerrado'

// Operacionales — listing tracking
last_seen_at: text(),
archived_at: text(),

// Operacionales — detail tracking
detail_scraped_at: text(),
detail_attempts: integer().default(0),
detail_last_error: text(),
detail_extraction_failed: integer({ mode: 'boolean' }).default(false),

// Scoring
score: real(),
score_breakdown: text(),             // JSON
score_computed_at: text(),
score_version: text(),               // ej. 'v1.0' — para invalidar cuando cambies algoritmo
```

### 5.2 Tabla nueva `remate_inmuebles`

```typescript
export const remateInmuebles = sqliteTable('remate_inmuebles', {
  id: integer().primaryKey({ autoIncrement: true }),
  remate_id: integer().notNull().references(() => remates.id),
  
  partida_registral: text(),
  tipo_inmueble: text(),              // 'DEPARTAMENTO', 'CASA', 'TERRENO', etc. (estructurado)
  direccion_completa: text(),
  departamento: text(),
  provincia: text(),
  distrito: text(),
  
  carga_gravamen_raw: text(),         // texto completo
  num_cargas: integer().default(0),   // parseado: cuenta de "ASIENTO D"
  tiene_hipoteca: integer({ mode: 'boolean' }).default(false),
  tiene_embargo: integer({ mode: 'boolean' }).default(false),
  embargo_terceros: integer({ mode: 'boolean' }).default(false), // ⚠️ flag crítico
  
  porcentaje_rematar: real(),         // 100, 50, etc.
  num_imagenes: integer().default(0),
  
  scraped_at: text().notNull(),
});
```

### 5.3 Tabla nueva `remate_cronograma`

```typescript
export const remateCronograma = sqliteTable('remate_cronograma', {
  id: integer().primaryKey({ autoIncrement: true }),
  remate_id: integer().notNull().references(() => remates.id),
  
  fase_numero: integer().notNull(),    // 1-5
  fase_nombre: text().notNull(),       // 'Publicación e Inscripcion', etc.
  fecha_inicio: text().notNull(),      // ISO datetime
  fecha_fin: text().notNull(),
  
  scraped_at: text().notNull(),
});
```

### 5.4 Tabla nueva `scraping_runs`

```typescript
export const scrapingRuns = sqliteTable('scraping_runs', {
  id: integer().primaryKey({ autoIncrement: true }),
  type: text().notNull(),              // 'listing' | 'detail' | 'rescore'
  started_at: text().notNull(),
  finished_at: text(),
  status: text().notNull(),            // 'running' | 'success' | 'failed'
  records_processed: integer().default(0),
  records_failed: integer().default(0),
  error_message: text(),
});
```

### 5.5 Índices nuevos

```sql
CREATE INDEX idx_remates_score ON remates(score DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_remates_pending_detail ON remates(detail_scraped_at) 
  WHERE detail_scraped_at IS NULL AND detail_extraction_failed = 0;
CREATE INDEX idx_remates_estado_temporal ON remates(estado_temporal);
CREATE INDEX idx_inmuebles_remate ON remate_inmuebles(remate_id);
CREATE INDEX idx_cronograma_remate ON remate_cronograma(remate_id);
```

---

## 6. Scoring Engine — diseño detallado

### 6.1 Filosofía

- Sub-scores 0-100, ponderados → score final 0-100
- Cada sub-score retorna su valor + razón ("descuento del 33% sobre tasación")
- Breakdown completo guardado en DB → tu papá ve el "por qué"
- Pesos en JSON config, modificables sin redeploy

### 6.2 Filtros duros (excluyen del ranking)

Estos NO penalizan, EXCLUYEN:

- `archived_at IS NOT NULL` → ya no aparece en listado
- `detail_extraction_failed = true` → datos no confiables
- `estado_temporal = 'cerrado'` → ya pasó la fecha de ofertas
- `porcentaje_rematar < 50` → opcional, configurable

### 6.3 Sub-scores y pesos v1

| # | Sub-score | Peso | Cálculo |
|---|---|---|---|
| 1 | `descuento_tasacion` | **30%** | `(tasacion - precio_base) / tasacion`, normalizado a 0-100 |
| 2 | `convocatoria` | **10%** | 1ra=33, 2da=66, 3ra=100 |
| 3 | `riesgo_legal` | **20%** | 100 - penalty(num_cargas, embargo_terceros) |
| 4 | `porcentaje_rematar` | **10%** | 100% → 100, <100% penalizado fuerte |
| 5 | `competencia` | **10%** | `100 - min(num_inscritos * 10, 100)` |
| 6 | `tipo_inmueble` | **10%** | DEPARTAMENTO/CASA=100, TERRENO=70, OFICINA=40 |
| 7 | `tiempo_disponible` | **5%** | Días hasta fin_inscripcion: <3=20, 3-7=70, >7=100 |
| 8 | `completitud` | **5%** | % de campos críticos poblados |

**Score final** = `Σ (sub_score * peso)`

### 6.4 Tunables en config

```json
{
  "version": "v1.0",
  "weights": {
    "descuento_tasacion": 0.30,
    "convocatoria": 0.10,
    "riesgo_legal": 0.20,
    "porcentaje_rematar": 0.10,
    "competencia": 0.10,
    "tipo_inmueble": 0.10,
    "tiempo_disponible": 0.05,
    "completitud": 0.05
  },
  "filters": {
    "exclude_porcentaje_rematar_under": 50,
    "exclude_archived": true,
    "exclude_failed": true,
    "exclude_cerrado": true
  },
  "preferences": {
    "departamentos_bonus": [],
    "tipos_inmueble_bonus": ["DEPARTAMENTO", "CASA"],
    "min_score_visible": 40
  }
}
```

### 6.5 Ejemplo de breakdown

```json
{
  "score": 78,
  "version": "v1.0",
  "computed_at": "2026-05-10T03:15:23Z",
  "subscores": {
    "descuento_tasacion": { "value": 80, "weight": 0.30, "reason": "Descuento de 33.3% sobre tasación (S/. 187,831 → S/. 125,221)" },
    "convocatoria": { "value": 33, "weight": 0.10, "reason": "Primera convocatoria" },
    "riesgo_legal": { "value": 70, "weight": 0.20, "reason": "1 hipoteca + 1 embargo de terceros" },
    "porcentaje_rematar": { "value": 100, "weight": 0.10, "reason": "100% del inmueble" },
    "competencia": { "value": 100, "weight": 0.10, "reason": "0 inscritos hasta el momento" },
    "tipo_inmueble": { "value": 100, "weight": 0.10, "reason": "DEPARTAMENTO" },
    "tiempo_disponible": { "value": 100, "weight": 0.05, "reason": "12 días hasta fin de inscripción" },
    "completitud": { "value": 95, "weight": 0.05, "reason": "19/20 campos críticos poblados" }
  }
}
```

---

## 7. Roadmap por sprints

### Sprint 1 — Schema + migrations (1 día)
- [ ] Actualizar `packages/database/schema.ts` con columnas nuevas
- [ ] Crear tablas `remate_inmuebles`, `remate_cronograma`, `scraping_runs`
- [ ] Generar migration con drizzle-kit
- [ ] Crear índices
- [ ] Backfill: marcar todos los remates existentes con `last_seen_at = scraped_at`
- [ ] Tests del schema

### Sprint 2 — Detail scraper (2-3 días)
- [ ] Crear `apps/scraper/src/detail/`
- [ ] Implementar `scrape-detail.ts` (orquestador)
- [ ] Implementar parsers (tab-remate, tab-inmuebles, tab-cronograma)
- [ ] Implementar lógica de query "qué procesar"
- [ ] Manejo de errores: retries, marca de failed, scraping_runs
- [ ] Comando `pnpm scrape:detail` con flags (--limit, --force, --expediente)
- [ ] Logging estructurado

### Sprint 3 — Scoring engine (2 días)
- [ ] Crear `packages/scoring-engine/`
- [ ] Implementar tipos y config
- [ ] Implementar 8 reglas
- [ ] Implementar orquestador
- [ ] Tests unitarios por regla
- [ ] Comando `pnpm rescore` para recalcular en batch

### Sprint 4 — API + Dashboard ranking (1-2 días)
- [ ] Endpoint tRPC `remates.ranking` (paginado, filtros)
- [ ] Endpoint tRPC `remates.scoreBreakdown` (detalle de un remate)
- [ ] Vista "Top Oportunidades" en dashboard
- [ ] Cards con score visible + botón "ver desglose"
- [ ] Filtros UI (departamento, tipo, score mínimo)

### Sprint 5 (opcional, futuro) — Validación de mercado
- Scraper Urbania/Adondevivir
- Comparación tasación vs precio de mercado
- Score adicional `validacion_mercado`

**Total estimado v1: 7-9 días de trabajo enfocado.**

---

## 8. Métricas de éxito

### 8.1 Métricas técnicas (medibles en código)
- Cobertura de campos críticos: pasa de 8% a >80% (`tasacion`, `precio_base`, `tipo_inmueble`, `distrito` en >80% de remates activos)
- Tiempo de corrida diaria: <30 minutos en régimen estable
- Tasa de fallo del detail scraper: <5% por corrida
- Idempotencia: 100% (correr 10 veces seguidas no cambia resultados)

### 8.2 Métricas de negocio (medibles en uso)
- Tiempo del cliente para revisar oportunidades: de "horas/día" a "5 minutos para revisar top 20"
- Decisiones del cliente que se basan en el ranking (cuántos de los top 10 efectivamente investiga)
- Feedback subjetivo: "¿el ranking te muestra cosas que vos manualmente hubieras filtrado?"

---

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| El portal del PJ cambia estructura HTML | Media | Alto | Selectores semánticos, no hashes JSF. Logs detallados de parsing. |
| El captcha "teatro" es arreglado | Baja | Medio | Fallback a OCR (Tesseract o Claude vision). Diseño preparado. |
| El scoring no refleja oportunidades reales | Media | Alto | Pesos tuneables. Iteración con feedback del cliente. v1 conservador. |
| Tasación pericial es irreal (muy alta) | Media | Medio | v2: validación contra Urbania. v1: aceptar limitación, comunicarla. |
| Volumen crece a 1000+ remates | Baja | Bajo | SQLite escala, índices definidos. Pasar a Postgres en v3 si necesario. |
| Bloqueo del portal por rate excesivo | Baja | Alto | Rate limit 2-5s entre requests. Horario nocturno. |

---

## 10. Consideraciones legales y éticas

- Los datos del REMAJU son **públicos por ley** (anuncios de remates judiciales).
- Uso del captcha roto: técnicamente es bug del PJ. Si lo arreglan, migrar a OCR sin pelear.
- Rate limit conservador (2-5s entre requests) para no sobrecargar el portal.
- Datos personales (juez, especialista, deudor) se almacenan pero no se publican fuera del uso interno del cliente.
- El sistema NO incluye automatización de inscripción/postulación a remates — eso es exclusivamente humano por riesgos legales.

---

## 11. Apéndice — Ejemplos de datos reales

### 11.1 Card del listado (HTML simplificado)
```
Remate N° 23430 - PRIMERA CONVOCATORIA
REMATE SIMPLE
JOSE LEONARDO ORTIZ
Presentación de Ofertas: 22/05/2026 11:59 AM
Estado: En proceso — Publicación e Inscripcion
Descripción: INMUEBLE UBICADO EN CALLE PARDO Y MIGUEL N° 387, ...
```

### 11.2 Detalle - tab Remate (campos extraídos)
```
Expediente: 01339-2024-0-1401-JR-CI-02
Distrito Judicial: ICA
Materia: EJECUCION DE GARANTIAS
Convocatoria: PRIMERA CONVOCATORIA
Tasación: S/. 187,831.50
Precio Base: S/. 125,221.00
N° inscritos: 0
```

### 11.3 Detalle - tab Inmuebles (estructurado en tabla)
```
Partida: 11239965
Tipo: DEPARTAMENTO
Departamento: LA LIBERTAD | Provincia: TRUJILLO | Distrito: TRUJILLO
Cargas: HIPOTECA BCP + EMBARGO Caja Huancayo (terceros) ⚠️
Porcentaje a rematar: 100%
```

### 11.4 Detalle - tab Cronograma
```
Fase 1: Publicación e Inscripción      09/05/2026 → 18/05/2026
Fase 2: Validación de Inscripción      19/05/2026 → 21/05/2026
Fase 3: Presentación de Ofertas        22/05/2026 12:00 → 23/05/2026 11:59 ⭐
Fase 4: Pago Saldo                     25/05/2026 → 27/05/2026
Fase 5: Validación del Saldo           28/05/2026 → 01/06/2026
```

---

**Fin del PRD v1.0**
