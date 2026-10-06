import { useState } from "react";
import { ArrowRight, Check, ChevronDown, Clapperboard, Copy, Film, Link2, LockKeyhole, MessageCircle, Play, Radio, Sparkles, Users, X } from "lucide-react";
import { useLocation } from "wouter";
import { api, storeToken } from "@/lib/api";

type RoomSnapshot = { code: string; members?: Array<{ id: string; displayName: string }> };
type DialogMode = "create" | "join" | null;

const features = [
  { icon: Users, eyebrow: "01 / Together", title: "Watch together", text: "A small, private room for the people you actually want to watch with." },
  { icon: Radio, eyebrow: "02 / In sync", title: "Perfect sync", text: "Play, pause, and seek with a quiet server clock keeping every screen close." },
  { icon: LockKeyhole, eyebrow: "03 / Private", title: "Your room, your rules", text: "Invite-only links, optional passwords, and host controls when you need them." },
  { icon: MessageCircle, eyebrow: "04 / In the moment", title: "Live chat", text: "React to the scene without leaving the screening. No feed, no noise." },
];

export default function Home() {
  const [, navigate] = useLocation();
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [password, setPassword] = useState("");
  const [movieUrl, setMovieUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function open(mode: DialogMode) { setError(""); setDialog(mode); }
  async function submit() {
    setError(""); setBusy(true);
    try {
      if (dialog === "create") {
        const result = await api<{ snapshot: RoomSnapshot; memberToken: string; memberId: string }>("/api/rooms", { method: "POST", body: JSON.stringify({ username, password, movieUrl }) });
        storeToken(result.snapshot.code, result.memberToken);
        localStorage.setItem(`movie-watcher:member-id:${result.snapshot.code}`, result.memberId);
        navigate(`/room/${result.snapshot.code}`);
      } else {
        const code = roomCode.trim().toUpperCase();
        const result = await api<{ snapshot: RoomSnapshot; memberToken: string; memberId: string }>(`/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ username, password }) });
        storeToken(result.snapshot.code, result.memberToken);
        localStorage.setItem(`movie-watcher:member-id:${result.snapshot.code}`, result.memberId);
        navigate(`/room/${result.snapshot.code}`);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not open the room."); }
    finally { setBusy(false); }
  }

  return (
    <main className="site-shell">
      <nav className="site-nav container-wide">
        <a className="wordmark" href="/" aria-label="Movie Watcher home"><span className="wordmark-mark"><Film size={16} strokeWidth={2.5} /></span><span>movie watcher</span></a>
        <div className="nav-links"><a href="#how-it-works">How it works</a><a href="#sources">Sources</a><a href="#faq">FAQ</a></div>
        <button className="nav-join" onClick={() => open("join")}>Join a room <ArrowRight size={16} /></button>
      </nav>

      <section className="hero container-wide">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> Private screening room / 01</div>
          <h1>Watch together.<br /><em>Stay synchronized.</em></h1>
          <p className="hero-lede">Send the link. We’ll handle the timing. Movie Watcher gives your small group one shared screen, one room, and a little more of the moment.</p>
          <div className="hero-actions"><button className="button button-primary" onClick={() => open("create")}>Create a room <ArrowRight size={17} /></button><button className="button button-quiet" onClick={() => open("join")}>Join with a code <Link2 size={17} /></button></div>
          <div className="hero-proof"><span><Check size={14} /> No account required</span><span><Check size={14} /> 3 people max</span><span><Check size={14} /> Authorized sources only</span></div>
        </div>
        <div className="hero-stage" aria-label="Movie Watcher room preview">
          <div className="hero-glow" />
          <div className="hero-film-frame">
            <div className="film-topline"><span><span className="pulse-dot" /> LIVE ROOM</span><span>MW / 0001</span></div>
            <div className="film-art"><div className="art-orbit art-orbit-one" /><div className="art-orbit art-orbit-two" /><div className="art-core"><Clapperboard size={34} /><span>watch / in sync</span></div><span className="art-caption">No one watches alone.</span></div>
            <div className="film-controls"><span className="control-play"><Play size={13} fill="currentColor" /></span><span className="control-line"><i /></span><span className="control-time">12:44 / 58:06</span><span className="control-volume">•••</span></div>
          </div>
          <div className="floating-card floating-members"><div className="avatar-stack"><span className="avatar avatar-lime">A</span><span className="avatar avatar-purple">R</span><span className="avatar avatar-blue">M</span></div><div><strong>3 in the room</strong><small>All screens synced</small></div></div>
          <div className="floating-card floating-chat"><span className="chat-spark">✦</span><div><strong>“That transition!”</strong><small>Ria · just now</small></div></div>
        </div>
      </section>

      <section className="marquee-strip"><div className="marquee-inner">PRIVATE ROOMS <span>✦</span> SHARED MOMENTS <span>✦</span> NO FEED. NO ADS. JUST THE FILM. <span>✦</span> PRIVATE ROOMS <span>✦</span> SHARED MOMENTS <span>✦</span></div></section>

      <section className="section container-wide" id="how-it-works">
        <div className="section-intro"><div><div className="eyebrow">/ The simple version</div><h2>One link between<br /><em>your people.</em></h2></div><p>Movie nights should feel like movie nights. Pick a source that allows embedding, make a room, and let the room take care of the rest.</p></div>
        <div className="feature-grid">{features.map(({ icon: Icon, eyebrow, title, text }) => <article className="feature-card" key={title}><span className="feature-icon"><Icon size={19} /></span><div className="eyebrow">{eyebrow}</div><h3>{title}</h3><p>{text}</p><span className="card-arrow"><ArrowRight size={15} /></span></article>)}</div>
      </section>

      <section className="source-section container-wide" id="sources"><div className="source-panel"><div className="source-copy"><div className="eyebrow">/ Source promise</div><h2>Good screens<br />need <em>good boundaries.</em></h2><p>Movie Watcher plays official embeds and direct files where they are authorized. It never bypasses DRM, paywalls, login walls, or a site’s embedding rules.</p><button className="text-link" onClick={() => open("create")}>Start with a supported source <ArrowRight size={16} /></button></div><div className="source-list"><div><span className="source-number">01</span><span><strong>Official embeds</strong><small>YouTube, Vimeo, and providers that allow their player to be embedded.</small></span><Check size={17} /></div><div><span className="source-number">02</span><span><strong>Direct video files</strong><small>MP4, WebM, and similar files you are authorized to play.</small></span><Check size={17} /></div><div><span className="source-number">03</span><span><strong>Clear fallbacks</strong><small>If a source cannot embed, we tell you plainly and point to the official source.</small></span><Check size={17} /></div></div></div></section>

      <section className="cta-section container-wide"><div className="cta-panel"><Sparkles size={22} /><div><div className="eyebrow">/ Make tonight a little better</div><h2>The room is waiting.</h2></div><button className="button button-primary" onClick={() => open("create")}>Create a room <ArrowRight size={17} /></button></div></section>

      <section className="faq-section container-wide" id="faq"><div className="section-intro"><div><div className="eyebrow">/ Good to know</div><h2>Questions before<br /><em>the opening scene?</em></h2></div><p>We keep the product small on purpose: a private room, a shared player, and the exact controls you need.</p></div><div className="faq-list"><details open><summary>Do guests need an account? <ChevronDown size={18} /></summary><p>No. A guest username is enough for a temporary room. Optional Manus login is kept architecture-ready for profiles and history later.</p></details><details><summary>What can I play? <ChevronDown size={18} /></summary><p>Officially embeddable providers and direct video files you are authorized to use. Unsupported or protected sources are never proxied or bypassed.</p></details><details><summary>How many people fit in one room? <ChevronDown size={18} /></summary><p>The default is three, including the host. The backend keeps capacity configurable for a future plan.</p></details></div></section>

      <footer className="site-footer container-wide"><a className="wordmark" href="/"><span className="wordmark-mark"><Film size={16} strokeWidth={2.5} /></span><span>movie watcher</span></a><span>Watch together. Stay human.</span><span>© {new Date().getFullYear()} Movie Watcher</span></footer>

      {dialog && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="room-modal"><button className="modal-close" onClick={() => setDialog(null)} aria-label="Close"><X size={18} /></button><div className="eyebrow">/ {dialog === "create" ? "New screening" : "Room invite"}</div><h2>{dialog === "create" ? "Make a room for your people." : "Pick up where the room left off."}</h2><p>{dialog === "create" ? "You’ll get a private link in a second. No account, no feed, no fuss." : "Enter the short code from your invite and choose the name your friends will see."}</p><label>Your guest name<input autoFocus value={username} onChange={event => setUsername(event.target.value)} placeholder="e.g. Aisha" maxLength={32} /></label>{dialog === "join" && <label>Room code<input value={roomCode} onChange={event => setRoomCode(event.target.value.toUpperCase())} placeholder="AB7K92" maxLength={8} /></label>}{dialog === "create" && <label>Movie URL <span className="label-optional">optional</span><input value={movieUrl} onChange={event => setMovieUrl(event.target.value)} placeholder="https://youtu.be/..." /></label>}<label>Room password <span className="label-optional">optional</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Only if you want one" maxLength={64} /></label>{error && <div className="form-error">{error}</div>}<button className="button button-primary modal-submit" disabled={busy} onClick={submit}>{busy ? "Opening…" : dialog === "create" ? "Open the room" : "Join the room"}<ArrowRight size={17} /></button><div className="modal-footnote"><LockKeyhole size={14} /> Temporary guest access · invite-only by default</div></div></div>}
    </main>
  );
}
