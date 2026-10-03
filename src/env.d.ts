/** Injected by vite.config.ts from package.json. */
declare const __APP_VERSION__: string;
/**
 * True only in developer builds (`npm run dev`, `npm run sandbox`, `npm run build:sandbox`).
 * The public production build replaces it with `false`, so every
 * `if (__DEV_TOOLS__)` branch and its dynamic imports are removed.
 */
declare const __DEV_TOOLS__: boolean;
