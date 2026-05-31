import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/seba-f1-app/",
  plugins: [react()],
});