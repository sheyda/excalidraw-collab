/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DROPBOX_CLIENT_ID: string;
  readonly VITE_DROPBOX_REDIRECT_URI: string;
  readonly VITE_WS_SERVER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
