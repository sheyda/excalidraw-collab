// Thin wrappers around @excalidraw/excalidraw utilities.
// If an export isn't available, we provide a fallback implementation.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

// reconcileElements: merge local and remote elements
// The excalidraw package exports this from its utils
export function reconcileElements(
  localElements: readonly ExcalidrawElement[],
  remoteElements: readonly ExcalidrawElement[],
  _appState: Partial<AppState>,
): ExcalidrawElement[] {
  // Build a map of remote elements by ID
  const remoteMap = new Map<string, ExcalidrawElement>();
  for (const el of remoteElements) {
    remoteMap.set(el.id, el);
  }

  // Build a map of local elements by ID
  const localMap = new Map<string, ExcalidrawElement>();
  for (const el of localElements) {
    localMap.set(el.id, el);
  }

  const merged: ExcalidrawElement[] = [];
  const seen = new Set<string>();

  // Process local elements — keep the newer version
  for (const localEl of localElements) {
    seen.add(localEl.id);
    const remoteEl = remoteMap.get(localEl.id);
    if (!remoteEl) {
      merged.push(localEl);
    } else if (localEl.version >= remoteEl.version) {
      merged.push(localEl);
    } else {
      merged.push(remoteEl);
    }
  }

  // Add remote elements not in local
  for (const remoteEl of remoteElements) {
    if (!seen.has(remoteEl.id)) {
      merged.push(remoteEl);
    }
  }

  return merged;
}

// restoreElements: validate and normalize loaded elements
export function restoreElements(
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  // Basic validation — filter out malformed elements
  return elements.filter(
    (el) =>
      el &&
      typeof el.id === "string" &&
      typeof el.type === "string" &&
      typeof el.version === "number",
  ) as ExcalidrawElement[];
}

// getSceneVersion: compute a version number for the scene
export function getSceneVersion(
  elements: readonly ExcalidrawElement[],
): number {
  return elements.reduce((max, el) => Math.max(max, el.version || 0), 0);
}

// getNonDeletedElements: filter soft-deleted elements
export function getNonDeletedElements(
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  return elements.filter((el) => !el.isDeleted) as ExcalidrawElement[];
}
