import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFileData } from "@excalidraw/excalidraw/types";
import { getSceneVersion } from "./sceneUtils";
import { SAVE_DEBOUNCE_MS } from "../constants";

const ELEMENTS_KEY = "excalidraw-dropbox-local-elements";
const APP_STATE_KEY = "excalidraw-dropbox-local-appstate";
const FILES_KEY = "excalidraw-dropbox-local-files";

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

export function saveLocalFiles(files: Map<string, BinaryFileData>): void {
  try {
    const obj: Record<string, BinaryFileData> = {};
    for (const [id, data] of files) {
      obj[id] = data;
    }
    localStorage.setItem(FILES_KEY, JSON.stringify(obj));
  } catch (err) {
    console.warn("Failed to save files to localStorage:", err);
  }
}

export function loadLocalFiles(): Map<string, BinaryFileData> {
  try {
    const raw = localStorage.getItem(FILES_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, BinaryFileData>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

export function clearLocal(): void {
  localStorage.removeItem(ELEMENTS_KEY);
  localStorage.removeItem(APP_STATE_KEY);
  localStorage.removeItem(FILES_KEY);
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
