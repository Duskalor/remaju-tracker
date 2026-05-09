# REMAJU Intelligence System

## Descripción General

Sistema de inteligencia para remates judiciales del portal REMAJU.

El objetivo del proyecto NO es únicamente hacer scraping, sino construir una plataforma capaz de:

- detectar oportunidades
- clasificar remates
- analizar propiedades
- priorizar casos interesantes
- automatizar revisión de remates judiciales

---

# Problema Actual

Actualmente revisar REMAJU manualmente implica:

- abrir decenas de publicaciones
- entrar a múltiples pestañas AJAX
- leer descripciones extensas
- comparar precios manualmente
- identificar oportunidades visualmente

Esto consume demasiado tiempo y dificulta detectar buenos remates rápidamente.

---

# Objetivo Principal

Automatizar la recolección, análisis y clasificación de remates judiciales para detectar oportunidades relevantes sin revisar manualmente todas las publicaciones.

---

# Arquitectura General

```txt
SCRAPER
   ↓
regex-engine
   ↓
scoring-engine
   ↓
SQLite/Postgres
   ↓
API
   ↓
Dashboard
```

---

# Estructura del Monorepo

```txt
remaju-intelligence/
│
├── apps/
│   ├── api/
│   ├── dashboard/
│   └── scraper/
│
├── packages/
│   ├── shared/
│   ├── scoring-engine/
│   └── regex-engine/
│
├── prisma/
├── docs/
├── scripts/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

---

# ¿Por qué Monorepo?

Porque todas las partes comparten lógica.

Ejemplo:

- scraper usa regex
- API usa scoring
- dashboard usa tipos
- scoring usa modelos compartidos

Ventajas:

- menos duplicación
- un solo git
- tipos compartidos
- mantenimiento más simple
- arquitectura escalable

---

# Apps

---

# apps/scraper

Es el núcleo del sistema.

Responsabilidades:

- navegar REMAJU
- manejar AJAX
- extraer `.xhtml`
- parsear HTML
- aplicar regex
- detectar oportunidades
- guardar datos
- correr cron jobs

---

## Flujo del Scraper

```txt
Entrar a REMAJU
   ↓
Obtener listado principal
   ↓
Extraer datos básicos
   ↓
Aplicar regex inicial
   ↓
Calcular score preliminar
   ↓
Si score alto:
    entrar a detalles AJAX
   ↓
Extraer inmueble/cronograma
   ↓
Recalcular score
   ↓
