import { getDropbox } from "./dropboxClient";
import { encryptData, decryptData } from "./encryption";
import { ROOMS_FOLDER } from "../constants";
import pako from "pako";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFileData } from "@excalidraw/excalidraw/types";
import {
  reconcileElements,
  restoreElements,
  getSceneVersion,
} from "./sceneUtils";

interface SavedScene {
  elements: readonly ExcalidrawElement[];
  appState?: Partial<AppState>;
  version: number;
}

// Cache of known Dropbox revisions for optimistic concurrency
const revisionCache = new Map<string, string>();
let cachedSceneVersion: number | null = null;

function scenePath(roomId: string): string {
  return `/${ROOMS_FOLDER}/${roomId}/scene.enc`;
}

function filePath(roomId: string, fileId: string): string {
  return `/${ROOMS_FOLDER}/${roomId}/files/${fileId}.enc`;
}

function compress(data: string): Uint8Array {
  return pako.deflate(new TextEncoder().encode(data));
}

function decompress(data: ArrayBuffer): string {
  return new TextDecoder().decode(pako.inflate(new Uint8Array(data)));
}

export async function createRoom(roomId: string): Promise<void> {
  const dbx = getDropbox();
  try {
    await dbx.filesCreateFolderV2({
      path: `/${ROOMS_FOLDER}/${roomId}`,
      autorename: false,
    });
    await dbx.filesCreateFolderV2({
      path: `/${ROOMS_FOLDER}/${roomId}/files`,
      autorename: false,
    });
  } catch (err: any) {
    // Ignore if folder already exists
    if (err?.error?.error_summary?.includes("path/conflict/folder")) {
      return;
    }
    throw err;
  }
}

export async function saveScene(
  roomId: string,
  roomKey: string,
  localElements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  maxRetries = 3,
): Promise<void> {
  const path = scenePath(roomId);
  const dbx = getDropbox();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Step 1: Download current version for reconciliation
      let remoteElements: ExcalidrawElement[] = [];
      let rev: string | undefined;

      try {
        const download = await dbx.filesDownload({ path });
        const blob = (download.result as any).fileBlob as Blob;
        const encryptedBuffer = await blob.arrayBuffer();
        const compressedBuffer = await decryptData(roomKey, encryptedBuffer);
        const json = decompress(compressedBuffer);
        const parsed = JSON.parse(json) as SavedScene;
        remoteElements = parsed.elements as ExcalidrawElement[];
        rev = (download.result as any).rev;
      } catch (err: any) {
        // File doesn't exist yet — first save
        if (err?.error?.error_summary?.includes("path/not_found")) {
          rev = undefined;
        } else {
          throw err;
        }
      }

      // Step 2: Reconcile
      const merged =
        remoteElements.length > 0
          ? reconcileElements(localElements, remoteElements, appState)
          : localElements;

      // Step 3: Encrypt & upload
      const version = getSceneVersion(merged);
      const sceneData: SavedScene = {
        elements: merged,
        version,
      };
      const json = JSON.stringify(sceneData);
      const compressed = compress(json);
      const encrypted = await encryptData(roomKey, compressed);

      const writeMode = rev
        ? { ".tag": "update" as const, update: rev }
        : { ".tag": "overwrite" as const };

      const uploadResult = await dbx.filesUpload({
        path,
        contents: new Blob([encrypted]),
        mode: writeMode,
        autorename: false,
        mute: true,
      });

      // Cache the new revision
      revisionCache.set(path, (uploadResult.result as any).rev);
      cachedSceneVersion = version;
      return;
    } catch (err: any) {
      // 409 conflict — retry
      const isConflict =
        err?.status === 409 ||
        err?.error?.error_summary?.includes("conflict");
      if (isConflict && attempt < maxRetries - 1) {
        continue;
      }
      throw err;
    }
  }
}

export async function loadScene(
  roomId: string,
  roomKey: string,
): Promise<{
  elements: ExcalidrawElement[];
  appState?: Partial<AppState>;
} | null> {
  const dbx = getDropbox();
  const path = scenePath(roomId);

  try {
    const download = await dbx.filesDownload({ path });
    const blob = (download.result as any).fileBlob as Blob;
    const encryptedBuffer = await blob.arrayBuffer();
    const compressedBuffer = await decryptData(roomKey, encryptedBuffer);
    const json = decompress(compressedBuffer);
    const parsed = JSON.parse(json) as SavedScene;

    revisionCache.set(path, (download.result as any).rev);
    cachedSceneVersion = parsed.version;

    const elements = restoreElements(parsed.elements as ExcalidrawElement[]);
    return {
      elements,
      appState: parsed.appState,
    };
  } catch (err: any) {
    if (err?.error?.error_summary?.includes("path/not_found")) {
      return null;
    }
    throw err;
  }
}

