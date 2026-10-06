import { desc, eq } from "drizzle-orm";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { detectMovieSource, type MovieMetadata, type MovieSource } from "@shared/source";
import { getDb } from "./db";
import { messages, roomMembers, rooms } from "../drizzle/schema";

export class RoomError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "RoomError";
  }
}

type InternalMember = {
  id: string;
  dbId: number | null;
  token: string;
  displayName: string;
  avatarColor: string;
  isHost: boolean;
  joinedAt: number;
  lastSeen: number;
};

type InternalMessage = {
  id: string;
  memberId: string;
  displayName: string;
  message: string;
  createdAt: number;
};

type InternalRoom = {
  id: string;
  dbId: number | null;
  code: string;
  password: string | null;
  hostToken: string;
  createdAt: number;
  expiresAt: number;
  currentPosition: number;
  isPlaying: boolean;
  playbackUpdatedAt: number;
  hostControlsOnly: boolean;
  isLocked: boolean;
  maxMembers: number;
  movie: MovieMetadata | null;
  members: Map<string, InternalMember>;
  messages: InternalMessage[];
};

type AudioSignal = { kind: "offer" | "answer" | "candidate" | "leave"; description?: { type?: string; sdp?: string }; candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };
type RoomEvent = { type: "snapshot" | "message" | "presence" | "ended"; snapshot?: RoomSnapshot; message?: ChatMessage } | { type: "audio-signal"; fromMemberId: string; toMemberId: string; signal: AudioSignal };

export type MemberView = Omit<InternalMember, "token" | "dbId"> & { online: boolean };
export type ChatMessage = InternalMessage;
export type RoomSnapshot = {
  code: string;
  roomId: string;
  createdAt: string;
  expiresAt: string;
  currentPosition: number;
  isPlaying: boolean;
  playbackUpdatedAt: string;
  hostControlsOnly: boolean;
  isLocked: boolean;
  maxMembers: number;
  movie: MovieMetadata | null;
  members: MemberView[];
  messages: ChatMessage[];
};

const roomsByCode = new Map<string, InternalRoom>();
const events = new EventEmitter();
const lastMessageByToken = new Map<string, number>();
const COLORS = ["#D4FF45", "#B58CFF", "#6DE3FF"];

function now() { return Date.now(); }
function makeCode() { return nanoid(6).toUpperCase().replace(/[-_]/g, "A"); }
function makeToken() { return nanoid(40); }
function normalizeName(value: unknown) {
  const name = typeof value === "string" ? value.trim().replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 32) : "";
  if (name.length < 2) throw new RoomError(400, "Please choose a username with at least 2 characters.");
  return name;
}
function expiresIn(hours = 6) { return now() + hours * 60 * 60 * 1000; }
function visibleOnline(lastSeen: number) { return now() - lastSeen < 20_000; }
function avatarColor(index: number) { return COLORS[index % COLORS.length]; }
function hashPassword(value: string | null) { return value ? createHash("sha256").update(value).digest("hex") : null; }

function snapshot(room: InternalRoom): RoomSnapshot {
  const position = room.isPlaying ? room.currentPosition + (now() - room.playbackUpdatedAt) / 1000 : room.currentPosition;
  return {
    code: room.code,
    roomId: room.id,
    createdAt: new Date(room.createdAt).toISOString(),
    expiresAt: new Date(room.expiresAt).toISOString(),
    currentPosition: Math.max(0, position),
    isPlaying: room.isPlaying,
    playbackUpdatedAt: new Date(room.playbackUpdatedAt).toISOString(),
    hostControlsOnly: room.hostControlsOnly,
    isLocked: room.isLocked,
    maxMembers: room.maxMembers,
    movie: room.movie,
    members: [...room.members.values()].map(({ token: _token, dbId: _dbId, ...member }) => ({ ...member, online: visibleOnline(member.lastSeen) })),
    messages: room.messages.slice(-80),
  };
}

function emit(code: string, event: RoomEvent) { events.emit(`room:${code}`, event); }
export function subscribe(code: string, handler: (event: RoomEvent) => void) {
  events.on(`room:${code}`, handler);
  return () => events.off(`room:${code}`, handler);
}

