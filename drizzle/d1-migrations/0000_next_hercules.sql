CREATE TABLE `feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`category` text NOT NULL,
	`is_sub` integer DEFAULT false NOT NULL,
	`custom_title` text DEFAULT '',
	`allowed_media_hosts` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`feed_id` text NOT NULL,
	`guid` text,
	`link` text,
	`title` text,
	`pub_date` text,
	`content` text,
	`description` text,
	`thumbnail` text,
	`author` text,
	`enclosure` text,
	`feed_title` text,
	`last_updated` text NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_history_feed_id_pub_date` ON `history` (`feed_id`,`pub_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_history_feed_id_guid` ON `history` (`feed_id`,`guid`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_history_feed_id_link` ON `history` (`feed_id`,`link`);