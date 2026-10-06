export type MovieSource = "youtube" | "vimeo" | "direct" | "unsupported";

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

function isDirectVideoPath(pathname: string) {
  return /\.(mp4|webm|ogg|mov|m4v|m3u8)$/i.test(pathname);
}

export function detectMovieSource(rawUrl: string): MovieMetadata {
  const trimmed = rawUrl.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { source: "unsupported", sourceLabel: "Unsupported source", originalUrl: trimmed, playerUrl: null, title: "Unsupported source", posterUrl: null, durationSeconds: null };
  }

  if (!["https:", "http:"].includes(url.protocol) || (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname))) {
    return { source: "unsupported", sourceLabel: "Unsupported source", originalUrl: trimmed, playerUrl: null, title: "Unsupported source", posterUrl: null, durationSeconds: null };
  }

  const normalizedHost = hostOf(url);
  if (YOUTUBE_HOSTS.has(normalizedHost)) {
    const id = url.hostname.includes("youtu.be") ? url.pathname.slice(1) : url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).pop();
    if (id && /^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
      return {
        source: "youtube",
        sourceLabel: "YouTube embed",
        originalUrl: trimmed,
        playerUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1`,
        title: readableTitle(url),
        posterUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        durationSeconds: null,
      };
    }
  }

  if (VIMEO_HOSTS.has(normalizedHost)) {
    const id = url.pathname.split("/").filter(Boolean).pop();
    if (id && /^\d{5,14}$/.test(id)) {
      return {
        source: "vimeo",
        sourceLabel: "Vimeo embed",
        originalUrl: trimmed,
        playerUrl: `https://player.vimeo.com/video/${id}?dnt=1&title=0&byline=0&portrait=0`,
        title: readableTitle(url),
        posterUrl: null,
        durationSeconds: null,
      };
    }
  }

  if (isDirectVideoPath(url.pathname)) {
    return {
      source: "direct",
      sourceLabel: "Direct video file",
      originalUrl: trimmed,
      playerUrl: trimmed,
      title: readableTitle(url),
      posterUrl: null,
      durationSeconds: null,
    };
  }

  return { source: "unsupported", sourceLabel: "Unsupported source", originalUrl: trimmed, playerUrl: null, title: "Unsupported source", posterUrl: null, durationSeconds: null };
}
