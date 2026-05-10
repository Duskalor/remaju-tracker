CREATE TABLE `remates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`expediente` text NOT NULL,
	`remate_numero` text,
	`tipo_remate` text,
	`fecha_remate` text,
	`bienes` text,
	`estado` text,
	`juzgado` text,
	`direccion` text,
	`observaciones` text,
	`raw_html` text,
	`scraped_at` text DEFAULT (datetime('now')) NOT NULL,
	`source_url` text NOT NULL,
	`distrito` text,
	`provincia` text,
	`departamento` text,
	`partida` text,
	`area_m2` real,
	`descripcion_raw` text,
	`direccion_raw` text,
	`precio_por_m2` real,
	`tipo_inmueble` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_expediente` ON `remates` (`expediente`);--> statement-breakpoint
CREATE INDEX `idx_scraped_at` ON `remates` (`scraped_at`);--> statement-breakpoint
CREATE INDEX `idx_juzgado` ON `remates` (`juzgado`);--> statement-breakpoint
CREATE INDEX `idx_estado` ON `remates` (`estado`);--> statement-breakpoint
CREATE INDEX `idx_distrito` ON `remates` (`distrito`);--> statement-breakpoint
CREATE INDEX `idx_area_m2` ON `remates` (`area_m2`);