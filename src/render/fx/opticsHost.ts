/**
 * Owns the water optics pass for one tank view: attaches it to the scene's
 * main camera, makes the caustic and light map textures it samples, and
 * turns world-space inputs into uniforms each frame. `enable(false)` (Low
 * quality, Auto stepping down, the Canvas renderer) detaches it cleanly.
 */
import Phaser from 'phaser';
import type { LightMap } from '../lighting';
import { CAUSTIC_SIZE, paintCaustics } from './causticTexture';
import { registerWaterOptics, WATER_OPTICS, WaterOpticsFX } from './waterOptics';
import { opticsUniforms, type OpticsInput } from './opticsParams';

const CAUSTIC_KEY = 'fx-caustics';

export class OpticsHost {
  fx: WaterOpticsFX | null = null;
  private lmKey: string;
  private lmImage: ImageData;

  constructor(private scene: Phaser.Scene, private lightMap: LightMap, id: string) {
    this.lmKey = `fx-lightmap:${id}`;
    this.lmImage = new ImageData(lightMap.cols, lightMap.rows);
  }

  get active(): boolean {
    return this.fx !== null;
  }

  /** Attaches or detaches the pass. Returns whether it is now active. */
  enable(on: boolean): boolean {
    const cam = this.scene.cameras.main;
    if (on && !this.fx && registerWaterOptics(this.scene.game)) {
      this.ensureTextures();
      cam.setPostPipeline(WATER_OPTICS);
      const got = cam.getPostPipeline(WATER_OPTICS);
      const fx = (Array.isArray(got) ? got[0] : got) as WaterOpticsFX | undefined;
      if (fx) {
        fx.caustic = this.scene.textures.get(CAUSTIC_KEY);
        fx.lightMap = this.scene.textures.get(this.lmKey);
        this.fx = fx;
        this.uploadLightMap();
      }
    } else if (!on && this.fx) {
      cam.removePostPipeline(WATER_OPTICS);
      this.fx = null;
    }
    return this.fx !== null;
  }

  private ensureTextures(): void {
    const tm = this.scene.textures;
    if (!tm.exists(CAUSTIC_KEY)) {
      const tex = tm.createCanvas(CAUSTIC_KEY, CAUSTIC_SIZE, CAUSTIC_SIZE)!;
      tex.getContext().putImageData(new ImageData(paintCaustics(), CAUSTIC_SIZE, CAUSTIC_SIZE), 0, 0);
      tex.refresh();
      tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    if (!tm.exists(this.lmKey)) {
      const tex = tm.createCanvas(this.lmKey, this.lightMap.cols, this.lightMap.rows)!;
      tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }

  /** Call after the light map is rebuilt. */
  uploadLightMap(): void {
    if (!this.fx) return;
    const tex = this.scene.textures.get(this.lmKey) as Phaser.Textures.CanvasTexture;
    this.lightMap.writeRGBA(this.lmImage.data);
    tex.getContext().putImageData(this.lmImage, 0, 0);
    tex.refresh();
  }

  update(input: OpticsInput, time: number): void {
    if (!this.fx) return;
    const cam = this.scene.cameras.main;
    const r = this.scene.game.renderer;
    this.fx.time = time;
    this.fx.uniforms = opticsUniforms(input, { scrollX: cam.worldView.x, scrollY: cam.worldView.y, zoom: cam.zoom, w: r.width, h: r.height });
  }

  destroy(): void {
    if (this.fx) {
      this.scene.cameras.main?.removePostPipeline(WATER_OPTICS);
      this.fx = null;
    }
    if (this.scene.textures.exists(this.lmKey)) this.scene.textures.remove(this.lmKey);
  }
}
