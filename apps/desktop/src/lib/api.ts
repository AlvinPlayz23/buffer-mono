import type { DesktopApi } from "../types/acp";

export function getDesktopApi(): DesktopApi {
  if (!window.acpDesktop) {
    throw new Error("Desktop preload API is unavailable. Run inside Electron.");
  }
  return window.acpDesktop;
}
