import { detectMovieSource } from "@shared/source";

export function detectEmbedSource(url: string) {
  const metadata = detectMovieSource(url);
  return metadata.source !== "direct" && metadata.source !== "unsupported" ? metadata : null;
}
