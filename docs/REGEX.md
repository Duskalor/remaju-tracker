# PRD — Sistema de Parsing Regex para Remates Judiciales (REMAJU)

# Objetivo

Diseñar un sistema robusto de extracción y normalización de datos para remates judiciales de REMAJU, utilizando un pipeline híbrido basado en:

- Regex tolerantes
- Normalización posterior
- Heurísticas
- IA opcional para edge cases

El objetivo NO es lograr parsing perfecto, sino obtener:

- alta cobertura,
- alta estabilidad,
- bajo costo computacional,
- capacidad de scoring automático de oportunidades.

---

# Problema Actual

Los datos de REMAJU:

- son semi-estructurados,
- tienen formatos inconsistentes,
- usan variaciones humanas,
- contienen múltiples formatos legales y direcciones no normalizadas.

Regex monolíticos generan:

- bajo recall,
- mantenimiento difícil,
- fragilidad ante variantes.

---

# Estrategia General

# NO usar:

- regex gigantes,
- parsers rígidos,
- dependencias de orden exacto.

# SÍ usar:

- extracción por componentes,
- parsers tolerantes,
- normalización posterior,
- pipeline por etapas.

---

# Arquitectura del Pipeline

# ETAPA 1 — Extracción Base (Regex)

Objetivo:
extraer datos estructurados principales.

Campos:

- distrito
- provincia
- departamento
- partida registral
- área
- precio base
- descripción raw
- dirección raw

---

# ETAPA 2 — Normalización

Objetivo:
estandarizar formatos.

Ejemplos:

- remover espacios raros
- convertir hectáreas a m²
- limpiar partida registral
- normalizar Unicode
- uppercase/lowercase consistente

---

# ETAPA 3 — Heurísticas

Objetivo:
inferir información útil.

Ejemplos:

- detectar tipo inmueble
- calcular precio por m²
- detectar remates sospechosamente baratos
- identificar urbanizaciones premium

---

# ETAPA 4 — IA Opcional

Usar SOLO para:

- direcciones ambiguas,
- gravámenes complejos,
- casos excepcionales.

NO usar IA para:

- área,
- provincia,
- departamento,
- precios,
- partidas.

---

# Campos Core del Sistema

## Campos obligatorios

| campo             | prioridad |
| ----------------- | --------- |
| precio_base       | crítica   |
| area_m2           | crítica   |
| distrito          | crítica   |
| provincia         | alta      |
| departamento      | alta      |
| partida_registral | alta      |
| descripcion_raw   | crítica   |

---

# Modelo de Dirección

# Problema

Las direcciones peruanas son inconsistentes:

- AV. PACIFICO URB. LAS CASUARINAS
- CALLE N°05 S/N
- PASAJE 1 LOTE 13
- MZ A LT 4

Intentar parsear una dirección completa con un solo regex es inviable.

---

# Nueva Estrategia

Separar dirección en componentes.

## Campos de dirección

| campo        | ejemplo        |
| ------------ | -------------- |
| tipo_via     | AV             |
| nombre_via   | PACIFICO       |
| urbanizacion | LAS CASUARINAS |
| manzana      | A              |
| lote         | 13             |
| numero       | 218            |
| sn           | true           |

---

# Regex Recomendados

# 1. Distrito

```regex
/distrito\s+(?:de\s+(?:los\s+)?|del\s+)([A-ZÁÉÍÓÚÑa-záéíóúñ\s\-–—']+?)(?:[.,;]|$|\s+(?:provincia|departamento|partida|calle|jr\.|av\.|pasaje|avenida|jirón|n°|nº|nro|inscrito|con))/i
```

Objetivo:
extraer distrito con tolerancia a guiones Unicode.

---

# 2. Provincia

## Principal

```regex
/(?:provincia\s+(?:de\s+|del\s+))([A-ZÁÉÍÓÚÑa-záéíóúñ\s\-–—']+?)(?:[.,;]|$|\s+(?:departamento|partida|calle|jr\.|av\.|pasaje|avenida|jirón|n°|nº|nro|inscrito|con))/i
```

## Alternativo

```regex
/provincia\s+y\s+departamento\s+de\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s\-–—']+?)(?:[.,;]|$|\s+(?:partida|calle|jr\.|av\.|pasaje|avenida|jirón|n°|nº|nro|inscrito|con))/i
```