Guardar resultado final
```

---

# apps/api

Backend del sistema.

Responsabilidades:

- exponer endpoints
- servir información
- búsquedas
- filtros
- estadísticas
- futuras alertas

Ejemplos:

```http
GET /remates
GET /remates/:id
GET /remates/oportunidades
```

---

# apps/dashboard

Frontend visual del sistema.

Mostrará:

- oportunidades
- score
- filtros
- comparativas
- timeline
- cambios
- alertas futuras

Stack probable:

- Next.js
- Tailwind
- TanStack Query
- TanStack Table

---

# Packages Compartidos

---

# packages/shared

Contendrá:

- tipos
- constantes
- utilidades
- schemas

Ejemplo:

```ts
export type Remate = {
  id: string;
  precioBase: number;
  distrito: string;
};
```

---

# packages/regex-engine

Centraliza toda la extracción textual.

Responsabilidades:

- regex
- parsers
- limpieza
- normalización

Ejemplo:

```ts
extractDistrito(text);
extractArea(text);
extractPartida(text);
```

Esto evita regex duplicados.

---

# packages/scoring-engine

Es la inteligencia del sistema.

Transforma datos → oportunidades.

Ejemplo:

```ts
score += area_m2 > 100 ? 15 : 0;
score += precio_m2 < promedio ? 25 : 0;
score += departamento === 'LIMA' ? 10 : 0;
```

Resultado:

```ts
{
  score: 82,
  tags: ["PRECIO_BAJO", "AREA_GRANDE"],
  risk: "MEDIUM"
}
```

---

# Estrategia de Scraping

El sistema NO debe abrir todos los detalles AJAX.

Eso incrementa:

- tráfico
- requests
- riesgo de bloqueo
- tiempo de scraping

---

## Fase 1 — Scraping Ligero

Extraer únicamente:

- precio base
- descripción
- distrito
- convocatoria
- fecha
- estado
- tipo de remate

Aplicar regex.

Calcular score preliminar.

---

## Fase 2 — Scraping Profundo Selectivo

Solo si el score supera cierto umbral:

```txt
score >= 70
```

Entonces:

- abrir detalle
- abrir pestaña inmueble
- abrir cronograma
- obtener datos avanzados

---

# Datos Importantes

## Datos Básicos

Disponibles sin clicks AJAX:

- precio base
- descripción
- distrito
- convocatoria
- fecha
- estado
- tipo de remate

---

## Datos Avanzados

Requieren AJAX:

- área m2
- tipo inmueble
- urbanización
- partida registral
- cronograma
- cargas
- gravámenes
- ocupación
- porcentaje de acciones y derechos

---

# Sistema Regex

## Resultados actuales

| Campo        | Recall |
| ------------ | ------ |
| Distrito     | 99.2%  |
| Provincia    | 99%    |
| Departamento | 99.5%  |
| Partida      | 87.5%  |
| Área         | 98%    |
| Dirección    | 54%    |

---

# Problema Principal

La dirección es altamente inconsistente.

Ejemplos:

- CALLE N°05 S/N
- PASAJE 1 LOTE 13
- AV. PACIFICO URB. LAS CASUARINAS

Por ello:

- dirección NO debe ser campo crítico
- debe tratarse como enriquecimiento opcional

---

# Regex Principales

## Distrito

```regex
/distrito\s+(?:de\s+(?:los\s+)?|del\s+)([A-ZÁÉÍÓÚÑa-záéíóúñ\s\-']+?)(?:[.,;]|$|\s+(?:provincia|departamento|partida|calle|jr\.|av\.|pasaje|avenida|jirón|n°|nº|nro|inscrito|con))/i
```

---

## Provincia

```regex
/(?:provincia\s+(?:de\s+|del\s+))([A-ZÁÉÍÓÚÑa-záéíóúñ\s\-']+?)(?:[.,;]|$|\s+(?:departamento|partida|calle|jr\.|av\.|pasaje|avenida|jirón|n°|nº|nro|inscrito|con))/i
```

---

## Departamento

```regex
/(?:departamento\s+(?:de\s+|del\s+))([A-ZÁÉÍÓÚÑa-záéíóúñ\s\-']+?)(?:[.,;]|$|\s+(?:partida|calle|jr\.|av\.|pasaje|avenida|jirón|n°|nº|nro|inscrito|con))/i
```

---

## Partida Registral

```regex
/Partida\s+(?:Electr[óo]nica|Registral)\s*N[°º]?\s*(P?\d[\d\s\.]*\d)/i
```

---

## Área

```regex
/(\d+[.,]?\d*)\s*(?:M2|m2|metros\s+cuadrados|HA|has|Hect[áa]reas)/i
```

---

# Base de Datos

## Fase Inicial

SQLite.

Ventajas:

- simple
- rápida
- local
- suficiente para prototipo

---

## Fase Escalable

Postgres.

Cuando existan:

- múltiples usuarios
- analytics
- alertas
- búsquedas avanzadas
- dashboard complejo

---

# Stack Recomendado

## Base

- TypeScript
- pnpm workspace
- TurboRepo

---

## Scraper

- Playwright
- Cheerio
- node-cron

---

## API

- Fastify o Hono
- Prisma

---

## Dashboard

- Next.js
- Tailwind
- TanStack Query
- TanStack Table

---

# Estrategia Inteligente del Sistema

El verdadero valor NO está en scrapear.

El valor está en:

- parsing
- scoring
- clasificación
- automatización
- filtros inteligentes
- priorización
- análisis

El scraper solo recolecta información.

La inteligencia del sistema es lo que convierte datos en oportunidades.

---

# Futuras Mejoras

## Posibles features futuras

- alertas Telegram
- alertas email
- comparación histórica
- detección de rebajas
- análisis de tendencias
- cálculo de precio por m2
- mapas
- scoring ML
- OCR de documentos PDF
- análisis legal automatizado

---

# Conclusión

El proyecto no debe plantearse como un simple scraper.

Debe diseñarse como:

```txt
Sistema de inteligencia de remates judiciales
```

El scraping es únicamente la primera capa del sistema.
