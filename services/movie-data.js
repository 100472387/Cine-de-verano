import { fetchWithTimeout } from "../utils.js";

export const FALLBACK_POSTER = "https://images.unsplash.com/photo-1485846234645-a62644f84728";

const OMDB_API_KEY = "8b02fcfe";
const movieCache = new Map();

export async function fetchMovieData(title) {
  const cacheKey = String(title || "").trim().toLowerCase();
  if (cacheKey && movieCache.has(cacheKey)) return movieCache.get(cacheKey);

  const fallback = { img: FALLBACK_POSTER, rating: null };
  try {
    const response = await fetchWithTimeout(
      `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(title)}`,
      {},
      8000
    );
    const data = await response.json();
    const result = data.Response === "True"
      ? {
          img: data.Poster && data.Poster !== "N/A" ? data.Poster : FALLBACK_POSTER,
          rating: data.imdbRating && data.imdbRating !== "N/A" ? data.imdbRating : null
        }
      : fallback;

    if (cacheKey) movieCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("OMDb error", error);
    return fallback;
  }
}
