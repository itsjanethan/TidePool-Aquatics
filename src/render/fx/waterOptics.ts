/**
 * Water optics for the tank view: one full-screen WebGL pass on the tank
 * camera (Phaser PostFX pipeline). It adds what a side-on photo of a real
 * aquarium shows and per-object art cannot:
 *
 *   - caustics: a physically generated network of focused light
 *     (causticTexture.ts) projected onto lit surfaces, strongest on the bed
 *     and the tops of rocks and plants, shaded by the light map
 *   - light shafts: soft slanted streaks from the surface, broken by
 *     floating plants and canopies (the same light map)
 *   - depth: wavelength-dependent absorption (reds fade first) and
 *     in-scattering toward the water colour, more with depth and cloudiness
 *   - the surface: a rippling mirror band under the waterline (total
 *     internal reflection) and a little refraction just below it
 *   - glass: a faint fresnel edge, soft diagonal sheen and lens falloff
 *   - edge smoothing (an FXAA-style pass written for this game) so polygon
 *     plants and outlines stay clean at any zoom
 *   - land enclosures: humid haze, warm grading and a soft highlight glow
 *     instead of the water terms; a paludarium gets both, split at the pool
 *
 * Every input is a uniform derived from simulation state by
 * `opticsParams` (pure, unit tested). The pass is skipped at Low quality and
 * under the Canvas renderer; the older per-object effects remain there.
 */
import Phaser from 'phaser';
import type { OpticsUniforms } from './opticsParams';

export { opticsUniforms, type OpticsInput, type OpticsUniforms } from './opticsParams';

export const WATER_OPTICS = 'WaterOptics';

