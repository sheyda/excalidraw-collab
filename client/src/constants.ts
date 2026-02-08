export const DROPBOX_CLIENT_ID = import.meta.env.VITE_DROPBOX_CLIENT_ID || "";
export const DROPBOX_REDIRECT_URI =
  import.meta.env.VITE_DROPBOX_REDIRECT_URI ||
  `${window.location.origin}/auth/callback`;
export const WS_SERVER_URL =
  import.meta.env.VITE_WS_SERVER_URL || "http://localhost:3002";

export const DROPBOX_APP_FOLDER = "/";
export const ROOMS_FOLDER = "rooms";

export const SAVE_DEBOUNCE_MS = 300;
export const COLLAB_SAVE_THROTTLE_MS = 20_000;
export const SYNC_POLL_TIMEOUT_S = 30;

export const ENCRYPTION_KEY_BITS = 128;

export const SCENE_VERSION_STORAGE_KEY = "excalidraw-dropbox-scene-version";
