import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, CircleHelp, Copy, ExternalLink, Film, Link2, Lock, LogOut, MessageCircle, MoreHorizontal, Pause, Play, Radio, Send, Settings, Shield, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Users, Volume2, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { api, getStoredToken, storeToken } from "@/lib/api";

type Movie = { source: "youtube" | "vimeo" | "direct" | "unsupported"; sourceLabel: string; originalUrl: string; playerUrl: string | null; title: string; posterUrl: string | null; durationSeconds: number | null };
type Member = { id: string; displayName: string; avatarColor: string; isHost: boolean; joinedAt: number; lastSeen: number; online: boolean };
type ChatMessage = { id: string; memberId: string; displayName: string; message: string; createdAt: number };
type Snapshot = { code: string; roomId: string; createdAt: string; expiresAt: string; currentPosition: number; isPlaying: boolean; playbackUpdatedAt: string; hostControlsOnly: boolean; isLocked: boolean; maxMembers: number; movie: Movie | null; members: Member[]; messages: ChatMessage[] };

type Props = { params: { roomCode: string } };

function formatTime(value: number) { const seconds = Math.max(0, Math.floor(value)); return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`; }
function displayDate(value: number) { return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(value); }

export default function WatchRoom({ params }: Props) {
  const code = params.roomCode.toUpperCase();
  const [, navigate] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const applyingRemote = useRef(false);
  const [token, setToken] = useState(() => getStoredToken(code));
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinName, setJoinName] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [message, setMessage] = useState("");
  const [movieUrl, setMovieUrl] = useState("");
  const [roomError, setRoomError] = useState("");
  const [notice, setNotice] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const me = useMemo(() => snapshot?.members.find(member => member.id === localStorage.getItem(`movie-watcher:member-id:${code}`)) ?? snapshot?.members.find(member => member.isHost && token === localStorage.getItem(`movie-watcher:host:${code}`)), [snapshot, code, token]);
  const canControl = Boolean(me?.isHost || !snapshot?.hostControlsOnly);

  function syncEmbed(action: "play" | "pause" | "seek", position = snapshot?.currentPosition ?? 0) {
    const currentMovie = snapshot?.movie;
    const target = iframeRef.current?.contentWindow;
    if (!currentMovie || currentMovie.source === "direct" || !target) return;
    if (currentMovie.source === "youtube") {
      const func = action === "play" ? "playVideo" : action === "pause" ? "pauseVideo" : "seekTo";
      target.postMessage(JSON.stringify({ event: "command", func, args: action === "seek" ? [position, true] : [] }), "*");
    } else if (currentMovie.source === "vimeo") {
      const method = action === "play" ? "play" : action === "pause" ? "pause" : "setCurrentTime";
      target.postMessage(JSON.stringify({ method, value: action === "seek" ? position : undefined }), "*");
    }
  }

  function togglePlayback() {
    if (snapshot?.movie?.source === "direct") void playback(videoRef.current?.paused ? "play" : "pause");
    else void playback(snapshot?.isPlaying ? "pause" : "play");
  }

  useEffect(() => { let active = true; setLoading(true); api<Snapshot>(`/api/rooms/${code}`, { token: token ?? undefined }).then(data => { if (active) setSnapshot(data); }).catch(error => { if (active) setRoomError(error instanceof Error ? error.message : "This room is not available."); }).finally(() => active && setLoading(false)); return () => { active = false; }; }, [code, token]);

  useEffect(() => {
    if (!token || !snapshot) return;
    const stream = new EventSource(`/api/rooms/${code}/events?memberToken=${encodeURIComponent(token)}`);
    eventSourceRef.current = stream;
    stream.addEventListener("snapshot", event => { try { setSnapshot(JSON.parse((event as MessageEvent).data)); } catch { /* ignore malformed event */ } });
    stream.addEventListener("message", event => { try { const payload = JSON.parse((event as MessageEvent).data); if (payload.snapshot) setSnapshot(payload.snapshot); } catch { /* ignore malformed event */ } });
    stream.addEventListener("ended", () => { setRoomError("The host ended this room."); setSnapshot(null); });
    stream.onerror = () => { /* EventSource retries automatically; tRPC polling is the fallback for reads. */ };
    return () => { stream.close(); eventSourceRef.current = null; };
  }, [code, token, Boolean(snapshot)]);

  useEffect(() => {
    if (!token || !snapshot) return;
    const interval = window.setInterval(() => { api<Snapshot>(`/api/rooms/${code}`, { token }).then(setSnapshot).catch(() => undefined); }, 10_000);
    return () => window.clearInterval(interval);
  }, [code, token, Boolean(snapshot)]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !snapshot?.movie || snapshot.movie.source !== "direct") return;
    const expected = snapshot.isPlaying ? snapshot.currentPosition + (Date.now() - new Date(snapshot.playbackUpdatedAt).getTime()) / 1000 : snapshot.currentPosition;
    if (Math.abs(video.currentTime - expected) > 0.75) { applyingRemote.current = true; video.currentTime = expected; window.setTimeout(() => { applyingRemote.current = false; }, 120); }
    if (snapshot.isPlaying && video.paused) { applyingRemote.current = true; void video.play().catch(() => undefined); window.setTimeout(() => { applyingRemote.current = false; }, 120); }
    if (!snapshot.isPlaying && !video.paused) { applyingRemote.current = true; video.pause(); window.setTimeout(() => { applyingRemote.current = false; }, 120); }
  }, [snapshot?.currentPosition, snapshot?.isPlaying, snapshot?.playbackUpdatedAt, snapshot?.movie?.playerUrl]);

  useEffect(() => {
    if (!snapshot?.movie || snapshot.movie.source === "direct") return;
    const timer = window.setTimeout(() => syncEmbed(snapshot.isPlaying ? "play" : "pause", snapshot.currentPosition), 150);
    return () => window.clearTimeout(timer);
  }, [snapshot?.currentPosition, snapshot?.isPlaying, snapshot?.movie?.source, snapshot?.movie?.playerUrl]);

  async function join() {
    setBusy(true); setRoomError("");
    try { const result = await api<{ snapshot: Snapshot; memberToken: string; memberId: string }>(`/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ username: joinName, password: joinPassword }) }); storeToken(code, result.memberToken); localStorage.setItem(`movie-watcher:member-id:${code}`, result.memberId); setToken(result.memberToken); setSnapshot(result.snapshot); }
    catch (error) { setRoomError(error instanceof Error ? error.message : "Could not join this room."); }
    finally { setBusy(false); }
  }
  async function playback(action: "play" | "pause" | "seek", position?: number) {
    if (!canControl || !token) return;
    const videoPosition = position ?? videoRef.current?.currentTime ?? snapshot?.currentPosition ?? 0;
    if (snapshot?.movie?.source !== "direct") syncEmbed(action, videoPosition);
    try { const next = await api<Snapshot>(`/api/rooms/${code}/playback`, { method: "POST", token, body: JSON.stringify({ action, position: videoPosition }) }); setSnapshot(next); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Playback could not be synced."); }
  }
  async function sendMessage() { if (!message.trim() || !token) return; try { await api(`/api/rooms/${code}/messages`, { method: "POST", token, body: JSON.stringify({ message }) }); setMessage(""); } catch (error) { setNotice(error instanceof Error ? error.message : "Message could not be sent."); } }
  async function addMovie() { if (!movieUrl.trim() || !token) return; setBusy(true); try { const next = await api<Snapshot>(`/api/rooms/${code}/movie`, { method: "POST", token, body: JSON.stringify({ url: movieUrl }) }); setSnapshot(next); setMovieUrl(""); setNotice("Source added. Ready when you are."); } catch (error) { setNotice(error instanceof Error ? error.message : "This source cannot be played inside Movie Watcher."); } finally { setBusy(false); } }
  async function setting(input: { hostControlsOnly?: boolean; isLocked?: boolean }) { if (!token) return; try { setSnapshot(await api<Snapshot>(`/api/rooms/${code}/settings`, { method: "POST", token, body: JSON.stringify(input) })); } catch (error) { setNotice(error instanceof Error ? error.message : "Room settings could not be updated."); } }
  async function removeMember(memberId: string, displayName: string) { if (!token || !window.confirm(`Remove ${displayName} from this room?`)) return; try { setSnapshot(await api<Snapshot>(`/api/rooms/${code}/members/${memberId}`, { method: "DELETE", token })); } catch (error) { setNotice(error instanceof Error ? error.message : "That member could not be removed."); } }
  async function endRoom() { if (!token || !window.confirm("End this room for everyone?")) return; try { await api(`/api/rooms/${code}`, { method: "DELETE", token }); navigate("/"); } catch (error) { setNotice(error instanceof Error ? error.message : "The room could not be ended."); } }
  async function copyInvite() { await navigator.clipboard?.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }

  if (loading) return <div className="room-loading"><div className="loading-mark"><Film size={22} /></div><p>Opening the screening room…</p></div>;
  if (!snapshot && roomError) return <div className="join-screen"><Link href="/" className="back-link"><ArrowLeft size={16} /> Back to Movie Watcher</Link><div className="join-card"><div className="eyebrow">/ Room {code}</div><h1>One more thing<br /><em>before the opening scene.</em></h1><p>{roomError}</p><label>Your guest name<input autoFocus value={joinName} onChange={event => setJoinName(event.target.value)} placeholder="e.g. Ria" /></label><label>Room password <span className="label-optional">if there is one</span><input type="password" value={joinPassword} onChange={event => setJoinPassword(event.target.value)} placeholder="Optional" /></label><button className="button button-primary" disabled={busy} onClick={join}>{busy ? "Joining…" : "Join the room"}<ArrowLeft className="rotate-180" size={16} /></button><small><Shield size={13} /> Guest access is temporary and scoped to this room.</small></div></div>;
  if (!snapshot) return <div className="room-loading"><p>Room state is unavailable. Please refresh the invite.</p></div>;

  const movie = snapshot.movie;
  const isDirect = movie?.source === "direct";
  return <main className="room-shell">
    <header className="room-header"><div className="room-header-left"><Link className="room-back" href="/"><ArrowLeft size={17} /></Link><a className="wordmark" href="/"><span className="wordmark-mark"><Film size={15} /></span><span>movie watcher</span></a><span className="header-divider" /><span className="room-label">Room <strong>{code}</strong></span></div><div className="room-header-right"><span className="secure-pill"><span className="live-dot" /> {snapshot.members.length}/{snapshot.maxMembers} in room</span><button className="icon-button" onClick={copyInvite} title="Copy invite link">{copied ? <Check size={17} /> : <Copy size={17} />}</button><button className="icon-button" onClick={() => setShowSettings(true)} title="Room settings"><Settings size={17} /></button></div></header>
    <div className="room-layout">
      <section className="player-column"><div className={`player-frame ${movie ? "has-movie" : "empty-player"}`}>{movie && isDirect && <video ref={videoRef} src={movie.playerUrl ?? undefined} poster={movie.posterUrl ?? undefined} playsInline controls={false} onPlay={() => !applyingRemote.current && void playback("play")} onPause={() => !applyingRemote.current && void playback("pause")} onSeeked={() => !applyingRemote.current && void playback("seek")} onClick={() => canControl && void playback(videoRef.current?.paused ? "play" : "pause")} />}{movie && !isDirect && movie.playerUrl && <iframe ref={iframeRef} title={movie.title} src={movie.source === "youtube" ? `${movie.playerUrl}&origin=${encodeURIComponent(window.location.origin)}` : movie.playerUrl} referrerPolicy="strict-origin-when-cross-origin" onLoad={() => syncEmbed(snapshot.isPlaying ? "play" : "pause", snapshot.currentPosition)} allow="autoplay; fullscreen; picture-in-picture; web-share" allowFullScreen sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-same-origin allow-scripts" />}{!movie && <div className="empty-player-content"><div className="empty-reel"><Film size={25} /></div><div className="eyebrow">/ The screen is yours</div><h2>What are we watching?</h2><p>Add an official embed or an authorized video file to start the room.</p><button className="button button-primary" onClick={() => setShowSettings(true)}>Add a movie <ArrowRightIcon /></button></div>}{movie && <div className="player-overlay"><span className="sync-badge"><span className="pulse-dot" /> {snapshot.isPlaying ? "Playing in sync" : "Paused for everyone"}</span>{!canControl && <span className="host-note"><Lock size={13} /> Host controls playback</span>}</div>}</div><div className="player-meta"><div><div className="eyebrow">/ Now screening · {movie?.sourceLabel ?? "Waiting for a source"}</div><h1>{movie?.title ?? "Choose a movie for the room"}</h1><p>{movie ? "The room is ready. Send the invite, then press play when everyone is in." : "Your room exists. Add a supported source from room settings to make it a screening."}</p></div><div className="player-meta-actions">{movie?.source === "youtube" && <a className="external-source-link" href={movie.originalUrl} target="_blank" rel="noreferrer">Open on YouTube <ExternalLink size={13} /></a>}{movie && <><button className="round-control" disabled={!canControl} onClick={() => void playback("seek", Math.max(0, (videoRef.current?.currentTime ?? snapshot.currentPosition) - 10))}><SkipBack size={16} /></button><button className="play-control" disabled={!canControl} onClick={togglePlayback}>{snapshot.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button><button className="round-control" disabled={!canControl} onClick={() => void playback("seek", (videoRef.current?.currentTime ?? snapshot.currentPosition) + 10)}><SkipForward size={16} /></button></>}</div></div></section>
      <aside className="social-rail"><div className="rail-section members-section"><div className="rail-heading"><span><Users size={15} /> People here</span><span className="count-badge">{snapshot.members.length}</span></div><div className="member-list">{snapshot.members.map(member => <div className="member-row" key={member.id}><span className="avatar" style={{ background: member.avatarColor }}>{member.displayName.slice(0, 1).toUpperCase()}</span><span className="member-name"><strong>{member.displayName}{member.isHost && <span className="host-badge">HOST</span>}</strong><small><span className={`status-dot ${member.online ? "online" : "offline"}`} /> {member.online ? "Online now" : "Away"}</small></span>{member.isHost ? <Sparkles size={13} className="host-spark" /> : me?.isHost ? <button className="member-remove" onClick={() => void removeMember(member.id, member.displayName)} aria-label={`Remove ${member.displayName}`}><X size={13} /></button> : <MoreHorizontal size={16} className="member-menu" />}</div>)}</div></div><div className="rail-section chat-section"><div className="rail-heading"><span><MessageCircle size={15} /> Room chat</span><span className="chat-live"><span className="pulse-dot" /> live</span></div><div className="chat-list">{snapshot.messages.length === 0 && <div className="chat-empty"><MessageCircle size={20} /><p>Nothing here yet.<br /><strong>Say the first thing.</strong></p></div>}{snapshot.messages.map(item => <div className="chat-item" key={item.id}><div className="chat-item-top"><strong>{item.displayName}</strong><time>{displayDate(item.createdAt)}</time></div><p>{item.message}</p></div>)}</div><form className="chat-form" onSubmit={event => { event.preventDefault(); void sendMessage(); }}><input value={message} onChange={event => setMessage(event.target.value)} placeholder="Say something…" maxLength={500} /><button type="submit" aria-label="Send message"><Send size={16} /></button></form></div></aside>
    </div>
    {notice && <div className="notice-toast"><CircleHelp size={16} /> {notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
    {showSettings && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="settings-modal"><button className="modal-close" onClick={() => setShowSettings(false)}><X size={18} /></button><div className="eyebrow">/ Room settings</div><h2>Keep the room<br /><em>in your hands.</em></h2><p>Change the source or tune the room without leaving the screening.</p><label>Movie or video URL<input value={movieUrl} onChange={event => setMovieUrl(event.target.value)} placeholder="Paste an official embed or authorized video URL" /></label><button className="button button-primary full-button" disabled={busy || !movieUrl.trim()} onClick={() => void addMovie()}>Add supported source <Link2 size={16} /></button><div className="settings-divider" /><div className="setting-row"><div><strong>Host controls only</strong><small>Only you can play, pause, or seek.</small></div><button className={`toggle ${snapshot.hostControlsOnly ? "active" : ""}`} onClick={() => void setting({ hostControlsOnly: !snapshot.hostControlsOnly })}><span /></button></div><div className="setting-row"><div><strong>Lock the room</strong><small>Stop new people from joining.</small></div><button className={`toggle ${snapshot.isLocked ? "active" : ""}`} onClick={() => void setting({ isLocked: !snapshot.isLocked })}><span /></button></div><div className="settings-divider" /><button className="danger-link" onClick={() => void endRoom()}><LogOut size={15} /> End room for everyone</button><div className="modal-footnote"><Shield size={14} /> Supported sources only · no DRM or paywall bypasses</div></div></div>}
  </main>;
}

function ArrowRightIcon() { return <span className="inline-arrow">→</span>; }
