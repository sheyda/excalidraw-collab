import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import { SAVE_DEBOUNCE_MS } from "../constants";

const ELEMENTS_KEY = "excalidraw-collab-local-elements";
const APP_STATE_KEY = "excalidraw-collab-local-appstate";

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function saveLocal(
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
): void {
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(ELEMENTS_KEY, JSON.stringify(elements));
      localStorage.setItem(
        APP_STATE_KEY,
        JSON.stringify(pickAppState(appState)),
      );
    } catch (err) {
      console.warn("Failed to save to localStorage:", err);
    }
  }, SAVE_DEBOUNCE_MS);
}

export function loadLocal(): {
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
} | null {
  try {
    const elementsRaw = localStorage.getItem(ELEMENTS_KEY);
    if (!elementsRaw) return null;

    const elements = JSON.parse(elementsRaw) as ExcalidrawElement[];
    const appStateRaw = localStorage.getItem(APP_STATE_KEY);
    const appState = appStateRaw ? JSON.parse(appStateRaw) : {};

    return { elements, appState };
  } catch {
    return null;
  }
}

export function clearLocal(): void {
  localStorage.removeItem(ELEMENTS_KEY);
  localStorage.removeItem(APP_STATE_KEY);
}

function pickAppState(appState: Partial<AppState>): Partial<AppState> {
  // Only persist UI-relevant state
  const {
    viewBackgroundColor,
    gridSize,
    scrollX,
    scrollY,
    zoom,
    theme,
  } = appState as any;
  return {
    viewBackgroundColor,
    gridSize,
    scrollX,
    scrollY,
    zoom,
    theme,
  } as Partial<AppState>;
}
