import "dotenv/config";
import express, { type Request, type Response } from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { RoomError, addMessage, createRoom, endRoom, getSnapshot, joinRoom, removeMember, subscribe, updateMovie, updatePlayback, updateSettings } from "../room-store";

function memberToken(req: Request) {
  const header = req.header("x-member-token") ?? req.header("authorization");
  return header?.replace(/^Bearer\s+/i, "").trim() || (typeof req.query.memberToken === "string" ? req.query.memberToken : undefined);
}

function sendError(res: Response, error: unknown) {
  if (error instanceof RoomError) return res.status(error.status).json({ message: error.message });
  console.error("[API] Unexpected error:", error);
  return res.status(500).json({ message: "Something went wrong. Please try again." });
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript()));
  registerOAuthRoutes(app);
  app.post("/api/rooms", async (req, res) => { try { return res.status(201).json(await createRoom(req.body ?? {})); } catch (error) { return sendError(res, error); } });
  app.post("/api/rooms/:roomCode/join", async (req, res) => { try { return res.json(await joinRoom({ ...req.body, code: req.params.roomCode, memberToken: memberToken(req) })); } catch (error) { return sendError(res, error); } });
  app.get("/api/rooms/:roomCode", async (req, res) => { try { return res.json(await getSnapshot(req.params.roomCode, memberToken(req))); } catch (error) { return sendError(res, error); } });
  app.post("/api/rooms/:roomCode/playback", async (req, res) => { try { return res.json(await updatePlayback(req.params.roomCode, memberToken(req), req.body ?? {})); } catch (error) { return sendError(res, error); } });
  app.post("/api/rooms/:roomCode/movie", async (req, res) => { try { return res.json(await updateMovie(req.params.roomCode, memberToken(req), req.body?.url)); } catch (error) { return sendError(res, error); } });
  app.post("/api/rooms/:roomCode/messages", async (req, res) => { try { return res.status(201).json(await addMessage(req.params.roomCode, memberToken(req), req.body?.message)); } catch (error) { return sendError(res, error); } });
  app.post("/api/rooms/:roomCode/settings", async (req, res) => { try { return res.json(await updateSettings(req.params.roomCode, memberToken(req), req.body ?? {})); } catch (error) { return sendError(res, error); } });
  app.delete("/api/rooms/:roomCode/members/:memberId", async (req, res) => { try { return res.json(await removeMember(req.params.roomCode, memberToken(req), req.params.memberId)); } catch (error) { return sendError(res, error); } });
  app.delete("/api/rooms/:roomCode", async (req, res) => { try { return res.json(await endRoom(req.params.roomCode, memberToken(req))); } catch (error) { return sendError(res, error); } });
  app.get("/api/rooms/:roomCode/events", async (req, res) => { try { const roomCode = req.params.roomCode; const initial = await getSnapshot(roomCode, memberToken(req)); res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" }); res.write(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`); const unsubscribe = subscribe(roomCode, event => { if (event.type === "ended") res.write("event: ended\ndata: {}\n\n"); else if (event.type === "message") res.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`); else res.write(`event: snapshot\ndata: ${JSON.stringify(event.snapshot)}\n\n`); }); const keepAlive = setInterval(() => res.write(": heartbeat\n\n"), 15_000); req.on("close", () => { clearInterval(keepAlive); unsubscribe(); }); } catch (error) { return sendError(res, error); } });
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  if (process.env.NODE_ENV === "development") await setupVite(app, server); else serveStatic(app);
  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}
startServer().catch(error => { console.error(error); process.exit(1); });
