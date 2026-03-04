/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_ADDRESS?: string;
  readonly VITE_PAYOUT_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
