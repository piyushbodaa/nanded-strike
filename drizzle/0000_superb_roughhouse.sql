CREATE TABLE `game_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`sessions` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `game_rooms_updated_at_idx` ON `game_rooms` (`updated_at`);