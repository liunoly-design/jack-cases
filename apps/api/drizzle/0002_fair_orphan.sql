ALTER TABLE `api_keys` ADD `secret_encrypted` text;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `scopes` text;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `expires_at` integer;