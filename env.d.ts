/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HF_TOKEN: string;
  readonly VITE_ENDPOINT_URL: string; // optional if you want to use env for this too
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