export function isSceneSaved(elements: readonly ExcalidrawElement[]): boolean {
  if (cachedSceneVersion === null) return false;
  return getSceneVersion(elements) === cachedSceneVersion;
}

export async function saveFiles(
  roomId: string,
  roomKey: string,
  files: Map<string, BinaryFileData>,
): Promise<void> {
  const dbx = getDropbox();

  const uploads = Array.from(files.entries()).map(
    async ([fileId, fileData]) => {
      const path = filePath(roomId, fileId);

      // Decode dataURL to binary
      const response = await fetch(fileData.dataURL);
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      const encrypted = await encryptData(roomKey, new Uint8Array(buffer));

      // Upload metadata alongside encrypted file
      const meta = JSON.stringify({
        mimeType: fileData.mimeType,
        created: fileData.created,
        lastRetrieved: fileData.lastRetrieved,
      });
      const metaEncrypted = await encryptData(
        roomKey,
        new TextEncoder().encode(meta),
      );

      await dbx.filesUpload({
        path,
        contents: new Blob([encrypted]),
        mode: { ".tag": "overwrite" },
        autorename: false,
        mute: true,
      });

      await dbx.filesUpload({
        path: `${path}.meta`,
        contents: new Blob([metaEncrypted]),
        mode: { ".tag": "overwrite" },
        autorename: false,
        mute: true,
      });
    },
  );

  await Promise.all(uploads);
}

export async function loadFiles(
  roomId: string,
  roomKey: string,
  fileIds: string[],
): Promise<Map<string, BinaryFileData>> {
  const dbx = getDropbox();
  const result = new Map<string, BinaryFileData>();

  const downloads = fileIds.map(async (fileId) => {
    const path = filePath(roomId, fileId);

    try {
      // Download file data
      const download = await dbx.filesDownload({ path });
      const blob = (download.result as any).fileBlob as Blob;
      const encryptedBuffer = await blob.arrayBuffer();
      const decrypted = await decryptData(roomKey, encryptedBuffer);

      // Download metadata
      const metaDownload = await dbx.filesDownload({ path: `${path}.meta` });
      const metaBlob = (metaDownload.result as any).fileBlob as Blob;
      const metaEncrypted = await metaBlob.arrayBuffer();
      const metaDecrypted = await decryptData(roomKey, metaEncrypted);
      const meta = JSON.parse(new TextDecoder().decode(metaDecrypted));

      // Convert to dataURL
      const dataBlob = new Blob([decrypted], { type: meta.mimeType });
      const dataURL = await blobToDataURL(dataBlob);

      result.set(fileId, {
        id: fileId as any,
        mimeType: meta.mimeType,
        dataURL: dataURL as any,
        created: meta.created,
        lastRetrieved: Date.now(),
      });
    } catch (err: any) {
      if (!err?.error?.error_summary?.includes("path/not_found")) {
        console.error(`Failed to load file ${fileId}:`, err);
      }
    }
  });

  await Promise.all(downloads);
  return result;
}

export async function shareRoom(
  roomId: string,
  emails: string[],
): Promise<void> {
  const dbx = getDropbox();
  const folderPath = `/${ROOMS_FOLDER}/${roomId}`;

  try {
    // Share the folder
    const shareResult = await dbx.sharingShareFolder({
      path: folderPath,
      force_async: false,
    });

    const sharedFolderId =
      shareResult.result[".tag"] === "complete"
        ? shareResult.result.shared_folder_id
        : null;

    if (sharedFolderId && emails.length > 0) {
      await dbx.sharingAddFolderMember({
        shared_folder_id: sharedFolderId,
        members: emails.map((email) => ({
          member: { ".tag": "email" as const, email },
          access_level: { ".tag": "editor" as const },
        })),
      });
    }
  } catch (err: any) {
    // Folder may already be shared
    if (err?.error?.error_summary?.includes("already_shared")) {
      return;
    }
    throw err;
  }
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function getRoomFolderCursor(roomId: string): Promise<string> {
  const dbx = getDropbox();
  const result = await dbx.filesListFolder({
    path: `/${ROOMS_FOLDER}/${roomId}`,
    recursive: true,
  });
  return result.result.cursor;
}
