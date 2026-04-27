import * as PIXI from 'pixi.js';

declare global {
  interface Window {
    PIXI?: any;
  }
}

export function ensurePixiGlobal() {
  if (!window.PIXI) {
    window.PIXI = PIXI;
  }

  if (!window.PIXI.Transformer) {
    class Transformer extends PIXI.Container {
      constructor(_options?: unknown) {
        super();
      }
    }
    window.PIXI.Transformer = Transformer;
  }
}

