/**
 * Single source of truth for the base-map tiles used by every map in the app.
 *
 * `VITE_MAP_TILE_URL` is defined in `.env`. The default is the public
 * OpenStreetMap tile server, which requires no API key. If a deployment points
 * this at a provider that needs credentials (Mapbox, MapTiler, Google, ...)
 * the key must be supplied by that provider through the URL itself - this app
 * does not ship or proxy any third-party API key.
 */
const configured = (import.meta.env.VITE_MAP_TILE_URL as string | undefined)?.trim();

export const MAP_TILE_URL =
  configured && configured.length > 0 ? configured : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
