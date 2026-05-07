# PRD: Scraper de Remates Judiciales — REMAJU

**Versión:** 1.0 (Draft inicial)
**Fecha:** Mayo 2026
**Owner:** Desarrollador (uso personal / freelance)
**Stack principal:** Node.js + Playwright
**Stack alternativo:** Node.js + axios/got + cheerio

---

## 1. Contexto y problema

El sitio **REMAJU** (`https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml`) es la plataforma oficial del Poder Judicial del Perú para remates electrónicos de bienes embargados (inmuebles, vehículos, terrenos, etc.). Publica información pública pero:

- La consulta solo se puede hacer manualmente vía navegador.
- Tiene **paginación de 4-12 registros por página** sobre un total que oscila alrededor de los 200-300 registros activos.
- No expone CSV, API pública ni feed RSS.
- Filtrar y revisar manualmente toma tiempo y es propenso a omisiones.

**Problema:** Necesito un proceso automatizado que extraiga diariamente el listado completo de remates y los almacene de forma estructurada para análisis posterior.

## 2. Objetivos

### Objetivo principal
Automatizar la extracción diaria del listado completo de remates publicados en REMAJU.

### Objetivos secundarios
- Tener un histórico de los remates a lo largo del tiempo (útil para detectar cambios sin necesidad de implementar alertas todavía).
- Ejecutar el proceso sin intervención manual, idealmente como tarea programada.
- Mantener el código simple y mantenible para futuras extensiones (notificaciones, filtros geográficos, etc.).

### No-objetivos (fuera de alcance v1)
- Notificaciones (email, Telegram, WhatsApp).
- Detección automática de cambios de precio.
- Entrada al detalle de cada remate.
- Descarga de PDFs de avisos.
- Dashboard web o UI propia.
- Filtrado por región.

## 3. Usuarios

**Usuario único:** yo (desarrollador). El sistema corre en mi máquina o en un servidor pequeño. La salida la consumo directamente desde la base de datos o mediante exportación a CSV cuando lo necesite.

## 4. Requisitos funcionales (RF)

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-01 | Extraer N° de remate, ubicación, precio base (con moneda), fase y fecha de presentación de ofertas para cada registro del listado. | Must |
| RF-02 | Recorrer todas las páginas de la paginación hasta cubrir el 100% de los registros. | Must |
| RF-03 | Ejecutarse de forma automatizada una vez al día. | Must |
| RF-04 | Persistir los datos de forma que se pueda consultar el histórico día a día. | Must |
| RF-05 | Evitar duplicar registros del mismo día (idempotencia ante reintentos). | Should |
| RF-06 | Generar un log básico (cuántos registros extraídos, errores, duración). | Should |
| RF-07 | Permitir exportar a CSV bajo demanda. | Could |

## 5. Requisitos no funcionales (RNF)

| ID | Requisito |
|----|-----------|
| RNF-01 | Respetar el sitio: delay mínimo de 2 segundos entre páginas y ejecución en horario de baja carga (madrugada). |
| RNF-02 | Tolerancia a fallos: si una página falla, reintentar 2 veces antes de abortar. |
| RNF-03 | Tiempo total de ejecución < 10 minutos en el caso típico. |
| RNF-04 | Uso de memoria < 500 MB. |
| RNF-05 | Código en Node.js (LTS actual). |
| RNF-06 | Configuración mediante variables de entorno (`.env`), no hardcodeada. |

## 6. Datos a extraer

Por cada remate visible en el listado:

```
{
  "numero_remate": "22991",
  "convocatoria": "PRIMERA CONVOCATORIA",
  "tipo_remate": "REMATE SIMPLE",
  "ubicacion": "SAN RAMON",
  "fase": "Publicación e Inscripcion",
  "fecha_presentacion_ofertas": "2026-05-07T11:59:00",
  "estado_actual": "En proceso",
  "precio_base": 98305.21,
  "moneda": "PEN",
  "descripcion_corta": "DESCRIPCIÓN DEL BIEN INMUEBLE: ES UN INMUEBLE URBANO...",
  "fecha_extraccion": "2026-05-05T03:00:15Z"
}
```

**Nota:** la moneda viene como `S/.` (PEN) o `$` (USD); hay que normalizarla. El precio incluye comas como separador de miles que también hay que limpiar.

## 7. Almacenamiento

**Recomendación: SQLite** (`better-sqlite3` en Node).

### Justificación

| Opción | Ventajas | Por qué NO en este caso |
|--------|----------|-------------------------|
| JSON/CSV por día | Simple, legible | Desordenado tras 30+ días, difícil deduplicar y consultar |
| **SQLite** | Un solo archivo, queries SQL, deduplicación trivial con UNIQUE, sin servidor | — |
| Postgres en la nube | Profesional, accesible remoto | Overkill para uso personal, costo innecesario |
| Google Sheets | Visual, compartible | Lento con 200+ filas/día, API quotas |

### Esquema propuesto

