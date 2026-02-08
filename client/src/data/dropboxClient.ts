import { Dropbox, DropboxAuth } from "dropbox";
import { DROPBOX_CLIENT_ID, DROPBOX_REDIRECT_URI } from "../constants";

const TOKEN_KEY = "excalidraw-dropbox-token";
const REFRESH_TOKEN_KEY = "excalidraw-dropbox-refresh-token";
const CODE_VERIFIER_KEY = "excalidraw-dropbox-code-verifier";

let dbxAuth: DropboxAuth | null = null;
let dbx: Dropbox | null = null;

function getDbxAuth(): DropboxAuth {
  if (!dbxAuth) {
    dbxAuth = new DropboxAuth({
      clientId: DROPBOX_CLIENT_ID,
    });
    // Restore tokens if available
    const accessToken = localStorage.getItem(TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (accessToken) {
      dbxAuth.setAccessToken(accessToken);
    }
    if (refreshToken) {
      dbxAuth.setRefreshToken(refreshToken);
    }
  }
  return dbxAuth;
}

export function getDropbox(): Dropbox {
  if (!dbx) {
    dbx = new Dropbox({ auth: getDbxAuth() });
  }
  return dbx;
}

export function getDropboxAuth(): DropboxAuth {
  return getDbxAuth();
}

export async function startAuthFlow(): Promise<string> {
  const auth = getDbxAuth();
  const authUrl = (await auth.getAuthenticationUrl(
    DROPBOX_REDIRECT_URI,
    undefined,
    "code",
    "offline",
    undefined,
    undefined,
    true, // PKCE
  )) as string;

  // Save code verifier for PKCE
  const codeVerifier = auth.getCodeVerifier();
  localStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);

  return authUrl;
}

export async function handleAuthRedirect(
  code: string,
): Promise<{ accessToken: string; userName: string }> {
  const auth = getDbxAuth();

  // Restore code verifier
  const codeVerifier = localStorage.getItem(CODE_VERIFIER_KEY);
  if (codeVerifier) {
    auth.setCodeVerifier(codeVerifier);
  }

  const response = await auth.getAccessTokenFromCode(
    DROPBOX_REDIRECT_URI,
    code,
  );
  const result = response.result as {
    access_token: string;
    refresh_token?: string;
  };

  const accessToken = result.access_token;
  auth.setAccessToken(accessToken);
  localStorage.setItem(TOKEN_KEY, accessToken);

  if (result.refresh_token) {
    auth.setRefreshToken(result.refresh_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, result.refresh_token);
  }

  // Recreate Dropbox client with new token
  dbx = new Dropbox({ auth });

  // Fetch username
  const account = await dbx.usersGetCurrentAccount();
  const userName =
    account.result.name?.display_name || account.result.email || "User";

  localStorage.removeItem(CODE_VERIFIER_KEY);
  return { accessToken, userName };
}

export function hasStoredToken(): boolean {
  return !!localStorage.getItem(TOKEN_KEY);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(CODE_VERIFIER_KEY);
  dbxAuth = null;
  dbx = null;
}

export async function ensureValidToken(): Promise<void> {
  const auth = getDbxAuth();
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (refreshToken) {
    auth.setRefreshToken(refreshToken);
    try {
      await auth.checkAndRefreshAccessToken();
      const newToken = auth.getAccessToken();
      if (newToken) {
        localStorage.setItem(TOKEN_KEY, newToken);
      }
    } catch {
      // Refresh failed — clear and force re-auth
      clearTokens();
    }
  }
}
