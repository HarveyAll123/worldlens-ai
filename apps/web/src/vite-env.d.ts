/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** MapTiler key for satellite imagery + terrain (browser key; restrict by HTTP referrer). */
  readonly VITE_MAPTILER_API_KEY?: string;
  /** Base URL of the WorldLens API. Empty = same origin (/api, proxied in development). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const CESIUM_BASE_URL: string;
