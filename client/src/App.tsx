import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Excalidraw, MainMenu, LiveCollaborationTrigger } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  BinaryFileData,
} from "@excalidraw/excalidraw/types";
import { Collab, CollabState } from "./collab/Collab";
import { CollabDialog } from "./components/CollabDialog";
import { useDropboxAuth } from "./data/dropboxAuth";
import { saveLocal, loadLocal } from "./data/localStorage";
import { loadScene } from "./data/dropbox";

function parseRoomHash(): { roomId: string; roomKey: string } | null {
  const hash = window.location.hash;
  const match = hash.match(/^#room=([^,]+),(.+)$/);
  if (match) {
    return { roomId: match[1], roomKey: match[2] };
  }
  return null;
}

export default function App() {
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [collabDialogOpen, setCollabDialogOpen] = useState(false);
  const [collabState, setCollabState] = useState<CollabState>({
    isCollaborating: false,
    roomId: null,
    roomKey: null,
    collaborators: [],
  });

  const { isAuthenticated, userName, isLoading } = useDropboxAuth();
  const collabRef = useRef<Collab | null>(null);

  // Initialize Collab singleton
  const collab = useMemo(() => {
    if (!collabRef.current) {
      collabRef.current = new Collab();
    }
    return collabRef.current;
  }, []);

  // Wire up collab state changes
  useEffect(() => {
    collab.setOnStateChange(setCollabState);
  }, [collab]);

  // Wire excalidraw API to collab
  useEffect(() => {
    if (excalidrawAPI) {
      collab.setExcalidrawAPI(excalidrawAPI);
    }
  }, [excalidrawAPI, collab]);

  // Update username
  useEffect(() => {
    if (userName) {
      collab.setUsername(userName);
    }
  }, [userName, collab]);

  // Auto-join room from URL hash
  useEffect(() => {
    const room = parseRoomHash();
    if (room && isAuthenticated && excalidrawAPI && !collabState.isCollaborating) {
      collab
        .startSession(room.roomId, room.roomKey)
        .catch((err) => console.error("Failed to join room:", err));
    } else if (room && !isAuthenticated && !isLoading) {
      // Show dialog for auth
      setCollabDialogOpen(true);
    }
  }, [isAuthenticated, isLoading, excalidrawAPI, collab, collabState.isCollaborating]);

  // Load initial data
  const [initialData, setInitialData] = useState<{
    elements?: ExcalidrawElement[];
    appState?: Partial<AppState>;
  } | null>(null);

  useEffect(() => {
    const room = parseRoomHash();
    if (room && isAuthenticated) {
      // Load from Dropbox
      loadScene(room.roomId, room.roomKey)
        .then((loaded) => {
          if (loaded) {
            setInitialData({
              elements: loaded.elements,
              appState: loaded.appState,
            });
          } else {
            setInitialData({});
          }
        })
        .catch(() => setInitialData({}));
    } else {
      // Load from localStorage
      const local = loadLocal();
      setInitialData(local || {});
    }
  }, [isAuthenticated]);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState) => {
      if (collabState.isCollaborating) {
        collab.syncElements(elements);
      } else {
        saveLocal(elements, appState);
      }
    },
    [collabState.isCollaborating, collab],
  );

  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number };
      button: "down" | "up";
      pointersMap: Map<number, Readonly<{ x: number; y: number }>>;
    }) => {
      if (collabState.isCollaborating) {
        collab.broadcastCursor({
          pointer: payload.pointer,
          button: payload.button,
          selectedElementIds:
            excalidrawAPI?.getAppState().selectedElementIds || {},
        });
      }
    },
    [collabState.isCollaborating, collab, excalidrawAPI],
  );

  const openCollabDialog = useCallback(() => {
    setCollabDialogOpen(true);
  }, []);

  if (initialData === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontSize: 16,
          color: "#666",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <Excalidraw
        excalidrawAPI={(api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api)}
        initialData={initialData}
        onChange={handleChange}
        isCollaborating={collabState.isCollaborating}
        onPointerUpdate={handlePointerUpdate}
        renderTopRightUI={() => (
          <LiveCollaborationTrigger
            isCollaborating={collabState.isCollaborating}
            onSelect={openCollabDialog}
          />
        )}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
      <CollabDialog
        open={collabDialogOpen}
        onClose={() => setCollabDialogOpen(false)}
        collab={collab}
      />
    </div>
  );
}
