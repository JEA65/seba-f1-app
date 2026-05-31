import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/seba-f1-app/service-worker.js", {
        scope: "/seba-f1-app/",
      })
      .then(() => {
        console.log("Service Worker registrado correctamente.");
      })
      .catch((error) => {
        console.error("Error registrando Service Worker:", error);
      });
  });
}