---

# 3. Departamento

```regex
/(?:departamento\s+(?:de\s+|del\s+))([A-ZÁÉÍÓÚÑa-záéíóúñ\s\-–—']+?)(?:[.,;]|$|\s+(?:partida|calle|jr\.|av\.|pasaje|avenida|jirón|n°|nº|nro|inscrito|con))/i
```

---

# 4. Partida Registral

```regex
/Partida\s+(?:Electr[oó]nica|Registral)?\s*(?:N|N\.|N°|Nº|NO\.?|N\s*°)?\s*(P?[A-Z0-9][A-Z0-9\s\.-]{5,})/i
```

## Normalización posterior

```ts
value.replace(/\s+/g, '').replace(/\./g, '');
```

---

# 5. Área

```regex
/(\d+[.,]?\d*)\s*(M2|m2|metros\s+cuadrados|HA|HAS|Hect[áa]reas)/i
```

---

# Conversión de unidades

```ts
if (unidad === 'HA' || unidad === 'HAS') {
  area_m2 = value * 10000;
}
```

---

# Regex de Dirección por Componentes

# Tipo de vía

```regex
/\b(CALLE|JR\.?|JIRÓN|AV\.?|AVENIDA|PASAJE|CARRETERA|PROLONGACIÓN)\b/i
```

---

# Urbanización

```regex
/\b(URB\.?|URBANIZACI[ÓO]N)\s+([A-ZÁÉÍÓÚÑ0-9\s\-]+)/i
```

---

# Manzana

```regex
/\bMZ\.?\s*([A-Z0-9]+)/i
```

---

# Lote

```regex
/\b(LT\.?|LOTE)\s*([A-Z0-9]+)/i
```

---

# Número

```regex
/\b(N°|NRO\.?|NÚMERO)\s*([A-Z0-9\-]+)/i
```

---

# S/N

```regex
/\bS\/N\b/i
```

---

# Reconstrucción de Dirección

```ts
direccion_normalizada = [
  tipoVia,
  nombreVia,
  urbanizacion,
  manzana,
  lote,
  numero,
]
  .filter(Boolean)
  .join(' ');
```

---

# Campos RAW Obligatorios

Siempre almacenar:

| campo           | motivo                 |
| --------------- | ---------------------- |
| descripcion_raw | reprocesamiento futuro |
| direccion_raw   | mejorar parser         |
| gravamen_raw    | IA futura              |
| html_raw        | debugging              |

---

# Diseño de Base de Datos

## Tabla remates

| campo           | tipo     |
| --------------- | -------- |
| id              | integer  |
| remate_id       | text     |
| precio_base     | real     |
| area_m2         | real     |
| distrito        | text     |
| provincia       | text     |
| departamento    | text     |
| partida         | text     |
| descripcion_raw | text     |
| direccion_raw   | text     |
| created_at      | datetime |

---

# Métricas Objetivo

| campo             | objetivo recall |
| ----------------- | --------------- |
| distrito          | >98%            |
| provincia         | >98%            |
| departamento      | >98%            |
| área              | >97%            |
| partida           | >90%            |
| dirección parcial | >80%            |

---

# Filosofía del Sistema

El objetivo NO es:

- exactitud legal perfecta,
- dirección perfecta,
- NLP complejo.

El objetivo es:

- detectar oportunidades,
- clasificar remates,
- reducir revisión manual,
- generar scoring automático.

---

# Prioridades Reales del Negocio

Más importantes:

- precio
- área
- distrito
- tasación
- porcentaje rematado

Menos importantes:

- dirección exacta
- formato textual perfecto

---

# Futuras Mejoras

## Posibles evoluciones

- embeddings semánticos
- geocoding
- scoring ML
- clasificación automática
- análisis de gravámenes
- detección de zonas premium
- alertas automáticas

---

# Conclusión

El sistema debe priorizar:

- robustez,
- tolerancia,
- mantenibilidad,
- velocidad,
- cobertura.

Regex debe usarse como:

- extractor inicial,
  NO como parser perfecto universal.

El pipeline híbrido permitirá:

- escalar,
- mejorar progresivamente,
- minimizar costo computacional,
- generar valor rápidamente.