```sql
CREATE TABLE remates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_remate TEXT NOT NULL,
  convocatoria TEXT,
  tipo_remate TEXT,
  ubicacion TEXT,
  fase TEXT,
  fecha_presentacion_ofertas TEXT,
  estado_actual TEXT,
  precio_base REAL,
  moneda TEXT,
  descripcion_corta TEXT,
  fecha_extraccion TEXT NOT NULL,
  UNIQUE(numero_remate, fecha_extraccion)
);

CREATE INDEX idx_numero_remate ON remates(numero_remate);
CREATE INDEX idx_fecha_extraccion ON remates(fecha_extraccion);
```

La constraint `UNIQUE(numero_remate, fecha_extraccion)` permite tener el mismo remate en múltiples días (histórico) pero evita duplicados dentro del mismo día.

## 8. Diseño técnico — Approach principal: Playwright

### 8.1 ¿Por qué Playwright?

REMAJU está construido con **JSF + PrimeFaces** (no PHP, como podría parecer por el dominio gob.pe). Esto implica:

- Cada interacción (paginación, filtros) usa un token oculto llamado **`javax.faces.ViewState`** que cambia en cada request.
- La sesión es stateful (`jsessionid` cookie).
- Las respuestas AJAX vienen como **XML de actualización parcial**, no JSON.

Un navegador real maneja todo esto de forma transparente. Playwright deja que el sitio funcione como fue diseñado y nosotros solo extraemos los datos resultantes.

### 8.2 Flujo del scraper

```
1. Lanzar Chromium headless
2. Navegar a remateExterno.xhtml
3. Esperar a que la tabla cargue (selector específico, no networkidle ciego)
4. Extraer registros visibles de la página actual
5. ¿Hay siguiente página?
   - Sí → click en "siguiente", esperar actualización, ir a paso 4
   - No → continuar
6. Persistir todos los registros en SQLite
7. Cerrar el navegador
8. Loggear resumen (registros, duración, errores)
```

### 8.3 Selectores clave a investigar

Antes de codear, usar `npx playwright codegen <url>` para grabar la interacción manual y obtener selectores reales. Los puntos críticos son:

- Contenedor de cada tarjeta de remate (probablemente `.ui-datalist-item` o similar de PrimeFaces).
- Botón/link "siguiente página" en el paginador.
- Indicador de "última página alcanzada" (botón deshabilitado, número de página actual, etc.).
- Selector que confirma que la tabla terminó de actualizarse después de un click (clave: si extraes muy rápido, lees datos de la página anterior).

### 8.4 Manejo de errores

| Escenario | Estrategia |
|-----------|-----------|
| Timeout al cargar página | Reintentar 2 veces con backoff exponencial (5s, 15s) |
| Selector no encontrado | Loggear, abortar la corrida del día y notificar (alerta manual) |
| Cambio de estructura HTML | Detectable porque RF-02 retorna 0 registros → alerta |
| Sitio caído (5xx) | Reintentar al cabo de 30 minutos hasta 3 veces, luego abortar |

### 8.5 Estructura del proyecto

```
remaju-scraper/
├── src/
│   ├── scraper.js          # Orquesta el flujo principal
│   ├── playwright-driver.js # Lógica específica de Playwright
│   ├── parsers.js           # Limpieza de precios, fechas, etc.
│   ├── db.js                # Conexión y queries a SQLite
│   └── logger.js            # Wrapper sobre console o pino
├── data/
│   └── remaju.db            # Base SQLite (gitignored)
├── logs/
│   └── scraper-YYYY-MM-DD.log
├── scripts/
│   └── export-csv.js        # Exportación bajo demanda
├── .env.example
├── package.json
└── README.md
```

### 8.6 Automatización diaria

**Opción A — `node-cron` dentro del proceso:** el script queda corriendo permanentemente. Simple pero requiere que el proceso siempre esté activo (PM2, systemd).

**Opción B — Cron del sistema operativo (recomendado):** el SO dispara el script una vez al día. Más robusto, no consume recursos cuando no corre. En Linux, una entrada en crontab tipo `0 3 * * *` ejecuta a las 3 AM.

**Opción C — GitHub Actions con cron schedule:** gratis hasta cierto límite, no necesita servidor propio. Buena opción si la base de datos vive en un servicio gratuito (ej. Turso/LibSQL).

Recomendación inicial: **opción B en máquina personal**, migrar a opción C si quieres independencia del equipo encendido.

## 9. Diseño técnico — Approach alternativo: HTTP directo

### 9.1 ¿Cuándo considerarlo?

- Cuando ya tengo el scraper funcionando con Playwright y quiero **optimizar velocidad/recursos**.
- Si necesito desplegar en un entorno donde no puedo instalar Chromium (serverless con poco espacio, microcontainers).
- Como ejercicio de aprendizaje sobre cómo funciona JSF por dentro.

### 9.2 Flujo

