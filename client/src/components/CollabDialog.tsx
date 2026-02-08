import React, { useState, useCallback, useEffect, useRef } from "react";
import { useDropboxAuth } from "../data/dropboxAuth";
import { shareRoom } from "../data/dropbox";
import type { Collab } from "../collab/Collab";

interface CollabDialogProps {
  open: boolean;
  onClose: () => void;
  collab: Collab;
}

type Step = "auth" | "create" | "active";

export function CollabDialog({ open, onClose, collab }: CollabDialogProps) {
  const { isAuthenticated, isLoading, userName, login } = useDropboxAuth();
  const [step, setStep] = useState<Step>("auth");
  const [roomLink, setRoomLink] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Determine current step
  useEffect(() => {
    if (collab.state.isCollaborating) {
      const link = `${window.location.origin}/#room=${collab.state.roomId},${collab.state.roomKey}`;
      setRoomLink(link);
      setStep("active");
    } else if (isAuthenticated) {
      setStep("create");
    } else {
      setStep("auth");
    }
  }, [isAuthenticated, collab.state.isCollaborating]);

  const handleStartSession = useCallback(async () => {
    setIsCreating(true);
    try {
      const { roomId, roomKey } = await collab.createRoom();
      collab.setUsername(userName || "Anonymous");
      await collab.startSession(roomId, roomKey);

      const link = `${window.location.origin}/#room=${roomId},${roomKey}`;
      setRoomLink(link);
      window.location.hash = `room=${roomId},${roomKey}`;
      setStep("active");
    } catch (err) {
      console.error("Failed to start session:", err);
      alert("Failed to start collaboration session. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }, [collab, userName]);

  const handleStopSession = useCallback(() => {
    collab.stopSession();
    window.location.hash = "";
    setRoomLink(null);
    setStep("create");
  }, [collab]);

  const handleCopyLink = useCallback(() => {
    if (roomLink) {
      navigator.clipboard.writeText(roomLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [roomLink]);

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim() || !collab.state.roomId) return;
    setInviteStatus("Sending invite...");
    try {
      await shareRoom(collab.state.roomId, [inviteEmail.trim()]);
      setInviteStatus("Invite sent!");
      setInviteEmail("");
      setTimeout(() => setInviteStatus(null), 3000);
    } catch (err) {
      console.error("Failed to share room:", err);
      setInviteStatus("Failed to send invite.");
      setTimeout(() => setInviteStatus(null), 3000);
    }
  }, [inviteEmail, collab.state.roomId]);

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <button style={styles.closeButton} onClick={onClose}>
          &times;
        </button>
        <h2 style={styles.title}>Live Collaboration</h2>

        {isLoading ? (
          <div style={styles.center}>
            <p>Loading...</p>
          </div>
        ) : step === "auth" ? (
          <div style={styles.center}>
            <p style={styles.text}>
              Sign in with Dropbox to start collaborating.
              <br />
              Your drawings will be saved securely in your Dropbox.
            </p>
            <button style={styles.primaryButton} onClick={login}>
              Sign in with Dropbox
            </button>
          </div>
        ) : step === "create" ? (
          <div style={styles.center}>
            <p style={styles.text}>
              Signed in as <strong>{userName}</strong>
            </p>
            <p style={styles.text}>
              Start a collaboration session to draw with others in real-time.
              A shareable link will be generated.
            </p>
            <button
              style={styles.primaryButton}
              onClick={handleStartSession}
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "Start session"}
            </button>
          </div>
        ) : (
          <div style={styles.activeSession}>
            <p style={styles.text}>
              Signed in as <strong>{userName}</strong>
            </p>

            <div style={styles.linkSection}>
              <label style={styles.label}>Share this link:</label>
              <div style={styles.linkRow}>
                <input
                  ref={linkInputRef}
                  style={styles.linkInput}
                  value={roomLink || ""}
                  readOnly
                  onClick={() => linkInputRef.current?.select()}
                />
                <button style={styles.copyButton} onClick={handleCopyLink}>
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div style={styles.inviteSection}>
              <label style={styles.label}>Invite via Dropbox:</label>
              <div style={styles.linkRow}>
                <input
                  style={styles.linkInput}
                  type="email"
                  placeholder="collaborator@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
                <button
                  style={styles.copyButton}
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim()}
                >
                  Invite
                </button>
              </div>
              {inviteStatus && (
                <p style={styles.statusText}>{inviteStatus}</p>
              )}
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
  activeSession: {},
  linkSection: {
    marginBottom: 16,
  },
  inviteSection: {
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
  statusText: {
    fontSize: 12,
    color: "#888",
    marginTop: 6,
    marginBottom: 0,
  },
  collaboratorsList: {
    fontSize: 14,
    color: "#333",
    margin: 0,
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
    marginTop: 8,
  },
};
