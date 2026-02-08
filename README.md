# Excalidraw Collab

Real-time collaborative whiteboard built on `@excalidraw/excalidraw` with a bundled WebSocket relay server.

## Features

- Full Excalidraw drawing experience
- Real-time collaboration via WebSocket relay
- No account or sign-up required
- Solo mode with automatic localStorage persistence
- Save/load files using Excalidraw's built-in export (save to a shared Dropbox/Google Drive/OneDrive folder for persistence)

## For Users

### Drawing Solo

Open the app and start drawing. Your work auto-saves to the browser.

### Starting a Collaboration Session (Host)

1. Click the **Share** button (top-right)
2. Enter your name and click **Start session**
3. Copy the generated link and send it to collaborators

### Joining a Session (Collaborator)

1. Open the room link you received
2. You're in — changes sync in real-time

### Saving Your Work

Use the hamburger menu (top-left) to **Export** or **Save as image**. To keep a persistent copy, save the `.excalidraw` file to a shared cloud folder (Dropbox, Google Drive, etc.).

## For Developers

### Prerequisites

- Node.js 18+

### Install and Run

```bash
git clone https://github.com/<org>/excalidraw-collab
cd excalidraw-collab
npm install
npm run dev
```

This starts:
- **Client** on [http://localhost:5173](http://localhost:5173) (Vite with hot reload)
- **WebSocket relay** on port 3002

### Docker

```bash
docker compose up
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_WS_SERVER_URL` | WebSocket relay URL | `http://localhost:3002` |
| `PORT` | Relay server port | `3002` |

## Production Deployment

In production, the relay server serves both the built client and WebSocket connections on a single port.

### Render

1. Connect your GitHub repo on [render.com](https://render.com)
2. Create a **Web Service**
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Set `VITE_WS_SERVER_URL` to `wss://your-app.onrender.com`

### Docker (Self-Hosted)

```bash
docker build -t excalidraw-collab .
docker run -p 3002:3002 excalidraw-collab
```

### Vercel + Railway

- Deploy `client/` to **Vercel** (set root directory to `client`, framework to Vite)
- Deploy `server/` to **Railway** (set root directory to `server`)
- Set `VITE_WS_SERVER_URL` in Vercel to your Railway URL

## Architecture

```
┌────────────┐     WebSocket      ┌──────────────┐     WebSocket      ┌────────────┐
│  Browser A  │ ◄──────────────► │  Relay Server │ ◄──────────────► │  Browser B  │
└────────────┘                    └──────────────┘                    └────────────┘
```

The relay server is a lightweight Socket.IO server (~130 lines) that broadcasts drawing data between connected clients. No data is stored on the server.

## License

MIT
