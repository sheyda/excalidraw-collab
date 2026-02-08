import React, { useState, useCallback, useRef } from "react";
import type { Collab } from "../collab/Collab";

interface CollabDialogProps {
  open: boolean;
  onClose: () => void;
  collab: Collab;
}

export function CollabDialog({ open, onClose, collab }: CollabDialogProps) {
  const [roomLink, setRoomLink] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState(
    () => localStorage.getItem("excalidraw-collab-username") || "",
  );
  const linkInputRef = useRef<HTMLInputElement>(null);

  const isActive = collab.state.isCollaborating;

  const handleStartSession = useCallback(async () => {
    const name = username.trim() || "Anonymous";
    localStorage.setItem("excalidraw-collab-username", name);
    collab.setUsername(name);

    setIsCreating(true);
    try {
      const { roomId, roomKey } = collab.createRoom();
      await collab.startSession(roomId, roomKey);

      const link = `${window.location.origin}/#room=${roomId},${roomKey}`;
      setRoomLink(link);
      window.location.hash = `room=${roomId},${roomKey}`;
    } catch (err) {
      console.error("Failed to start session:", err);
      alert("Failed to start collaboration session. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }, [collab, username]);

  const handleStopSession = useCallback(() => {
    collab.stopSession();
    window.location.hash = "";
    setRoomLink(null);
  }, [collab]);

  const handleCopyLink = useCallback(() => {
    if (roomLink) {
      navigator.clipboard.writeText(roomLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [roomLink]);

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <button style={styles.closeButton} onClick={onClose}>
          &times;
        </button>
        <h2 style={styles.title}>Live Collaboration</h2>

        {!isActive ? (
          <div style={styles.center}>
            <p style={styles.text}>
              Start a session to draw with others in real-time.
              Share the generated link with your collaborators.
            </p>
            <div style={styles.field}>
              <label style={styles.label}>Your name</label>
              <input
                style={styles.input}
                type="text"
                placeholder="Anonymous"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartSession()}
              />
            </div>
            <button
              style={styles.primaryButton}
              onClick={handleStartSession}
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "Start session"}
            </button>
          </div>
        ) : (
          <div>
            <div style={styles.linkSection}>
              <label style={styles.label}>Share this link:</label>
              <div style={styles.linkRow}>
                <input
                  ref={linkInputRef}
                  style={styles.linkInput}
                  value={roomLink || `${window.location.origin}/#room=${collab.state.roomId},${collab.state.roomKey}`}
                  readOnly
                  onClick={() => linkInputRef.current?.select()}
                />
                <button style={styles.copyButton} onClick={handleCopyLink}>
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {collab.state.collaborators.length > 0 && (
              <div style={styles.collaboratorsSection}>
                <label style={styles.label}>
                  Online ({collab.state.collaborators.length}):
                </label>
                <p style={styles.collaboratorsList}>
                  {collab.state.collaborators.join(", ")}
                </p>
              </div>
            )}

            <p style={styles.hint}>
              To persist your drawing, use the menu to save the file to a shared
              Dropbox folder (or any synced folder).
            </p>

            <button style={styles.stopButton} onClick={handleStopSession}>
              Stop session
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
  },
  dialog: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 32,
    width: 420,
    maxWidth: "90vw",
    position: "relative",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 16,
    background: "none",
    border: "none",
    fontSize: 24,
    cursor: "pointer",
    color: "#666",
    padding: 4,
  },
  title: {
    margin: "0 0 20px",
    fontSize: 20,
    fontWeight: 600,
    color: "#1b1b1f",
  },
  center: {
    textAlign: "center" as const,
  },
  text: {
    color: "#555",
    fontSize: 14,
    lineHeight: 1.5,
    margin: "0 0 16px",
  },
  field: {
    marginBottom: 16,
    textAlign: "left" as const,
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #ddd",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  primaryButton: {
    backgroundColor: "#6965db",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px 24px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  linkSection: {
    marginBottom: 16,
  },
  collaboratorsSection: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase" as const,
    marginBottom: 6,
    letterSpacing: "0.5px",
  },
  linkRow: {
    display: "flex",
    gap: 8,
  },
  linkInput: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #ddd",
    fontSize: 13,
    fontFamily: "monospace",
    outline: "none",
  },
  copyButton: {
    padding: "8px 16px",
    borderRadius: 6,
    border: "1px solid #ddd",
    backgroundColor: "#f5f5f5",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap" as const,
  },
  collaboratorsList: {
    fontSize: 14,
    color: "#333",
    margin: 0,
  },
  hint: {
    fontSize: 13,
    color: "#888",
    lineHeight: 1.4,
    margin: "0 0 16px",
  },
  stopButton: {
    backgroundColor: "#e74c3c",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
};
