import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const rooms = mysqlTable("rooms", {
  id: int("id").autoincrement().primaryKey(),
  roomCode: varchar("roomCode", { length: 8 }).notNull(),
  hostMemberToken: varchar("hostMemberToken", { length: 64 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 128 }),
  movieTitle: varchar("movieTitle", { length: 255 }),
  movieSource: varchar("movieSource", { length: 32 }),
  movieUrl: text("movieUrl"),
  posterUrl: text("posterUrl"),
  playerUrl: text("playerUrl"),
  durationSeconds: int("durationSeconds"),
  currentPosition: int("currentPosition").default(0).notNull(),
  isPlaying: int("isPlaying").default(0).notNull(),
  playbackUpdatedAt: timestamp("playbackUpdatedAt").defaultNow().notNull(),
  hostControlsOnly: int("hostControlsOnly").default(1).notNull(),
  isLocked: int("isLocked").default(0).notNull(),
  maxMembers: int("maxMembers").default(3).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
}, (table) => ({
  roomCodeUnique: uniqueIndex("rooms_room_code_unique").on(table.roomCode),
  expiresIndex: index("rooms_expires_at_idx").on(table.expiresAt),
}));

export const roomMembers = mysqlTable("room_members", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: int("userId"),
  memberToken: varchar("memberToken", { length: 64 }).notNull(),
  displayName: varchar("displayName", { length: 32 }).notNull(),
  avatarColor: varchar("avatarColor", { length: 16 }).notNull(),
  isHost: int("isHost").default(0).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  lastSeen: timestamp("lastSeen").defaultNow().notNull(),
}, (table) => ({
  tokenUnique: uniqueIndex("room_members_token_unique").on(table.memberToken),
  roomIndex: index("room_members_room_idx").on(table.roomId),
}));

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  memberId: int("memberId").notNull(),
  message: varchar("message", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  roomMessagesIndex: index("messages_room_created_idx").on(table.roomId, table.createdAt),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Room = typeof rooms.$inferSelect;
export type RoomMember = typeof roomMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
