import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3002", 10);

const app = express();
const httpServer = createServer(app);

// Serve built client in production
if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve(__dirname, "../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
  maxHttpBufferSize: 10 * 1024 * 1024, // 10 MB
});

// Track rooms: roomId → Set of socket IDs
const rooms = new Map<string, Set<string>>();

// Track socket metadata: socketId → { roomId, username }
const socketMeta = new Map<
  string,
  { roomId: string; username: string | null }
>();

function getRoomUsernames(roomId: string): string[] {
  const sockets = rooms.get(roomId);
  if (!sockets) return [];
  const usernames: string[] = [];
  for (const sid of sockets) {
    const meta = socketMeta.get(sid);
    if (meta?.username) usernames.push(meta.username);
  }
  return usernames;
}

io.on("connection", (socket: Socket) => {
  // ── init-room: client asks to create/join a room ──
  socket.on("init-room", () => {
    // Acknowledged — client will next call join-room
    socket.emit("init-room");
  });

  // ── join-room: client joins a specific room ──
  socket.on("join-room", (roomId: string) => {
    // Leave any previous room
    const prev = socketMeta.get(socket.id);
    if (prev) {
      socket.leave(prev.roomId);
      rooms.get(prev.roomId)?.delete(socket.id);
    }

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId)!.add(socket.id);
    socketMeta.set(socket.id, { roomId, username: null });

    // Tell the joiner whether they are first
    const roomSize = rooms.get(roomId)!.size;
    if (roomSize <= 1) {
      socket.emit("first-in-room");
    } else {
      socket.broadcast.to(roomId).emit("new-user", socket.id);
    }

    // Broadcast updated user list
    io.to(roomId).emit("room-user-change", getRoomUsernames(roomId));
  });

  // ── server-broadcast: durable scene data ──
  socket.on(
    "server-broadcast",
    (roomId: string, data: ArrayBuffer, isVolatile?: boolean) => {
      if (isVolatile) {
        socket.volatile.broadcast.to(roomId).emit("client-broadcast", data);
      } else {
        socket.broadcast.to(roomId).emit("client-broadcast", data);
      }
    },
  );

  // ── server-volatile-broadcast: ephemeral data (cursors, etc.) ──
  socket.on(
    "server-volatile-broadcast",
    (roomId: string, data: ArrayBuffer) => {
      socket.volatile.broadcast.to(roomId).emit("client-broadcast", data);
    },
  );

  // ── user-follow: relay follow events ──
  socket.on("user-follow", (payload: string) => {
    const meta = socketMeta.get(socket.id);
    if (meta?.roomId) {
      socket.broadcast.to(meta.roomId).emit("user-follow", payload);
    }
  });

  // ── user-follow-room-change: follow room change ──
  socket.on(
    "user-follow-room-change",
    (roomId: string, payload: string) => {
      socket.broadcast.to(roomId).emit("user-follow-room-change", payload);
    },
  );

  // ── room-user-change: update username ──
  socket.on("room-user-change", (username: string) => {
    const meta = socketMeta.get(socket.id);
    if (meta) {
      meta.username = username;
      io.to(meta.roomId).emit(
        "room-user-change",
        getRoomUsernames(meta.roomId),
      );
    }
  });

  // ── idle-state: broadcast idle changes ──
  socket.on(
    "idle-state",
    (roomId: string, data: { odSocketId: string; isIdle: boolean }) => {
      socket.broadcast.to(roomId).emit("idle-state", data);
    },
  );

  // ── disconnecting ──
  socket.on("disconnecting", () => {
    const meta = socketMeta.get(socket.id);
    if (meta) {
      const roomSockets = rooms.get(meta.roomId);
      if (roomSockets) {
        roomSockets.delete(socket.id);
        if (roomSockets.size === 0) {
          rooms.delete(meta.roomId);
        } else {
          io.to(meta.roomId).emit(
            "room-user-change",
            getRoomUsernames(meta.roomId),
          );
        }
      }
      socketMeta.delete(socket.id);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[relay] WebSocket relay server listening on port ${PORT}`);
});
