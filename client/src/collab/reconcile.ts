import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import { reconcileElements as reconcile } from "../data/sceneUtils";

export function reconcileElements(
  localElements: readonly ExcalidrawElement[],
  remoteElements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
): ExcalidrawElement[] {
  return reconcile(localElements, remoteElements, appState);
}
