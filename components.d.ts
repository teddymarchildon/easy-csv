/// <reference types="vite/client" />

interface Window {
  api: import("./src/preload/types").RendererApi;
}

