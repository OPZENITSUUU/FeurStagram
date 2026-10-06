# Movie Watcher — implementation plan

## Product direction
Movie Watcher is a private, low-friction watch room for 2–3 people. Guests can join with a username and no account; optional Manus OAuth remains the account-ready path for future profiles, history, and host transfer.

## Design system
- **Design movement:** Neo-noir cinema lounge — a dark editorial interface that feels like a premium screening room rather than a generic dashboard.
- **Core principles:** cinematic focus, calm control surfaces, visible room presence, and honest source handling.
- **Color philosophy:** graphite and near-black create a theater-like canvas; warm ivory keeps long-form copy legible; a singular ultraviolet-lime accent marks actions and sync state without turning the experience into gamer neon.
- **Layout paradigm:** asymmetric split-stage compositions: wide media stage on the left and a compact social rail on the right, collapsing into a deliberate vertical sequence on mobile.
- **Signature elements:** a split-film wordmark with a small play cutout, a luminous sync pulse that appears only around real-time state, and frosted panels with a faint diagonal grain.
- **Interaction philosophy:** controls are direct and low-noise. Actions confirm with small, purposeful feedback; drift correction is quiet unless the player needs attention.
- **Animation:** 180–280ms ease-out transitions for panels and button feedback; slow 18s ambient hero glow; no looping motion in the room that competes with video or chat. Respect reduced-motion preferences.
- **Typography:** Space Grotesk for display and UI labels; DM Sans for body copy and chat. Uppercase eyebrow labels carry tracking; headlines use tight display leading.
- **Brand essence:** “A private screening room for the people you actually want to watch with.” Personality: intimate, assured, cinematic.
- **Brand voice:** confident and warm, with short sentences. Example lines: “Send the link. We’ll handle the timing.” / “Only the room decides what plays next.”
- **Wordmark & logo:** “Movie Watcher” in a custom split-film lockup: the M carries a small play notch, paired with a rounded square containing two offset frames.
- **Signature brand color:** ultraviolet-lime `#D4FF45`, used sparingly for primary actions and verified sync.

## Implementation approach
1. Replace the template home with a responsive marketing/home experience: navigation, hero, feature stack, how-it-works, source safety callout, FAQ, and footer.
2. Add create/join room dialogs and dynamic `/room/:roomCode` routing. Rooms use short uppercase codes, a default capacity of three, a host token, optional password, lock state, and inactivity expiry.
3. Extend the managed MySQL-compatible Drizzle schema with rooms, room members, messages, and movie metadata. Keep guest members tokenized so an account is not required.
4. Add server-authoritative room procedures for create, join, read state, heartbeat, playback updates, movie source changes, messages, member removal, room settings, and end-room. Use strict zod validation and URL allowlisting.
5. Add an SSE room event stream backed by a process-local event bus for near-real-time updates in the current deployment, with client polling fallback through tRPC. Events carry server timestamps so clients can correct small playback drift without repeated large seeks.
6. Add a safe source adapter layer under `client/src/services/sources/` and `server/services/sources/`: YouTube/Vimeo official embeds, direct video files, and a deny-by-default unsupported result. Never proxy or fetch arbitrary private URLs server-side.
7. Build the watch room: video/iframe stage, movie metadata, sync badge, member presence, host controls, chat, room settings, invite copying, and mobile-first layout.
8. Keep optional Manus OAuth wiring intact and expose a clear guest state; do not require login for room access.
9. Add `public/manus-routes.json`, project logo metadata, deterministic migration, health endpoint coverage, and build/deploy configuration.

## Project structure
- `client/src/pages/`: Home and WatchRoom route screens.
- `client/src/components/`: reusable brand, modal, player, chat, member, and UI pieces.
- `client/src/services/sources/`: browser-safe URL detection and embed metadata.
- `server/services/`: room repository, authorization, source validation, and event bus.
- `drizzle/`: schema and additive migrations for rooms, members, messages.
- `shared/`: route-safe types, validation schemas, and event contracts.
- `public/`: route manifest and static metadata.
- `app.config.ts`: platform logo metadata.

## Material constraints
- Use the managed server/database already enabled for this project and keep all browser-visible values non-secret.
- Use guest room tokens for temporary rooms; keep Manus OAuth as the account-ready path.
- Playback may use only officially embeddable/authorized providers and direct video files. Unsupported sources must show the specified explanatory message and may offer the official source link.
- Default capacity is three, while schema/settings retain a configurable maximum for later expansion.
