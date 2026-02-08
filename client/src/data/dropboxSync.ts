import { getDropbox } from "./dropboxClient";
import { loadScene, getRoomFolderCursor } from "./dropbox";
import { reconcileElements } from "../collab/reconcile";
import { SYNC_POLL_TIMEOUT_S } from "../constants";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

type OnSyncCallback = (elements: ExcalidrawElement[]) => void;

export class DropboxSyncManager {
  private roomId: string;
  private roomKey: string;
  private cursor: string | null = null;
  private running = false;
  private abortController: AbortController | null = null;
  private onSync: OnSyncCallback;
  private getLocalElements: () => readonly ExcalidrawElement[];
  private getAppState: () => Partial<AppState>;

  constructor(
    roomId: string,
    roomKey: string,
    onSync: OnSyncCallback,
    getLocalElements: () => readonly ExcalidrawElement[],
    getAppState: () => Partial<AppState>,
  ) {
    this.roomId = roomId;
    this.roomKey = roomKey;
    this.onSync = onSync;
    this.getLocalElements = getLocalElements;
    this.getAppState = getAppState;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Get initial cursor
    try {
      this.cursor = await getRoomFolderCursor(this.roomId);
    } catch (err) {
      console.error("Failed to get initial cursor:", err);
      this.running = false;
      return;
    }

    this.poll();
  }

  stop(): void {
    this.running = false;
    this.abortController?.abort();
    this.abortController = null;
  }

  private async poll(): Promise<void> {
    while (this.running && this.cursor) {
      try {
        this.abortController = new AbortController();

        // Long-poll for changes
        const dbx = getDropbox();
        const result = await dbx.filesListFolderLongpoll({
          cursor: this.cursor,
          timeout: SYNC_POLL_TIMEOUT_S,
        });

        if (!this.running) break;

        if (result.result.changes) {
          // Fetch the changes
          const listResult = await dbx.filesListFolderContinue({
            cursor: this.cursor,
          });
          this.cursor = listResult.result.cursor;

          // Check if scene.enc was modified
          const sceneChanged = listResult.result.entries.some(
            (entry) =>
              entry.path_lower?.endsWith("scene.enc") &&
              entry[".tag"] === "file",
          );

          if (sceneChanged) {
            const loaded = await loadScene(this.roomId, this.roomKey);
            if (loaded) {
              const localElements = this.getLocalElements();
              const appState = this.getAppState();
              const merged = reconcileElements(
                localElements,
                loaded.elements,
                appState,
              );
              this.onSync(merged);
            }
          }
        }

        // Backoff if specified
        if (result.result.backoff) {
          await this.sleep(result.result.backoff * 1000);
        }
      } catch (err: any) {
        if (!this.running) break;

        // If cursor is expired, get a new one
        if (err?.error?.error_summary?.includes("reset")) {
          try {
            this.cursor = await getRoomFolderCursor(this.roomId);
          } catch {
            // Give up on this cycle
          }
        }

        // Wait before retrying
        await this.sleep(5000);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
