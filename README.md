# Excalidraw + Dropbox

Standalone Dropbox-backed Excalidraw with real-time collaboration. No fork needed — built on top of `@excalidraw/excalidraw`.

## Features

- Full Excalidraw drawing experience
- Real-time collaboration via WebSocket relay
- Dropbox persistence with end-to-end encryption
- Solo mode works without sign-in (localStorage)
- Dropbox folder sharing for collaborator access
- Long-poll sync as safety net for reconnections

## For Developers

### Prerequisites

- Node.js 18+
- A free Dropbox account

### 1. Clone and Configure

```bash
git clone https://github.com/<org>/excalidraw-dropbox
cd excalidraw-dropbox
cp .env.example .env
```

### 2. Create a Dropbox App

You need a Dropbox App to get a Client ID. This is a one-time setup:

1. Go to [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) and sign in
2. Click **Create App**
3. Select **Scoped access**
4. Select **App folder** (this keeps files sandboxed under `/Apps/YourAppName/`)
5. Give it a name (e.g., `ExcalidrawDropbox`) and click **Create**

Then configure it:

6. On the **Settings** tab, copy the **App key** — this is your Client ID
7. On the **Settings** tab under **OAuth 2 > Redirect URIs**, add:
   ```
   http://localhost:5173/auth/callback
   ```
   (For production, also add your deployed URL, e.g. `https://your-app.com/auth/callback`)
8. Go to the **Permissions** tab and enable these scopes, then click **Submit**:
   - `account_info.read`
   - `files.metadata.read`
   - `files.content.read`
   - `files.content.write`
   - `sharing.read`
   - `sharing.write`
9. Paste the App key into your `.env` file:
   ```
   VITE_DROPBOX_CLIENT_ID=your_app_key_here
   ```

### 3. Install and Run

```bash
npm install
npm run dev
```

This starts two servers:
- **Client** on [http://localhost:5173](http://localhost:5173) (Vite dev server with hot reload)
- **WebSocket relay** on port 3002 (for real-time collaboration)

Open http://localhost:5173 and you're ready to draw.

### Docker

To run everything in a container:

```bash
# Edit .env with your VITE_DROPBOX_CLIENT_ID first
docker compose up
```

## For Users

No install required — just open the URL your host shares with you.

### Drawing Solo

Open the app in your browser and start drawing. Everything saves to your browser automatically. No account needed.

### Starting a Collaboration Session (Host)

1. Click the **Share** button (top-right)
2. Sign in with Dropbox (first time only — you'll be redirected and brought back)
3. Click **Start session**
4. Copy the generated link and send it to your collaborators
5. Optionally, enter a collaborator's email and click **Invite** to share the Dropbox folder directly

### Joining a Session (Collaborator)

1. Open the link you received (it looks like `https://example.com/#room=abc123,key456`)
2. You'll be prompted to sign in with Dropbox
3. After signing in, the drawing loads and you can collaborate in real-time
4. Your cursor and changes are visible to everyone in the room instantly

### Tips

- The encryption key is in the URL fragment (`#room=...`) — it is never sent to any server
- Drawings are end-to-end encrypted and stored in Dropbox under `/Apps/ExcalidrawDropbox/`
- If you lose connection, changes sync back automatically when you reconnect
- You can use all standard Excalidraw features: shapes, text, images, export, themes

### Architecture

```
┌────────────┐     WebSocket      ┌──────────────┐
│  Browser A  │ ◄──────────────► │  Relay Server │
└──────┬─────┘                    └──────┬───────┘
       │                                 │
       │  Dropbox API                    │  WebSocket
       ▼                                 │
┌────────────┐                    ┌──────┴─────┐
│   Dropbox   │ ◄───────────────  │  Browser B  │
│  /Apps/...  │    Dropbox API    └────────────┘
└────────────┘
```

- **Primary sync**: WebSocket relay (real-time, sub-second)
- **Durable storage**: Dropbox (encrypted, throttled saves)
- **Safety net**: Dropbox long-poll (catches missed updates)
- **Encryption**: AES-GCM, key in URL fragment (never sent to server)

### Dropbox Folder Layout

```
/Apps/ExcalidrawDropbox/
  rooms/{roomId}/
    scene.enc           # Encrypted + compressed scene
    files/{fileId}.enc  # Encrypted binary files (images)
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_DROPBOX_CLIENT_ID` | Dropbox App key | (required) |
| `VITE_DROPBOX_REDIRECT_URI` | OAuth redirect URI | `http://localhost:5173/auth/callback` |
| `VITE_WS_SERVER_URL` | WebSocket relay URL | `ws://localhost:3002` |
| `PORT` | Relay server port | `3002` |

## Production Deployment

In production, the relay server serves both the built client and WebSocket connections on a single port.

### Render

1. Connect your GitHub repo on [render.com](https://render.com)
2. Create a **Web Service**
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add environment variables:
   - `VITE_DROPBOX_CLIENT_ID` = your App key
   - `VITE_DROPBOX_REDIRECT_URI` = `https://your-app.onrender.com/auth/callback`
   - `VITE_WS_SERVER_URL` = `wss://your-app.onrender.com`
6. Don't forget to add the production redirect URI to your Dropbox App settings too

### Docker (Self-Hosted)

```bash
docker build -t excalidraw-dropbox .
docker run -p 3002:3002 --env-file .env excalidraw-dropbox
```

Your app will be available at `http://your-server:3002`.

### Vercel + Railway

- Deploy `client/` to **Vercel** (set root directory to `client`, framework to Vite)
- Deploy `server/` to **Railway** (set root directory to `server`)
- Set `VITE_WS_SERVER_URL` in Vercel to point to your Railway URL

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Sign in with Dropbox" does nothing | Check that `VITE_DROPBOX_CLIENT_ID` is set in `.env` |
| Redirect after sign-in goes to wrong page | Ensure the redirect URI in `.env` matches what's configured in the Dropbox App settings |
| Collaboration doesn't sync | Check that the relay server is running on port 3002 and `VITE_WS_SERVER_URL` is correct |
| "Forbidden" error from Dropbox | Go to Dropbox App **Permissions** tab, enable the required scopes, and click **Submit** |
| Port 5173 already in use | Vite will auto-pick the next available port — check the terminal output |

## License

MIT