async function persistCreate(room: InternalRoom) {
  const db = await getDb();
  if (!db) return;
  try {
    const inserted = await db.insert(rooms).values({
      roomCode: room.code,
      hostMemberToken: room.hostToken,
      passwordHash: room.password,
      currentPosition: 0,
      isPlaying: 0,
      playbackUpdatedAt: new Date(room.playbackUpdatedAt),
      hostControlsOnly: 1,
      isLocked: 0,
      maxMembers: room.maxMembers,
      expiresAt: new Date(room.expiresAt),
    });
    room.dbId = Number(inserted[0].insertId);
    const host = [...room.members.values()][0];
    const memberInsert = await db.insert(roomMembers).values({ roomId: room.dbId, memberToken: host.token, displayName: host.displayName, avatarColor: host.avatarColor, isHost: 1 });
    host.dbId = Number(memberInsert[0].insertId);
  } catch (error) {
    console.warn("[Rooms] Database create skipped:", error);
  }
}

async function loadRoom(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const rows = await db.select().from(rooms).where(eq(rooms.roomCode, code)).limit(1);
    const row = rows[0];
    if (!row) return undefined;
    const membersRows = await db.select().from(roomMembers).where(eq(roomMembers.roomId, row.id));
    const messageRows = await db.select().from(messages).where(eq(messages.roomId, row.id)).orderBy(desc(messages.createdAt)).limit(80);
    const room: InternalRoom = {
      id: String(row.id), dbId: row.id, code: row.roomCode, password: row.passwordHash, hostToken: row.hostMemberToken,
      createdAt: row.createdAt.getTime(), expiresAt: row.expiresAt.getTime(), currentPosition: row.currentPosition, isPlaying: Boolean(row.isPlaying),
      playbackUpdatedAt: row.playbackUpdatedAt.getTime(), hostControlsOnly: Boolean(row.hostControlsOnly), isLocked: Boolean(row.isLocked), maxMembers: row.maxMembers,
      movie: row.movieUrl && row.movieSource ? { source: row.movieSource as MovieSource, sourceLabel: row.movieSource, originalUrl: row.movieUrl, playerUrl: row.playerUrl, title: row.movieTitle ?? "Untitled screening", posterUrl: row.posterUrl, durationSeconds: row.durationSeconds } : null,
      members: new Map(), messages: messageRows.reverse().map(item => ({ id: String(item.id), memberId: String(item.memberId), displayName: membersRows.find(member => member.id === item.memberId)?.displayName ?? "Guest", message: item.message, createdAt: item.createdAt.getTime() })),
    };
    membersRows.forEach((member, index) => room.members.set(String(member.id), { id: String(member.id), dbId: member.id, token: member.memberToken, displayName: member.displayName, avatarColor: member.avatarColor, isHost: Boolean(member.isHost), joinedAt: member.joinedAt.getTime(), lastSeen: member.lastSeen.getTime() }));
    roomsByCode.set(code, room);
    return room;
  } catch (error) {
    console.warn("[Rooms] Database load skipped:", error);
    return undefined;
  }
}

async function getRoom(code: string) {
  const normalized = code.trim().toUpperCase();
  const existing = roomsByCode.get(normalized) ?? await loadRoom(normalized);
  if (!existing || existing.expiresAt < now()) throw new RoomError(404, "This room is no longer available.");
  return existing;
}
function memberFor(room: InternalRoom, token: string | undefined) {
  const member = token ? [...room.members.values()].find(item => item.token === token) : undefined;
  if (!member) throw new RoomError(401, "Join this room with a valid guest token.");
  return member;
}
function assertHost(room: InternalRoom, token: string | undefined) {
  const member = memberFor(room, token);
  if (!member.isHost) throw new RoomError(403, "Only the host can do that.");
  return member;
}
async function touch(room: InternalRoom, member: InternalMember) {
  member.lastSeen = now();
  const db = await getDb();
  if (db && member.dbId) await db.update(roomMembers).set({ lastSeen: new Date(member.lastSeen) }).where(eq(roomMembers.id, member.dbId)).catch(() => undefined);
}

