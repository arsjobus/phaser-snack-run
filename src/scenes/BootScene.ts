import Phaser from "phaser";
import { ART, TRUCK } from "../config";
import { makeBackdrops } from "../art/backdrops";
import { SFX_KEYS, sfxCacheKey, sfxUrl } from "../audio/sfx";
import {
  OBSTACLE_ART,
  OBSTACLE_VARIANTS,
  drawCheckpointGate,
  drawFuelCan,
  drawSnack,
  drawStartGate,
  drawWheel,
  drawWrench,
  obstacleKey,
} from "../art/props";
import {
  SHOW_CAR_H,
  SHOW_CAR_VARIANTS,
  SHOW_CAR_W,
  drawBoostArch,
  drawPyroStand,
  drawShowCar,
  showCarKey,
} from "../art/show";
import { makeRotationAtlas, makeTruckTextures } from "../art/trucks";

/**
 * Builds every texture procedurally, so the repo has zero binary assets. Phase 5 is the art pass:
 * the drawing code lives in `src/art/` (backdrops per biome, the truck set with pre-rendered
 * rotation frames, pickups, gates). Texture keys are stable, so real sprites can drop in.
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

    this.load.audio("bgm", "audio/bgm.mp3");
    for (const key of SFX_KEYS) this.load.audio(sfxCacheKey(key), sfxUrl(key));
  }

  create(): void {
    makeBackdrops(this);
    if (ART.rotationFrames > 0) {
      for (const key of makeTruckTextures(this)) makeRotationAtlas(this, key);
    } else {
      makeTruckTextures(this);
    }
    this.bake("wheel", TRUCK.tireRadius * 2, TRUCK.tireRadius * 2, (g) =>
      drawWheel(g, TRUCK.tireRadius),
    );
    this.bake("snack", 36, 46, drawSnack);
    this.bake("fuel_can", 38, 46, drawFuelCan);
    this.bake("wrench", 52, 44, drawWrench);
    this.bake("start_gate", 132, 220, drawStartGate);
    this.bake("cp_gate", 260, 212, (g) =>
      drawCheckpointGate(g, 0x2f6fd6, 0xffe066),
    );
    this.bake("cp_gate_zone", 260, 212, (g) =>
      drawCheckpointGate(g, 0xe8742a, 0x9be0ff),
    );
    for (let v = 0; v < SHOW_CAR_VARIANTS; v++)
      this.bake(showCarKey(v), SHOW_CAR_W, SHOW_CAR_H, (g) =>
        drawShowCar(g, v),
      );
    this.bake("pyro_stand", 30, 76, drawPyroStand);
    this.bake("boost_arch", 300, 214, drawBoostArch);
    for (const kind of Object.keys(
      OBSTACLE_ART,
    ) as (keyof typeof OBSTACLE_ART)[]) {
      const art = OBSTACLE_ART[kind];
      for (let v = 0; v < OBSTACLE_VARIANTS; v++)
        this.bake(obstacleKey(kind, v), art.w, art.h, (g) => art.draw(g, v));
    }
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
    if (loadingScreen) loadingScreen.hidden = true;
  }

  private bake(
    key: string,
    w: number,
    h: number,
    draw: (g: Phaser.GameObjects.Graphics) => void,
  ): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }
}
