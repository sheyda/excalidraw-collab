import { io, Socket } from "socket.io-client";
import { WS_SERVER_URL } from "../constants";
import { encryptData, decryptData } from "../data/encryption";

export type BroadcastedExcalidrawElement = {
  id: string;
  version: number;
  versionNonce: number;
  [key: string]: any;
};

export class Portal {
  socket: Socket | null = null;
  roomId: string | null = null;
  roomKey: string | null = null;

  onSceneData: ((data: BroadcastedExcalidrawElement[]) => void) | null = null;
  onUserChange: ((usernames: string[]) => void) | null = null;
  onIdleState:
    | ((data: { socketId: string; isIdle: boolean }) => void)
    | null = null;
  onUserFollow: ((payload: string) => void) | null = null;

  open(roomId: string, roomKey: string, username: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.roomId = roomId;
      this.roomKey = roomKey;

      this.socket = io(WS_SERVER_URL, {
        transports: ["websocket", "polling"],
        timeout: 10_000,
      });

      this.socket.once("connect_error", reject);

      this.socket.on("connect", () => {
        this.socket!.emit("init-room");
      });

      this.socket.once("init-room", () => {
        this.socket!.emit("join-room", roomId);
        // Announce username
        this.socket!.emit("room-user-change", username);
        resolve();
      });

      this.socket.on("first-in-room", () => {
        // We're the first — nothing to load from peers
      });

      this.socket.on("client-broadcast", async (data: ArrayBuffer) => {
        if (!this.roomKey || !this.onSceneData) return;
        try {
          const decrypted = await decryptData(this.roomKey, data);
          const json = new TextDecoder().decode(decrypted);
          const parsed = JSON.parse(json);

          if (parsed.type === "scene") {
            this.onSceneData(parsed.elements);
          }
        } catch (err) {
          console.error("Failed to decrypt broadcast:", err);
        }
      });

      this.socket.on("room-user-change", (usernames: string[]) => {
        this.onUserChange?.(usernames);
      });

      this.socket.on(
        "idle-state",
        (data: { socketId: string; isIdle: boolean }) => {
          this.onIdleState?.(data);
        },
      );

      this.socket.on("user-follow", (payload: string) => {
        this.onUserFollow?.(payload);
      });
    });
  }

  async broadcastScene(elements: readonly any[]): Promise<void> {
    if (!this.socket || !this.roomId || !this.roomKey) return;

    const payload = JSON.stringify({
      type: "scene",
      elements,
    });

    const encrypted = await encryptData(
      this.roomKey,
      new TextEncoder().encode(payload),
    );

    this.socket.emit("server-broadcast", this.roomId, encrypted);
  }

  async broadcastMouseLocation(data: {
    pointer: { x: number; y: number };
    button: string;
    username: string;
    selectedElementIds: Record<string, boolean>;
  }): Promise<void> {
    if (!this.socket || !this.roomId || !this.roomKey) return;

    const payload = JSON.stringify({
      type: "cursor",
      ...data,
      socketId: this.socket.id,
    });

    const encrypted = await encryptData(
      this.roomKey,
      new TextEncoder().encode(payload),
    );

    this.socket.volatile.emit(
      "server-volatile-broadcast",
      this.roomId,
      encrypted,
    );
  }

  broadcastIdleChange(isIdle: boolean): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit("idle-state", this.roomId, {
      socketId: this.socket.id,
      isIdle,
    });
  }

  close(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.roomId = null;
    this.roomKey = null;
    this.onSceneData = null;
    this.onUserChange = null;
    this.onIdleState = null;
    this.onUserFollow = null;
  }

  get isOpen(): boolean {
    return this.socket?.connected ?? false;
  }

  get socketId(): string | null {
    return this.socket?.id ?? null;
  }
}
