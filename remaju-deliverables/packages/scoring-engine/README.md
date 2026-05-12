# @remaju/scoring-engine

Motor de scoring para identificar oportunidades de flip inmobiliario en remates judiciales del REMAJU (Perú).

## Uso

```typescript
import { scoreRemate, loadConfig } from '@remaju/scoring-engine';

// Construir el input desde la DB (uniendo remates + remate_inmuebles + remate_cronograma)
const input = {
  id: 1,
  expediente: '01339-2024-0-1401-JR-CI-02',
  remate_numero: '23431',
  tasacion: 187831.50,
  precio_base: 125221.00,
  convocatoria: 'PRIMERA',
  num_inscritos: 0,
  materia: 'EJECUCION DE GARANTIAS',
  inmueble: {
    tipo_inmueble: 'DEPARTAMENTO',
    distrito: 'TRUJILLO',
    provincia: 'TRUJILLO',
    departamento: 'LA LIBERTAD',
    porcentaje_rematar: 100,
    num_cargas: 2,
    tiene_hipoteca: true,
    tiene_embargo: true,
    embargo_terceros: true,
  },
  fecha_fin_inscripcion: '2026-05-18T23:59:59',
  fecha_fin_ofertas: '2026-05-23T11:59:59',
  estado_temporal: 'inscripcion_abierta',
  archived_at: null,
  detail_extraction_failed: false,
  detail_scraped_at: '2026-05-10T03:15:00Z',
};

// Scorear con config por defecto
const result = scoreRemate(input);
console.log(result);
// {
//   score: 78,
//   version: 'v1.0',
//   computed_at: '...',
//   excluded: false,
//   subscores: [...]
// }

// O con config custom desde JSON
const config = loadConfig('./scoring.config.json');
const result2 = scoreRemate(input, config);
```

## Reglas (8 sub-scores)

| # | Regla | Peso default | Mide |
|---|-------|--------------|------|
| 1 | `descuento_tasacion` | 30% | (tasación - precio_base) / tasación |
| 2 | `convocatoria` | 10% | 1ra=33, 2da=66, 3ra=100 |
| 3 | `riesgo_legal` | 20% | Cargas, embargos de terceros, materia |
| 4 | `porcentaje_rematar` | 10% | 100% es ideal, <50% se excluye |
| 5 | `competencia` | 10% | Inverso de num_inscritos |
| 6 | `tipo_inmueble` | 10% | Liquidez de salida (depto > casa > terreno > oficina) |
| 7 | `tiempo_disponible` | 5% | Días hasta fin de inscripción |
| 8 | `completitud` | 5% | % de campos críticos poblados |

## Filtros duros (excluyen, no penalizan)

- `archived_at != null` → ya no en portal
- `detail_extraction_failed == true` → datos no confiables
- `estado_temporal == 'cerrado'` → ya pasó
- `porcentaje_rematar < 50` → muy riesgoso

## Config

`scoring.config.json` (opcional, en raíz del workspace):

```json
{
  "version": "v1.1",
  "weights": {
    "descuento_tasacion": 0.40,
    "riesgo_legal": 0.25,
    "convocatoria": 0.10,
    "porcentaje_rematar": 0.10,
    "competencia": 0.05,
    "tipo_inmueble": 0.05,
    "tiempo_disponible": 0.03,
    "completitud": 0.02
  },
  "filters": {
    "exclude_porcentaje_rematar_under": 75,
    "exclude_archived": true,
    "exclude_failed": true,
    "exclude_cerrado": true
  },
  "preferences": {
    "departamentos_bonus": ["CUSCO", "AREQUIPA"],
    "tipos_inmueble_bonus": ["DEPARTAMENTO", "CASA"],
    "min_score_visible": 50
  }
}
```

Los pesos se normalizan automáticamente para sumar 1.0.

## Estructura

```
src/
├── index.ts              # API pública
├── types.ts              # Tipos compartidos
├── weights.ts            # Config + loader
├── score.ts              # Orquestador
├── rules/                # 8 reglas, una por archivo
└── filters/              # Filtros duros
```

## Testing

```bash
pnpm test
```
