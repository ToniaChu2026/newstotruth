CREATE TABLE `articleMedia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`articleId` int NOT NULL,
	`sourceUrl` varchar(2048) NOT NULL,
	`storageKey` varchar(1024) NOT NULL,
	`storageUrl` varchar(2048) NOT NULL,
	`altText` varchar(320),
	`displayOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `articleMedia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `articleTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`articleId` int NOT NULL,
	`tagId` int NOT NULL,
	CONSTRAINT `articleTags_id` PRIMARY KEY(`id`),
	CONSTRAINT `article_tag_unique` UNIQUE(`articleId`,`tagId`)
);
--> statement-breakpoint
CREATE TABLE `articles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(160) NOT NULL,
	`title` varchar(320) NOT NULL,
	`summary` mediumtext NOT NULL,
	`content` longtext NOT NULL,
	`status` enum('draft','pending review','published') NOT NULL DEFAULT 'draft',
	`sourceUrl` varchar(2048) NOT NULL,
	`categoryId` int,
	`authorId` int NOT NULL,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `articles_id` PRIMARY KEY(`id`),
	CONSTRAINT `articles_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`slug` varchar(96) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`slug` varchar(96) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `tags_slug_unique` UNIQUE(`slug`)
);
