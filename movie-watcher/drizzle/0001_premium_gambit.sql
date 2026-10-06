CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`memberId` int NOT NULL,
	`message` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `room_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`userId` int,
	`memberToken` varchar(64) NOT NULL,
	`displayName` varchar(32) NOT NULL,
	`avatarColor` varchar(16) NOT NULL,
	`isHost` int NOT NULL DEFAULT 0,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeen` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `room_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `room_members_token_unique` UNIQUE(`memberToken`)
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomCode` varchar(8) NOT NULL,
	`hostMemberToken` varchar(64) NOT NULL,
	`passwordHash` varchar(128),
	`movieTitle` varchar(255),
	`movieSource` varchar(32),
	`movieUrl` text,
	`posterUrl` text,
	`playerUrl` text,
	`durationSeconds` int,
	`currentPosition` int NOT NULL DEFAULT 0,
	`isPlaying` int NOT NULL DEFAULT 0,
	`playbackUpdatedAt` timestamp NOT NULL DEFAULT (now()),
	`hostControlsOnly` int NOT NULL DEFAULT 1,
	`isLocked` int NOT NULL DEFAULT 0,
	`maxMembers` int NOT NULL DEFAULT 3,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `rooms_room_code_unique` UNIQUE(`roomCode`)
);
--> statement-breakpoint
CREATE INDEX `messages_room_created_idx` ON `messages` (`roomId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `room_members_room_idx` ON `room_members` (`roomId`);--> statement-breakpoint
CREATE INDEX `rooms_expires_at_idx` ON `rooms` (`expiresAt`);