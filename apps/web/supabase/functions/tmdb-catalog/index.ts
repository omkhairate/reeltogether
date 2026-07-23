const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const genreIds: Record<string, number> = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80,
  Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36,
  Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749,
  "Sci-Fi": 878, Thriller: 53, War: 10752, Western: 37,
};

const tvGenreIds: Record<string, number> = {
  Action: 10759, Adventure: 10759, Animation: 16, Comedy: 35, Crime: 80,
  Documentary: 99, Drama: 18, Family: 10751, Mystery: 9648,
  "Sci-Fi": 10765, Fantasy: 10765, War: 10768, Western: 37,
};

const languageCodes: Record<string, string> = {
  English: "en", Hindi: "hi", Spanish: "es", French: "fr", German: "de",
  Italian: "it", Japanese: "ja", Korean: "ko", Mandarin: "zh",
  Portuguese: "pt", Tamil: "ta", Telugu: "te", Marathi: "mr",
};

type Filters = {
  genres?: string[];
  languages?: string[];
  providers?: string[];
  mediaKinds?: Array<"movie" | "show">;
  region?: string;
};

async function tmdb(path: string, token: string) {
  const response = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`TMDB returned ${response.status}`);
  return response.json();
}

function year(value?: string) {
  return value ? Number(value.slice(0, 4)) || new Date().getFullYear() : new Date().getFullYear();
}

function runtimeLabel(minutes: number | undefined, seasons: number | undefined) {
  if (seasons) return `${seasons} season${seasons === 1 ? "" : "s"}`;
  if (!minutes) return "Runtime unavailable";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = Deno.env.get("TMDB_ACCESS_TOKEN");
    if (!token) throw new Error("TMDB_ACCESS_TOKEN is not configured");
    const { page = 1, filters = {} } = await request.json() as { page?: number; filters?: Filters };
    const region = (filters.region || "US").toUpperCase();
    const kinds = filters.mediaKinds?.length ? filters.mediaKinds : ["movie", "show"];

    const providerLists = await Promise.all(kinds.map((kind) =>
      tmdb(`/watch/providers/${kind === "show" ? "tv" : "movie"}?watch_region=${region}&language=en-US`, token)
    ));
    const wantedProviderIds = providerLists.flatMap((payload) => payload.results ?? [])
      .filter((provider) => filters.providers?.includes(provider.provider_name))
      .map((provider) => provider.provider_id);

    const discoveries = await Promise.all(kinds.map(async (kind) => {
      const params = new URLSearchParams({
        include_adult: "false", language: "en-US", page: String(Math.max(1, Math.min(page, 500))),
        sort_by: "popularity.desc", "vote_count.gte": "40", watch_region: region,
      });
      const genreMap = kind === "show" ? tvGenreIds : genreIds;
      const genres = filters.genres?.map((name) => genreMap[name]).filter(Boolean) ?? [];
      if (genres.length) params.set("with_genres", genres.join("|"));
      const languages = filters.languages?.map((name) => languageCodes[name]).filter(Boolean) ?? [];
      if (languages.length) params.set("with_original_language", languages.join("|"));
      if (wantedProviderIds.length) {
        params.set("with_watch_providers", [...new Set(wantedProviderIds)].join("|"));
        params.set("with_watch_monetization_types", "flatrate|free|ads");
      }
      const endpoint = kind === "show" ? "tv" : "movie";
      const result = await tmdb(`/discover/${endpoint}?${params}`, token);
      return { kind, result };
    }));

    const candidates = discoveries.flatMap(({ kind, result }) =>
      (result.results ?? []).slice(0, 12).map((entry) => ({ kind, entry })),
    );
    const detailed = await Promise.all(candidates.map(async ({ kind, entry }) => {
      const endpoint = kind === "show" ? "tv" : "movie";
      const detail = await tmdb(`/${endpoint}/${entry.id}?language=en-US&append_to_response=watch/providers`, token);
      const availability = detail["watch/providers"]?.results?.[region];
      const providerRows = [
        ...(availability?.flatrate ?? []),
        ...(availability?.free ?? []),
        ...(availability?.ads ?? []),
      ];
      const providers = [...new Set(providerRows.map((provider) => provider.provider_name))];
      const providerLogos = Object.fromEntries(providerRows.map((provider) => [
        provider.provider_name,
        `https://image.tmdb.org/t/p/w92${provider.logo_path}`,
      ]));
      return {
        id: `tmdb-${kind}-${detail.id}`,
        tmdbId: detail.id,
        kind: kind === "show" ? "show" : "movie",
        title: detail.title ?? detail.name,
        year: year(detail.release_date ?? detail.first_air_date),
        runtime: runtimeLabel(detail.runtime ?? detail.episode_run_time?.[0], detail.number_of_seasons),
        rating: Math.round((detail.vote_average ?? 0) * 10) / 10,
        genres: (detail.genres ?? []).map((genre) => genre.name.replace("Science Fiction", "Sci-Fi")),
        language: new Intl.DisplayNames(["en"], { type: "language" }).of(detail.original_language) ?? detail.original_language,
        providers,
        providerLogos,
        watchLink: availability?.link,
        image: detail.poster_path ? `https://image.tmdb.org/t/p/w780${detail.poster_path}` : "",
        summary: detail.overview || "No summary is available yet.",
      };
    }));

    const items = detailed.filter((item) => item.image && (!filters.providers?.length || item.providers.some((name) => filters.providers?.includes(name))));
    const hasMore = discoveries.some(({ result }) => page < Math.min(result.total_pages ?? 1, 500));
    return Response.json({ items, hasMore }, { headers: { ...corsHeaders, "Cache-Control": "public, max-age=900" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Catalogue unavailable" }, { status: 500, headers: corsHeaders });
  }
});
