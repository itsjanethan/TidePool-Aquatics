/**
 * Render resolution. The canvas is RES times the logical 480x320 game size.
 * The shop overworld is drawn at logical size with a RES camera zoom (chunky
 * pixel art); the aquarium view draws natively at the higher resolution for
 * finer detail while keeping a pixel-art look.
 */
export const RES = 2;
export const LOGICAL_W = 480;
export const LOGICAL_H = 320;
export const CANVAS_W = LOGICAL_W * RES;
export const CANVAS_H = LOGICAL_H * RES;