const FRAG = `
#define SHADER_NAME TIDEPOOL_WATER_OPTICS
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMainSampler;
uniform sampler2D uCaustic;
uniform sampler2D uLightMap;
uniform vec2 uRes;
uniform vec4 uTank;
uniform vec4 uWater;
uniform vec4 uLM;
uniform vec2 uWorld;
uniform float uFloor;
uniform vec4 uDrift;
uniform vec4 uShaft;
uniform vec4 uPhase;
uniform float uLit;
uniform vec3 uWaterCol;
uniform vec3 uLightCol;
uniform vec4 uAmt;
uniform vec4 uAmt2;
uniform float uFlipY;
varying vec2 outTexCoord;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Edge-directed smoothing: find the local edge direction from luma
// differences and average along it (the idea behind FXAA, written here).
vec3 smoothEdges(vec2 uv, vec3 c) {
  vec2 px = 1.0 / uRes;
  float lM = luma(c);
  float lN = luma(texture2D(uMainSampler, uv + vec2(0.0, -px.y)).rgb);
  float lS = luma(texture2D(uMainSampler, uv + vec2(0.0, px.y)).rgb);
  float lE = luma(texture2D(uMainSampler, uv + vec2(px.x, 0.0)).rgb);
  float lW = luma(texture2D(uMainSampler, uv + vec2(-px.x, 0.0)).rgb);
  float lo = min(lM, min(min(lN, lS), min(lE, lW)));
  float hi = max(lM, max(max(lN, lS), max(lE, lW)));
  float range = hi - lo;
  if (range < max(0.04, hi * 0.12)) return c;
  vec2 dir = vec2(lS - lN, lW - lE);
  float len = max(abs(dir.x), abs(dir.y));
  dir = dir / max(len, 0.0001) * px * 0.75;
  vec3 a = texture2D(uMainSampler, uv + dir).rgb;
  vec3 b = texture2D(uMainSampler, uv - dir).rgb;
  vec3 a2 = texture2D(uMainSampler, uv + dir * 2.0).rgb;
  vec3 b2 = texture2D(uMainSampler, uv - dir * 2.0).rgb;
  return c * 0.34 + (a + b) * 0.22 + (a2 + b2) * 0.11;
}

void main() {
  vec2 uv = outTexCoord;
  // Screen position with y measured from the top.
  vec2 sp = vec2(uv.x, mix(uv.y, 1.0 - uv.y, uFlipY));
  vec4 base = texture2D(uMainSampler, uv);
  vec3 col = base.rgb;
  bool inTank = sp.x >= uTank.x && sp.x <= uTank.z && sp.y >= uTank.y && sp.y <= uTank.w;
  if (!inTank) { gl_FragColor = base; return; }
  if (uAmt2.y > 0.5) col = smoothEdges(uv, col);
  vec2 tp = (sp - uTank.xy) / (uTank.zw - uTank.xy);
  vec2 wp = tp * uWorld;
  vec2 lmUv = clamp((sp - uLM.xy) / (uLM.zw - uLM.xy), 0.0, 1.0);
  float lightHere = texture2D(uLightMap, vec2(lmUv.x, mix(lmUv.y, 1.0 - lmUv.y, uAmt2.w))).r;
  float lightTop = texture2D(uLightMap, vec2(lmUv.x, mix(0.02, 0.98, uAmt2.w))).r;
  bool water = sp.x >= uWater.x && sp.x <= uWater.z && sp.y >= uWater.y && sp.y <= uWater.w;

  if (water) {
    float depth = clamp((sp.y - uWater.y) / max(0.0001, uFloor - uWater.y), 0.0, 1.2);
    // Refraction just under the surface: the image wobbles.
    float nearSurf = 1.0 - smoothstep(0.0, 0.07, depth);
    if (nearSurf > 0.0 && uAmt2.x > 0.0) {
      float wob = sin(wp.x * 0.045 + uPhase.x) * 0.6 + sin(wp.x * 0.11 - uPhase.y) * 0.4;
      vec2 off = vec2(wob * 0.0018, wob * 0.0012) * nearSurf;
      col = mix(col, texture2D(uMainSampler, uv + off).rgb, 0.85 * nearSurf);
      // Total internal reflection: the underside of the surface mirrors the water below.
      float band = (sp.y - uWater.y) / max(0.0001, uAmt2.x);
      if (band < 1.0) {
        float my = uWater.y + uAmt2.x + (1.0 - band) * uAmt2.x * 2.2;
        float rip = sin(wp.x * 0.07 + uPhase.z) * 0.5 + sin(wp.x * 0.19 - uPhase.w) * 0.5;
        vec2 msp = vec2(sp.x + rip * 0.002, my + rip * 0.0015);
        vec2 muv = vec2(msp.x, mix(msp.y, 1.0 - msp.y, uFlipY));
        vec3 m = texture2D(uMainSampler, muv).rgb;
        float k = (1.0 - band) * 0.55;
        col = mix(col, m * 0.85 + uLightCol * 0.05 * uLit, k);
        col += uLightCol * pow(max(0.0, 1.0 - band * 3.0), 3.0) * 0.18 * (0.3 + 0.7 * uLit);
      }
    }
    float lum = luma(col);
    // Caustics: two drifting samples of the network, combined so the pattern shimmers.
    if (uAmt.x > 0.0) {
      vec2 cp = wp / 150.0;
      float c1 = texture2D(uCaustic, fract(cp + uDrift.xy)).r;
      float c2 = texture2D(uCaustic, fract(cp * 0.83 + uDrift.zw + 0.37)).r;
      float c = pow((c1 + c2) * 0.5, 1.3) * 1.9;
      // Lit surfaces catch it; the bed most, open water a little (particles).
      float onBed = smoothstep(-0.06, 0.02, depth - 0.92);
      float surfaceK = mix(0.1, 1.0, max(onBed, 0.45 * smoothstep(0.55, 0.85, depth))) * smoothstep(0.0, 0.1, lum);
      float k = uAmt.x * c * surfaceK * lightHere * lightTop * uLit * (1.0 - 0.35 * depth);
      // Bright beds (white sand) take less so the network never clips to white.
      col += col * k * 2.2 * (1.0 - 0.6 * smoothstep(0.35, 0.85, lum)) + uLightCol * k * 0.07;
    }
    // Light shafts from the surface.
    if (uAmt.y > 0.0) {
      float sx = wp.x / 900.0 + wp.y / 2600.0;
      float s1 = texture2D(uCaustic, vec2(fract(sx + uShaft.x), 0.21)).g;
      float s2 = texture2D(uCaustic, vec2(fract(sx * 1.9 + uShaft.y), 0.67)).g;
      float shaft = pow(s1 * 0.65 + s2 * 0.35, 3.0) * 2.2;
      float fall = pow(max(0.0, 1.0 - depth * 0.85), 1.6);
      col += uLightCol * shaft * fall * uAmt.y * lightTop * (0.6 + 0.4 * lightHere) * uLit * 0.22;
    }
    // Absorption (reds first) and in-scattering toward the water colour.
    vec3 absorb = exp(-vec3(0.5, 0.2, 0.14) * uAmt.z * (0.4 + 0.8 * depth));
    float scatter = (1.0 - absorb.g) * (0.35 + 0.65 * uLit);
    col = col * absorb + uWaterCol * scatter * 0.9;
  } else if (uAmt2.z > 0.0) {
    // Air in a land enclosure: humid haze, more higher up where warm air sits.
    float hz = uAmt2.z * (0.35 + 0.65 * (1.0 - tp.y));
    vec3 hazeCol = mix(vec3(0.62, 0.66, 0.6), uLightCol, 0.4) * (0.25 + 0.75 * uLit);
    col = mix(col, hazeCol, hz * 0.22);
    if (uAmt.y > 0.0) {
      float sx = wp.x / 1100.0 + wp.y / 2200.0;
      float s1 = texture2D(uCaustic, vec2(fract(sx + uShaft.z), 0.33)).g;
      float shaft = pow(s1, 3.0) * 2.0 * pow(max(0.0, 1.0 - tp.y), 1.4);
      col += uLightCol * shaft * uAmt.y * uLit * 0.09 * (0.5 + hz);
    }
  }
  // Soft glow around bright highlights (wet skin, fluorescence, specular).
  if (uAmt2.z > 0.0 || uAmt.w > 0.5) {
    vec2 px = 3.0 / uRes;
    vec3 g = texture2D(uMainSampler, uv + vec2(px.x, 0.0)).rgb + texture2D(uMainSampler, uv - vec2(px.x, 0.0)).rgb
           + texture2D(uMainSampler, uv + vec2(0.0, px.y)).rgb + texture2D(uMainSampler, uv - vec2(0.0, px.y)).rgb;
    g = max(g * 0.25 - 0.62, 0.0);
    col += g * 0.55;
  }
  // Glass: fresnel edges, soft diagonal sheen, gentle lens falloff.
  if (uAmt.w > 0.0) {
    float edge = min(tp.x, 1.0 - tp.x) * uWorld.x;
    col += vec3(0.55, 0.75, 0.72) * (1.0 - smoothstep(0.0, 7.0, edge)) * 0.07 * uAmt.w;
    float d1 = abs(tp.x * 0.9 + tp.y * 0.42 - 0.24);
    float d2 = abs(tp.x * 0.9 + tp.y * 0.42 - 0.31);
    float d3 = abs(tp.x * 0.9 + tp.y * 0.42 - 0.86);
    float sheen = (1.0 - smoothstep(0.0, 0.05, d1)) * 0.045 + (1.0 - smoothstep(0.0, 0.012, d2)) * 0.035 + (1.0 - smoothstep(0.0, 0.08, d3)) * 0.025;
    col += vec3(sheen) * uAmt.w * (0.6 + 0.4 * (1.0 - tp.y));
    vec2 q = tp - 0.5;
    col *= 1.0 - dot(q * vec2(0.9, 1.2), q * vec2(0.9, 1.2)) * 0.32 * uAmt.w;
  }
  gl_FragColor = vec4(col, base.a);
}
`;

