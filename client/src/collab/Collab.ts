import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { Portal, BroadcastedExcalidrawElement } from "./Portal";
import { reconcileElements } from "./reconcile";
import { getSceneVersion } from "../data/sceneUtils";
import {
  saveScene,
  loadScene,
  saveFiles,
  loadFiles,
  createRoom,
  isSceneSaved,
} from "../data/dropbox";
import { DropboxSyncManager } from "../data/dropboxSync";
import { COLLAB_SAVE_THROTTLE_MS } from "../constants";
import { generateEncryptionKey } from "../data/encryption";

export interface CollabState {
  isCollaborating: boolean;
  roomId: string | null;
  roomKey: string | null;
  collaborators: string[];
}

export class Collab {
  portal: Portal;
  private syncManager: DropboxSyncManager | null = null;
  private excalidrawAPI: ExcalidrawImperativeAPI | null = null;
  private username: string = "Anonymous";
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSaveVersion = 0;

  state: CollabState = {
    isCollaborating: false,
    roomId: null,
    roomKey: null,
    collaborators: [],
  };

  private onStateChange: ((state: CollabState) => void) | null = null;

  constructor() {
    this.portal = new Portal();
  }

  setExcalidrawAPI(api: ExcalidrawImperativeAPI): void {
    this.excalidrawAPI = api;
  }

  setUsername(username: string): void {
    this.username = username;
  }

  setOnStateChange(cb: (state: CollabState) => void): void {
    this.onStateChange = cb;
  }

  private updateState(partial: Partial<CollabState>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange?.(this.state);
  }

  async createRoom(): Promise<{ roomId: string; roomKey: string }> {
    const roomId = generateRoomId();
    const roomKey = await generateEncryptionKey();

    // Create Dropbox folder
    await createRoom(roomId);

    return { roomId, roomKey };
  }

  async startSession(roomId: string, roomKey: string): Promise<void> {
    // Connect WebSocket
    await this.portal.open(roomId, roomKey, this.username);

    // Set up WebSocket handlers
    this.portal.onSceneData = (elements) => {
      this.handleRemoteSceneUpdate(elements);
    };

    this.portal.onUserChange = (usernames) => {
      this.updateState({ collaborators: usernames });
    };

    // Load existing scene from Dropbox
    try {
      const loaded = await loadScene(roomId, roomKey);
      if (loaded && this.excalidrawAPI) {
        const localElements = this.excalidrawAPI.getSceneElements();
        const appState = this.excalidrawAPI.getAppState();
        const merged = reconcileElements(
          localElements,
          loaded.elements,
          appState,
        );
        this.excalidrawAPI.updateScene({ elements: merged });

        // Load files
        const fileIds = this.getFileIdsFromElements(merged);
        if (fileIds.length > 0) {
          const files = await loadFiles(roomId, roomKey, fileIds);
          if (files.size > 0) {
            const filesObj: Record<string, BinaryFileData> = {};
            for (const [id, data] of files) {
              filesObj[id] = data;
            }
            this.excalidrawAPI.addFiles(Object.values(filesObj));
          }
        }
      }
    } catch (err) {
      console.error("Failed to load scene from Dropbox:", err);
    }

    // Start Dropbox long-poll sync
    this.syncManager = new DropboxSyncManager(
      roomId,
      roomKey,
      (elements) => this.handleRemoteSceneUpdate(elements),
      () => this.excalidrawAPI?.getSceneElements() ?? [],
      () => this.excalidrawAPI?.getAppState() ?? ({} as Partial<AppState>),
    );
    this.syncManager.start();

    this.updateState({
      isCollaborating: true,
      roomId,
      roomKey,
    });
  }

  stopSession(): void {
    // Flush pending save
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    this.portal.close();
    this.syncManager?.stop();
    this.syncManager = null;

    this.updateState({
      isCollaborating: false,
      roomId: null,
      roomKey: null,
      collaborators: [],
    });
  }

  syncElements(elements: readonly ExcalidrawElement[]): void {
    if (!this.state.isCollaborating) return;

    // Broadcast via WebSocket immediately
    this.portal.broadcastScene(elements);

    // Throttled save to Dropbox
    this.scheduleSave(elements);
  }

  private scheduleSave(elements: readonly ExcalidrawElement[]): void {
    const version = getSceneVersion(elements);
    if (version === this.lastSaveVersion) return;

    if (this.saveTimer) clearTimeout(this.saveTimer);

    this.saveTimer = setTimeout(async () => {
      if (
        !this.state.roomId ||
        !this.state.roomKey ||
        isSceneSaved(elements)
      ) {
        return;
      }

      try {
        const appState = this.excalidrawAPI?.getAppState() ?? {};
        await saveScene(
          this.state.roomId,
          this.state.roomKey,
          elements,
          appState,
        );
        this.lastSaveVersion = getSceneVersion(elements);
      } catch (err) {
        console.error("Failed to save scene to Dropbox:", err);
      }
    }, COLLAB_SAVE_THROTTLE_MS);
  }

  syncFiles(files: Map<string, BinaryFileData>): void {
    if (
      !this.state.isCollaborating ||
      !this.state.roomId ||
      !this.state.roomKey
    ) {
      return;
    }

    saveFiles(this.state.roomId, this.state.roomKey, files).catch((err) => {
      console.error("Failed to save files to Dropbox:", err);
    });
  }

  broadcastCursor(data: {
    pointer: { x: number; y: number };
    button: string;
    selectedElementIds: Record<string, boolean>;
  }): void {
    this.portal.broadcastMouseLocation({
      ...data,
      username: this.username,
    });
  }

  private handleRemoteSceneUpdate(
    remoteElements: BroadcastedExcalidrawElement[],
  ): void {
    if (!this.excalidrawAPI) return;

    const localElements = this.excalidrawAPI.getSceneElements();
    const appState = this.excalidrawAPI.getAppState();

    const merged = reconcileElements(
      localElements,
      remoteElements as unknown as ExcalidrawElement[],
      appState,
    );

    this.excalidrawAPI.updateScene({ elements: merged });
  }

  private getFileIdsFromElements(
    elements: readonly ExcalidrawElement[],
  ): string[] {
    const fileIds = new Set<string>();
    for (const el of elements) {
      if ("fileId" in el && (el as any).fileId) {
        fileIds.add((el as any).fileId);
      }
    }
    return Array.from(fileIds);
  }
}

function generateRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
