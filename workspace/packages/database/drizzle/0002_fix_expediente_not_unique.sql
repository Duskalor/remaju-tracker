-- expediente NO es único: el mismo caso judicial (expediente) puede tener
-- múltiples remates (primera, segunda, tercera convocatoria).
-- El identificador único real del negocio es remate_numero.

DROP INDEX IF EXISTS `idx_expediente`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_expediente` ON `remates` (`expediente`);
--> statement-breakpoint

-- Limpiar placeholders PENDING_ que ya no tienen sentido semántico.
-- El detalle scraper los sobreescribirá con el expediente real.
-- Los que nunca fueron scrapeados quedan como PENDING_ (válido, NOT NULL satisfecho).
UPDATE remates SET expediente = 'PENDING_' || remate_numero
  WHERE expediente LIKE 'PENDING_%' AND remate_numero IS NOT NULL;
