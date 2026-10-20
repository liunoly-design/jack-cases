CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`hash` text NOT NULL,
	`secret_value` text,
	`revoked_at` integer,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_hash_unique` ON `api_keys` (`hash`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `case_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `case_files` (
	`case_id` text NOT NULL,
	`file_id` text NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`case_id`, `file_id`),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `case_media` (
	`case_id` text NOT NULL,
	`media_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`case_id`, `media_id`),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `case_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `case_tags` (
	`case_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`case_id`, `tag_id`),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`requirement_id` text,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`requirement_code` text,
	`content_version` text DEFAULT 'v1.0' NOT NULL,
	`public_content` text,
	`category_id` text,
	`industry` text,
	`department` text,
	`difficulty` text,
	`implementation_status` text DEFAULT 'pending' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`name` text NOT NULL,
	`purpose` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`status` text DEFAULT 'private' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requirement_files` (
	`requirement_id` text NOT NULL,
	`file_id` text NOT NULL,
	PRIMARY KEY(`requirement_id`, `file_id`),
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requirement_media` (
	`requirement_id` text NOT NULL,
	`media_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`requirement_id`, `media_id`),
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requirement_tags` (
	`requirement_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`requirement_id`, `tag_id`),
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`requirement_code` text,
	`content_version` text DEFAULT 'v1.0' NOT NULL,
	`category_id` text,
	`industry` text,
	`department` text,
	`difficulty` text,
	`implementation_status` text DEFAULT 'pending' NOT NULL,
	`expected_outcome` text,
	`share_consent` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `requirements_owner_idx` ON `requirements` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `requirements_code_unique` ON `requirements` (`requirement_code`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`requirement_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`decision` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`group` text DEFAULT 'general' NOT NULL,
	`color` text DEFAULT 'orange' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'student' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);