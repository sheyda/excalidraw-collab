import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  startAuthFlow,
  handleAuthRedirect,
  hasStoredToken,
  clearTokens,
  ensureValidToken,
  getDropbox,
} from "./dropboxClient";

interface DropboxAuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userName: string | null;
  login: () => Promise<void>;
  logout: () => void;
}

const DropboxAuthContext = createContext<DropboxAuthState>({
  isAuthenticated: false,
  isLoading: true,
  userName: null,
  login: async () => {},
  logout: () => {},
});

const USERNAME_KEY = "excalidraw-dropbox-username";
const RETURN_HASH_KEY = "excalidraw-dropbox-return-hash";

export function DropboxAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);

  // Handle OAuth callback
  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code && window.location.pathname === "/auth/callback") {
        try {
          const result = await handleAuthRedirect(code);
          setIsAuthenticated(true);
          setUserName(result.userName);
          localStorage.setItem(USERNAME_KEY, result.userName);

          // Restore previous hash route
          const returnHash = localStorage.getItem(RETURN_HASH_KEY);
          localStorage.removeItem(RETURN_HASH_KEY);
          window.history.replaceState(null, "", returnHash || "/");
        } catch (err) {
          console.error("OAuth callback failed:", err);
          window.history.replaceState(null, "", "/");
        }
      }
      setIsLoading(false);
    };

    handleCallback();
  }, []);

  // Check for existing token on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (hasStoredToken()) {
        try {
          await ensureValidToken();
          // Verify the token works
          const dbx = getDropbox();
          const account = await dbx.usersGetCurrentAccount();
          const name =
            account.result.name?.display_name ||
            account.result.email ||
            "User";
          setUserName(name);
          localStorage.setItem(USERNAME_KEY, name);
          setIsAuthenticated(true);
        } catch {
          clearTokens();
          setIsAuthenticated(false);
          setUserName(null);
        }
      } else {
        // Restore cached username if no token check needed
        const cached = localStorage.getItem(USERNAME_KEY);
        if (cached) setUserName(cached);
      }
      setIsLoading(false);
    };

    // Only run if not in callback flow
    if (window.location.pathname !== "/auth/callback") {
      checkAuth();
    }
  }, []);

  const login = useCallback(async () => {
    // Save current hash so we can return after OAuth
    localStorage.setItem(RETURN_HASH_KEY, window.location.hash || "/");
    const authUrl = await startAuthFlow();
    window.location.href = authUrl;
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    localStorage.removeItem(USERNAME_KEY);
    setIsAuthenticated(false);
    setUserName(null);
  }, []);

  return (
    <DropboxAuthContext.Provider
      value={{ isAuthenticated, isLoading, userName, login, logout }}
    >
      {children}
    </DropboxAuthContext.Provider>
  );
}

export function useDropboxAuth(): DropboxAuthState {
  return useContext(DropboxAuthContext);
}
