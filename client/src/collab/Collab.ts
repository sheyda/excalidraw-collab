import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Portal, BroadcastedExcalidrawElement } from "./Portal";
import { reconcileElements } from "./reconcile";

export interface CollabState {
  isCollaborating: boolean;
  roomId: string | null;
  roomKey: string | null;
  collaborators: string[];
}

export class Collab {
  portal: Portal;
  private excalidrawAPI: ExcalidrawImperativeAPI | null = null;
  private username: string = "Anonymous";

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

  createRoom(): { roomId: string; roomKey: string } {
    const roomId = generateRoomId();
    const roomKey = generateRoomKey();
    return { roomId, roomKey };
  }

  async startSession(roomId: string, roomKey: string): Promise<void> {
    await this.portal.open(roomId, roomKey, this.username);

    this.portal.onSceneData = (elements) => {
      this.handleRemoteSceneUpdate(elements);
    };

    this.portal.onUserChange = (usernames) => {
      this.updateState({ collaborators: usernames });
    };

    this.updateState({
      isCollaborating: true,
      roomId,
      roomKey,
    });
  }

  stopSession(): void {
    this.portal.close();

    this.updateState({
      isCollaborating: false,
      roomId: null,
      roomKey: null,
      collaborators: [],
    });
  }

  syncElements(elements: readonly ExcalidrawElement[]): void {
    if (!this.state.isCollaborating) return;
    this.portal.broadcastScene(elements);
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
}

function generateRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRoomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
