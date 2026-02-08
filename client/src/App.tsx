import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Excalidraw, MainMenu, LiveCollaborationTrigger } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { Collab, CollabState } from "./collab/Collab";
import { CollabDialog } from "./components/CollabDialog";
import { saveLocal, loadLocal } from "./data/localStorage";

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

  const collabRef = useRef<Collab | null>(null);

  const collab = useMemo(() => {
    if (!collabRef.current) {
      collabRef.current = new Collab();
    }
    return collabRef.current;
  }, []);

  useEffect(() => {
    collab.setOnStateChange(setCollabState);
  }, [collab]);

  useEffect(() => {
    if (excalidrawAPI) {
      collab.setExcalidrawAPI(excalidrawAPI);
    }
  }, [excalidrawAPI, collab]);

  // Auto-join room from URL hash
  useEffect(() => {
    const room = parseRoomHash();
    if (room && excalidrawAPI && !collabState.isCollaborating) {
      const name = localStorage.getItem("excalidraw-collab-username") || "Anonymous";
      collab.setUsername(name);
      collab
        .startSession(room.roomId, room.roomKey)
        .catch((err) => console.error("Failed to join room:", err));
    }
  }, [excalidrawAPI, collab, collabState.isCollaborating]);

  // Load initial data from localStorage
  const [initialData] = useState(() => loadLocal() || {});

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
