import type { GamingLooperApi } from "../preload/index";

declare global {
  interface Window {
    gamingLooper: GamingLooperApi;
  }
}

export {};
