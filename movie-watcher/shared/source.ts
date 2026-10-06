export type MovieSource = "youtube" | "vimeo" | "dailymotion" | "wistia" | "loom" | "streamable" | "archive" | "direct" | "unsupported";

export type MovieMetadata = {
  source: MovieSource;
  sourceLabel: string;
  originalUrl: string;
  playerUrl: string | null;
  title: string;
  posterUrl: string | null;
  durationSeconds: number | null;
};

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const DAILYMOTION_HOSTS = new Set(["dailymotion.com", "www.dailymotion.com", "dai.ly"]);
const WISTIA_HOSTS = new Set(["wistia.com", "www.wistia.com", "support.wistia.com", "wi.st", "fast.wistia.net"]);
const LOOM_HOSTS = new Set(["loom.com", "www.loom.com"]);
const STREAMABLE_HOSTS = new Set(["streamable.com", "www.streamable.com"]);
const ARCHIVE_HOSTS = new Set(["archive.org", "www.archive.org"]);

function hostOf(url: URL) {
  return url.hostname.toLowerCase().replace(/^www\./, "www.");
}

function readableTitle(url: URL) {
  const fromPath = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .trim();
  return fromPath ? fromPath.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Untitled screening";
}

function unsupported(rawUrl: string): MovieMetadata {
  return { source: "unsupported", sourceLabel: "Unsupported source", originalUrl: rawUrl, playerUrl: null, title: "Unsupported source", posterUrl: null, durationSeconds: null };
}

function isDirectVideoPath(pathname: string) {
  return /\.(mp4|webm|ogg|mov|m4v|m3u8)$/i.test(pathname);
}

function embed(source: MovieSource, sourceLabel: string, rawUrl: string, playerUrl: string, title: string) {
  return { source, sourceLabel, originalUrl: rawUrl, playerUrl, title, posterUrl: null, durationSeconds: null } satisfies MovieMetadata;
}

export function detectMovieSource(rawUrl: string): MovieMetadata {
  const trimmed = rawUrl.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return unsupported(trimmed);
  }

  if (!["https:", "http:"].includes(url.protocol) || (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname))) return unsupported(trimmed);

  const normalizedHost = hostOf(url);
  if (YOUTUBE_HOSTS.has(normalizedHost)) {
    const id = url.hostname.includes("youtu.be") ? url.pathname.slice(1) : url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).pop();
    if (id && /^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
      return { source: "youtube", sourceLabel: "YouTube embed", originalUrl: trimmed, playerUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1`, title: readableTitle(url), posterUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, durationSeconds: null };
    }
  }

  if (VIMEO_HOSTS.has(normalizedHost)) {
    const id = url.pathname.split("/").filter(Boolean).pop();
    if (id && /^\d{5,14}$/.test(id)) return embed("vimeo", "Vimeo embed", trimmed, `https://player.vimeo.com/video/${id}?dnt=1&title=0&byline=0&portrait=0`, readableTitle(url));
  }

  if (DAILYMOTION_HOSTS.has(normalizedHost)) {
    const id = url.pathname.split("/").filter(Boolean).pop();
    if (id && /^x[a-z0-9]+$/i.test(id)) return embed("dailymotion", "Dailymotion embed", trimmed, `https://www.dailymotion.com/embed/video/${id}`, readableTitle(url));
  }

  if (WISTIA_HOSTS.has(normalizedHost)) {
    const match = url.pathname.match(/(?:medias|iframe|embed)\/([^/]+)/i);
    const id = match?.[1];
    if (id && /^[a-z0-9]+$/i.test(id)) return embed("wistia", "Wistia embed", trimmed, `https://fast.wistia.net/embed/iframe/${id}?seo=true&videoFoam=true`, readableTitle(url));
  }

  if (LOOM_HOSTS.has(normalizedHost)) {
    const match = url.pathname.match(/\/(?:share|embed)\/([^/]+)/i);
    const id = match?.[1];
    if (id && /^[a-z0-9-]{8,}$/i.test(id)) return embed("loom", "Loom embed", trimmed, `https://www.loom.com/embed/${id}`, readableTitle(url));
  }

  if (STREAMABLE_HOSTS.has(normalizedHost)) {
    const id = url.pathname.split("/").filter(Boolean).pop();
    if (id && /^[a-z0-9]+$/i.test(id)) return embed("streamable", "Streamable embed", trimmed, `https://streamable.com/e/${id}`, readableTitle(url));
  }

  if (ARCHIVE_HOSTS.has(normalizedHost)) {
    const match = url.pathname.match(/\/(?:details|embed)\/([^/]+)/i);
    const id = match?.[1];
    if (id && /^[a-z0-9._-]+$/i.test(id)) return embed("archive", "Internet Archive embed", trimmed, `https://archive.org/embed/${id}`, readableTitle(url));
  }

  if (isDirectVideoPath(url.pathname)) return { source: "direct", sourceLabel: "Direct video file", originalUrl: trimmed, playerUrl: trimmed, title: readableTitle(url), posterUrl: null, durationSeconds: null };
  return unsupported(trimmed);
}
