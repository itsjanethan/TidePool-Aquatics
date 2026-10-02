/** Minimal typed event emitter used between simulation, controller and UI. */
export class Emitter<Events extends { [K in keyof Events]: unknown }> {
  private handlers: { [K in keyof Events]?: Array<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): () => void {
    (this.handlers[event] ??= []).push(fn);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): void {
    const list = this.handlers[event];
    if (list) this.handlers[event] = list.filter((h) => h !== fn);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const fn of this.handlers[event] ?? []) fn(payload);
  }

  clear(): void {
    this.handlers = {};
  }
}
