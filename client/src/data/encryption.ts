// Encryption utilities — we use the Web Crypto API directly.
// Excalidraw's encryption helpers are internal, so we implement
// compatible AES-GCM encryption here.

const IV_LENGTH = 12;

export async function generateEncryptionKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 128 },
    true,
    ["encrypt", "decrypt"],
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufferToBase64url(raw);
}

export async function encryptData(
  key: string,
  data: Uint8Array | string,
): Promise<ArrayBuffer> {
  const cryptoKey = await importKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encoded =
    typeof data === "string" ? new TextEncoder().encode(data) : data;

  const encodedBuffer: ArrayBuffer =
    encoded.buffer instanceof ArrayBuffer
      ? encoded.buffer
      : new Uint8Array(encoded).buffer as ArrayBuffer;
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encodedBuffer,
  );

  // Prepend IV to ciphertext
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), iv.length);
  return result.buffer;
}

export async function decryptData(
  key: string,
  encrypted: ArrayBuffer,
): Promise<ArrayBuffer> {
  const cryptoKey = await importKey(key);
  const data = new Uint8Array(encrypted);
  const iv = data.slice(0, IV_LENGTH);
  const ciphertext = data.slice(IV_LENGTH);

  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ciphertext);
}

async function importKey(base64urlKey: string): Promise<CryptoKey> {
  const raw = base64urlToBuffer(base64urlKey);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
