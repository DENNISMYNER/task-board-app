/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute origin of the API when it is not served from the same origin as the app. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