/**
 * The pipeline. Created once per game (registered on first use) and attached
 * to the tank camera with `camera.setPostPipeline(WATER_OPTICS)`.
 */
export class WaterOpticsFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  uniforms: OpticsUniforms | null = null;
  time = 0;
  caustic: Phaser.Textures.Texture | null = null;
  lightMap: Phaser.Textures.Texture | null = null;
  /** Orientation of render-target uv (1 = y up) and of uploaded canvas textures. */
  flipY = 1;
  canvasFlip = 1;

  constructor(game: Phaser.Game) {
    super({ game, name: WATER_OPTICS, fragShader: FRAG });
  }

  override onPreRender(): void {
    const u = this.uniforms;
    if (!u) return;
    this.set2f('uRes', this.renderer.width, this.renderer.height);
    this.set4f('uTank', ...u.tank);
    this.set4f('uWater', ...u.water);
    this.set4f('uLM', ...u.lm);
    this.set2f('uWorld', ...u.world);
    this.set1f('uFloor', u.floor);
    // Animation offsets are wrapped here in double precision, so phones running the
    // shader at reduced precision never see the pattern jump or stall over long sessions.
    const t = this.time;
    const fr = (v: number) => v - Math.floor(v);
    const tau = Math.PI * 2;
    this.set4f('uDrift', fr(t * 0.011), fr(t * 0.007), fr(-t * 0.009), fr(t * 0.012));
    this.set4f('uShaft', fr(t * 0.0016), fr(-t * 0.0011), fr(t * 0.0008), 0);
    this.set4f('uPhase', (t * 1.7) % tau, (t * 2.3) % tau, (t * 2.1) % tau, (t * 1.3) % tau);
    this.set1f('uLit', u.lit);
    this.set3f('uWaterCol', ...u.waterCol);
    this.set3f('uLightCol', ...u.lightCol);
    this.set4f('uAmt', ...u.amt);
    this.set4f('uAmt2', u.amt2[0], u.amt2[1], u.amt2[2], this.canvasFlip);
    this.set1f('uFlipY', this.flipY);
  }

  override onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    const glTex = (t: Phaser.Textures.Texture | null) => (t?.source[0]?.glTexture ?? null) as Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null;
    const c = glTex(this.caustic);
    const l = glTex(this.lightMap);
    if (!this.uniforms || !c || !l) {
      this.bindAndDraw(renderTarget);
      return;
    }
    this.bind();
    this.bindTexture(c, 1);
    this.bindTexture(l, 2);
    this.set1i('uCaustic', 1);
    this.set1i('uLightMap', 2);
    this.bindAndDraw(renderTarget);
    // Leave unit 0 active for Phaser's batching.
    this.gl.activeTexture(this.gl.TEXTURE0);
  }
}

/** Registers the pipeline with a WebGL renderer once. Returns false under Canvas. */
export function registerWaterOptics(game: Phaser.Game): boolean {
  const r = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!r || !(r as { pipelines?: unknown }).pipelines || game.config.renderType !== Phaser.WEBGL) return false;
  if (!r.pipelines.postPipelineClasses.has(WATER_OPTICS)) r.pipelines.addPostPipeline(WATER_OPTICS, WaterOpticsFX);
  return true;
}
