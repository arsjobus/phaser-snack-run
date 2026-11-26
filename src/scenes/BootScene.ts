import Phaser from "phaser";
import { makeBackdrops } from "../art/backdrops";
import { artAssets } from "../art/manifest";
import { SFX_KEYS, sfxCacheKey, sfxUrl } from "../audio/sfx";
import { makeRotationAtlas } from "../art/trucks";

/**
 * Loads the authored SVG artwork and prepares the remaining procedural scenery.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    const loadingLabel = document.getElementById("loading-label");
    const loadingProgress = document.getElementById("loading-progress");
    const loadingBar = document.getElementById("loading-track");

    this.load.on("progress", (value: number) => {
      const percent = Math.round(value * 100);
      if (loadingLabel)
        loadingLabel.textContent = `LOADING ${percent}%`;
      if (loadingProgress) loadingProgress.style.width = `${percent}%`;
      loadingBar?.setAttribute("aria-valuenow", String(percent));
    });

    for (const a of artAssets()) this.load.svg(a.key, a.url);
    // The wordmark is an existing SVG outside the generated art manifest.
    this.load.svg("crunch_logo", "art/crunch-logo.svg");
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      if (file.type === "svg") console.warn(`Art file ${file.url} did not load for ${file.key}.`);
    });

    this.load.audio("bgm", "audio/bgm.mp3");
    for (const key of SFX_KEYS) this.load.audio(sfxCacheKey(key), sfxUrl(key));
  }

  create(): void {
    const logo = this.textures.get("crunch_logo");
    if (logo && !logo.has("wordmark")) logo.add("wordmark", 0, 0, 0, 520, 100);
    makeBackdrops(this);
    if (this.textures.exists("truck_body")) makeRotationAtlas(this, "truck_body");
    for (const key of artAssets().map((a) => a.key).filter((k) => k.startsWith("rival_")))
      if (this.textures.exists(key)) makeRotationAtlas(this, key);
    const q = new URLSearchParams(window.location.search);
    // The start screen comes first. Developer shortcuts skip it: `?art` is the art preview,
    // `?settings` opens the settings screen, and `?play` or `?seed=...` go straight to a run.
    const straightToRun = q.has("play") || q.has("seed");
    this.scene.start(
      q.has("art")
        ? "Art"
        : q.has("settings")
          ? "Settings"
          : straightToRun
            ? "Game"
            : "Menu",
    );
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      // Keep the completed loading screen visible briefly so the transition feels intentional.
      window.setTimeout(() => {
        loadingScreen.classList.add("is-fading");
        window.setTimeout(() => {
          loadingScreen.hidden = true;
        }, 360);
      }, 500);
    }
  }

}