```
1. GET inicial a remateExterno.xhtml
   - Guardar cookie jsessionid
   - Parsear HTML para extraer javax.faces.ViewState
2. Extraer registros de la página 1 desde el HTML
3. POST a la misma URL con:
   - Cookie jsessionid
   - Body con: javax.faces.ViewState, javax.faces.partial.ajax=true,
     javax.faces.source=<id-del-paginator>, javax.faces.partial.execute, etc.
4. La respuesta es XML parcial → extraer:
   - Nuevo ViewState (actualizar para próxima request)
   - HTML actualizado de la tabla
5. Parsear el HTML extraído con cheerio
6. Repetir paso 3-5 hasta agotar páginas
7. Persistir
```

### 9.3 Cómo descubrir los parámetros del POST

Abrir DevTools → Network → filtrar XHR → hacer clic en "página 2" manualmente → inspeccionar el request. Copiar **todos** los campos del form data, incluso los que parecen vacíos.

### 9.4 Trade-offs vs. Playwright

| Aspecto | Playwright | HTTP directo |
|---------|-----------|---------------|
| Tiempo de ejecución | 5-10 min | 30-90 s |
| RAM | 200-400 MB | 30-80 MB |
| Tamaño deploy | ~300 MB (Chromium) | ~20 MB |
| Robustez ante cambios | Alta | Frágil (cambia un id → se rompe todo) |
| Tiempo de desarrollo | Bajo | Alto (mucho prueba y error) |
| Curva de aprendizaje | Media | Alta (entender JSF a fondo) |

**Veredicto:** empezar con Playwright. Migrar a HTTP solo si hay un dolor real de recursos o velocidad.

## 10. Fases de desarrollo

### Fase 1 — MVP (objetivo: 2-3 días)
- Setup del proyecto Node + Playwright.
- Grabar interacción con `codegen` y extraer selectores.
- Scrapear la primera página y confirmar que se ven todos los campos correctamente.
- Implementar paginación.
- Persistir en JSON local (rápido para iterar).

### Fase 2 — Persistencia (1 día)
- Migrar a SQLite con el esquema definido.
- Lógica de deduplicación.
- Script de exportación a CSV.

### Fase 3 — Robustez (1 día)
- Manejo de errores y reintentos.
- Logging estructurado.
- Modo `--dry-run` para testing sin escribir en DB.

### Fase 4 — Automatización (medio día)
- Configurar cron del sistema o GitHub Actions.
- Confirmar que corre sin intervención durante una semana.

### Fase 5 — (opcional, futuro) — HTTP directo
- Solo si hay justificación clara.

## 11. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| El sitio cambia su HTML/IDs | Media | Alto | Tests mínimos que validen presencia de campos clave; alerta cuando registros = 0 |
| Sitio bloquea por scraping intenso | Baja | Alto | Delays de 2-3s, User-Agent realista, ejecución en horario nocturno |
| El sitio tiene términos que prohíben scraping | A verificar | Alto | **Acción pendiente:** revisar `robots.txt` y términos de uso antes de Fase 4 |
| Caída del sitio el día de la corrida | Media | Medio | Reintento automático en 30 min |
| Pérdida de datos por bug en deduplicación | Baja | Medio | Backup semanal del archivo SQLite |

## 12. Métricas de éxito

- ✅ El scraper extrae **≥ 95%** de los registros visibles en la web manualmente (validación inicial).
- ✅ Corre **30 días seguidos sin intervención** con tasa de éxito ≥ 90%.
- ✅ Tiempo de ejecución < 10 minutos.
- ✅ La base SQLite resulta consultable con SQL básico para responder preguntas como "¿qué remates aparecieron por primera vez ayer?".

## 13. Decisiones abiertas

1. **Hosting de la automatización:** ¿máquina propia, VPS pequeño, o GitHub Actions? → decidir al final de Fase 3.
2. **Backup de la DB:** ¿manual semanal, o automatizado a Google Drive/S3? → tras 1 mes de operación.
3. **Versionado del esquema SQLite:** si en el futuro agrego columnas, ¿migrations manuales o con alguna lib? → reevaluar cuando aparezca la necesidad.

## 14. Glosario

- **JSF (JavaServer Faces):** framework Java para construir interfaces web del lado del servidor.
- **PrimeFaces:** librería de componentes UI sobre JSF, muy común en sistemas gubernamentales y empresariales.
- **ViewState:** token oculto que JSF usa para mantener el estado de la "vista" entre requests. Sin él, no puedes hacer postbacks válidos.
- **Idempotencia:** propiedad de que ejecutar la misma operación N veces produzca el mismo resultado que ejecutarla 1 vez. Aquí: correr el scraper 2 veces el mismo día no debe duplicar registros.
- **`networkidle`:** estado en Playwright cuando no hay tráfico de red por un momento. Poco confiable en sitios JSF porque el polling puede confundirlo.

---

**Próximos pasos:**
1. Revisar y ajustar este PRD si algo no calza con tu visión.
2. Crear el repositorio y hacer el setup inicial del proyecto.
3. Empezar Fase 1.
