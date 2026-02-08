import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DropboxAuthProvider } from "./data/dropboxAuth";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DropboxAuthProvider>
      <App />
    </DropboxAuthProvider>
  </React.StrictMode>,
);