export async function createRoom(input: { username: unknown; password?: unknown; movieUrl?: unknown }) {
  const username = normalizeName(input.username);
  const code = makeCode();
  const hostToken = makeToken();
  const room: InternalRoom = { id: nanoid(12), dbId: null, code, password: hashPassword(typeof input.password === "string" ? input.password.trim().slice(0, 64) || null : null), hostToken, createdAt: now(), expiresAt: expiresIn(), currentPosition: 0, isPlaying: false, playbackUpdatedAt: now(), hostControlsOnly: true, isLocked: false, maxMembers: 3, movie: null, members: new Map(), messages: [] };
  const host: InternalMember = { id: nanoid(10), dbId: null, token: hostToken, displayName: username, avatarColor: avatarColor(0), isHost: true, joinedAt: now(), lastSeen: now() };
  room.members.set(host.id, host);
  if (typeof input.movieUrl === "string" && input.movieUrl.trim()) room.movie = detectMovieSource(input.movieUrl);
  roomsByCode.set(code, room);
  await persistCreate(room);
  return { snapshot: snapshot(room), memberToken: hostToken, memberId: host.id };
}

export async function joinRoom(input: { code: string; username: unknown; password?: unknown; memberToken?: string }) {
  const room = await getRoom(input.code);
  if (input.memberToken) {
    const existing = [...room.members.values()].find(member => member.token === input.memberToken);
    if (existing) { await touch(room, existing); return { snapshot: snapshot(room), memberToken: existing.token, memberId: existing.id }; }
  }
  if (room.isLocked) throw new RoomError(423, "This room is locked by the host.");
  if (room.members.size >= room.maxMembers) throw new RoomError(409, "This room has reached its 3-person limit.");
  if (room.password && room.password !== hashPassword(typeof input.password === "string" ? input.password : "")) throw new RoomError(401, "That room password is not correct.");
  const member: InternalMember = { id: nanoid(10), dbId: null, token: makeToken(), displayName: normalizeName(input.username), avatarColor: avatarColor(room.members.size), isHost: false, joinedAt: now(), lastSeen: now() };
  room.members.set(member.id, member);
  const db = await getDb();
  if (db && room.dbId) {
    const inserted = await db.insert(roomMembers).values({ roomId: room.dbId, memberToken: member.token, displayName: member.displayName, avatarColor: member.avatarColor, isHost: 0 });
    member.dbId = Number(inserted[0].insertId);
  }
  emit(room.code, { type: "presence", snapshot: snapshot(room) });
  return { snapshot: snapshot(room), memberToken: member.token, memberId: member.id };
}

export async function getSnapshot(code: string, token: string | undefined) {
  const room = await getRoom(code);
  const member = memberFor(room, token);
  await touch(room, member);
  return snapshot(room);
}

export async function updatePlayback(code: string, token: string | undefined, input: { action: "play" | "pause" | "seek"; position: number }) {
  const room = await getRoom(code);
  const member = memberFor(room, token);
  if (room.hostControlsOnly && !member.isHost) throw new RoomError(403, "Playback is controlled by the host.");
  const position = Number.isFinite(input.position) ? Math.max(0, Math.min(input.position, 24 * 60 * 60)) : 0;
  room.currentPosition = position;
  room.isPlaying = input.action !== "pause";
  room.playbackUpdatedAt = now();
  await touch(room, member);
  const db = await getDb();
  if (db && room.dbId) await db.update(rooms).set({ currentPosition: Math.round(position), isPlaying: room.isPlaying ? 1 : 0, playbackUpdatedAt: new Date(room.playbackUpdatedAt) }).where(eq(rooms.id, room.dbId)).catch(() => undefined);
  emit(room.code, { type: "snapshot", snapshot: snapshot(room) });
  return snapshot(room);
}

export async function updateMovie(code: string, token: string | undefined, rawUrl: unknown) {
  const room = await getRoom(code); assertHost(room, token);
  if (typeof rawUrl !== "string" || rawUrl.length > 2048) throw new RoomError(400, "Enter a valid movie URL.");
  const movie = detectMovieSource(rawUrl);
  if (movie.source === "unsupported") throw new RoomError(422, "This source cannot be played inside Movie Watcher. Please use a supported or officially embeddable source.");
  room.movie = movie; room.currentPosition = 0; room.isPlaying = false; room.playbackUpdatedAt = now();
  const db = await getDb();
  if (db && room.dbId) await db.update(rooms).set({ movieTitle: movie.title, movieSource: movie.source, movieUrl: movie.originalUrl, posterUrl: movie.posterUrl, playerUrl: movie.playerUrl, durationSeconds: movie.durationSeconds, currentPosition: 0, isPlaying: 0, playbackUpdatedAt: new Date(room.playbackUpdatedAt) }).where(eq(rooms.id, room.dbId)).catch(() => undefined);
  emit(room.code, { type: "snapshot", snapshot: snapshot(room) });
  return snapshot(room);
}

