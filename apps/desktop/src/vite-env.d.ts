/// <reference types="vite/client" />

import type { DesktopApi } from "./types/acp";

declare global {
  interface Window {
    acpDesktop: DesktopApi;
  }
}
