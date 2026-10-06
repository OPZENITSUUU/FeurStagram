import { detectMovieSource } from "@shared/source";

export function detectDirectVideoSource(url: string) {
  const metadata = detectMovieSource(url);
  return metadata.source === "direct" ? metadata : null;
}