export async function relayAudioSignal(code: string, token: string | undefined, input: { toMemberId?: unknown; signal?: unknown }) {
  const room = await getRoom(code);
  const member = memberFor(room, token);
  const toMemberId = typeof input.toMemberId === "string" ? input.toMemberId : "";
  const target = room.members.get(toMemberId);
  if (!target || target.id === member.id) throw new RoomError(400, "That audio participant is not available.");
  if (!input.signal || typeof input.signal !== "object") throw new RoomError(400, "Invalid audio signal.");
  const signal = input.signal as Record<string, unknown>;
  if (!["offer", "answer", "candidate", "leave"].includes(String(signal.kind))) throw new RoomError(400, "Invalid audio signal type.");
  if (JSON.stringify(signal).length > 100_000) throw new RoomError(413, "Audio signal is too large.");
  await touch(room, member);
  emit(room.code, { type: "audio-signal", fromMemberId: member.id, toMemberId: target.id, signal: signal as AudioSignal });
  return { success: true };
}

export async function addMessage(code: string, token: string | undefined, rawMessage: unknown) {
  const room = await getRoom(code); const member = memberFor(room, token);
  const message = typeof rawMessage === "string" ? rawMessage.trim().slice(0, 500) : "";
  if (!message) throw new RoomError(400, "Write a message before sending.");
  const lastMessage = lastMessageByToken.get(member.token) ?? 0;
  if (now() - lastMessage < 350) throw new RoomError(429, "You are sending messages too quickly.");
  lastMessageByToken.set(member.token, now());
  const item: InternalMessage = { id: nanoid(12), memberId: member.id, displayName: member.displayName, message, createdAt: now() };
  room.messages.push(item); await touch(room, member);
  const db = await getDb();
  if (db && room.dbId && member.dbId) { const inserted = await db.insert(messages).values({ roomId: room.dbId, memberId: member.dbId, message }); item.id = String(inserted[0].insertId); }
  emit(room.code, { type: "message", message: item, snapshot: snapshot(room) });
  return item;
}

export async function updateSettings(code: string, token: string | undefined, input: { hostControlsOnly?: boolean; isLocked?: boolean }) {
  const room = await getRoom(code); assertHost(room, token);
  if (typeof input.hostControlsOnly === "boolean") room.hostControlsOnly = input.hostControlsOnly;
  if (typeof input.isLocked === "boolean") room.isLocked = input.isLocked;
  const db = await getDb();
  if (db && room.dbId) await db.update(rooms).set({ hostControlsOnly: room.hostControlsOnly ? 1 : 0, isLocked: room.isLocked ? 1 : 0 }).where(eq(rooms.id, room.dbId)).catch(() => undefined);
  emit(room.code, { type: "snapshot", snapshot: snapshot(room) });
  return snapshot(room);
}

export async function removeMember(code: string, token: string | undefined, memberId: string) {
  const room = await getRoom(code); assertHost(room, token);
  const target = room.members.get(memberId);
  if (!target || target.isHost) throw new RoomError(400, "That member cannot be removed.");
  room.members.delete(memberId);
  const db = await getDb();
  if (db && target.dbId) await db.delete(roomMembers).where(eq(roomMembers.id, target.dbId)).catch(() => undefined);
  emit(room.code, { type: "presence", snapshot: snapshot(room) });
  return snapshot(room);
}

export async function endRoom(code: string, token: string | undefined) {
  const room = await getRoom(code); assertHost(room, token);
  const db = await getDb();
  if (db && room.dbId) { await db.delete(messages).where(eq(messages.roomId, room.dbId)).catch(() => undefined); await db.delete(roomMembers).where(eq(roomMembers.roomId, room.dbId)).catch(() => undefined); await db.delete(rooms).where(eq(rooms.id, room.dbId)).catch(() => undefined); }
  roomsByCode.delete(room.code); emit(room.code, { type: "ended" });
  return { success: true };
}
