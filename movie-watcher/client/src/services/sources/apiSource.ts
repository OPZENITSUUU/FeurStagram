import type { MovieMetadata } from "@shared/source";

export type AuthorizedApiSource = { provider: string; url: string; metadata?: Partial<MovieMetadata> };

/** Future provider integrations belong here; protected pages are never fetched or proxied. */
export function createAuthorizedApiSource(input: AuthorizedApiSource): MovieMetadata | null {
  if (!input.url.startsWith("https://")) return null;
  return { source: "unsupported", sourceLabel: input.provider, originalUrl: input.url, playerUrl: null, title: input.metadata?.title ?? "Unsupported source", posterUrl: input.metadata?.posterUrl ?? null, durationSeconds: input.metadata?.durationSeconds ?? null };
}
