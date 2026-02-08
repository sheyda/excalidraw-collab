export const WS_SERVER_URL =
  import.meta.env.VITE_WS_SERVER_URL ||
  (import.meta.env.DEV ? "http://localhost:3002" : window.location.origin);

export const SAVE_DEBOUNCE_MS = 300;
