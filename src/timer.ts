/**
 * GameTimer — drives the simulation tick and animation render loop.
 *
 * Automatically pauses both loops when the document becomes hidden (window
 * minimized / tab switched) and resumes them when visible again, resetting
 * the frame-delta clock so no stale time accumulates.
 */

type TickCallback = () => void;
type FrameCallback = (tDelta: number) => void;

export class GameTimer {
  private readonly tickMs: number;

  private tickCallbacks: TickCallback[] = [];
  private frameCallbacks: FrameCallback[] = [];

  private tickIntervalId: ReturnType<typeof setInterval> | null = null;
  private rafId: number | null = null;
  private lastFrameTime: number | null = null;

  private stopped = false;

  constructor(tickMs: number) {
    this.tickMs = tickMs;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._pauseLoops();
      } else {
        this._resumeLoops();
      }
    });
  }

  /** Subscribe to simulation ticks (fired every `tickMs` ms while visible). */
  onTick(cb: TickCallback): void {
    this.tickCallbacks.push(cb);
  }

  /**
   * Subscribe to animation frames.
   * `tDelta` is seconds elapsed since the previous frame (always > 0,
   * never stale from a hidden-window gap).
   */
  onFrame(cb: FrameCallback): void {
    this.frameCallbacks.push(cb);
  }

  /** Start both loops. Call once after all subscribers are registered. */
  start(): void {
    this.stopped = false;
    this._startTick();
    this._startRaf();
  }

  /** Permanently stop both loops. */
  stop(): void {
    this.stopped = true;
    this._pauseLoops();
  }

  // ── private ────────────────────────────────────────────────────────────────

  private _startTick(): void {
    if (this.tickIntervalId !== null) return;
    this.tickIntervalId = setInterval(() => {
      for (const cb of this.tickCallbacks) cb();
    }, this.tickMs);
  }

  private _startRaf(): void {
    if (this.rafId !== null) return;
    this.lastFrameTime = null; // will be initialised on the first frame
    const loop = (now: number) => {
      if (this.stopped) return;

      const tDelta = this.lastFrameTime === null ? 0 : (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;

      if (tDelta > 0) {
        for (const cb of this.frameCallbacks) cb(tDelta);
      }

      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private _pauseLoops(): void {
    if (this.tickIntervalId !== null) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastFrameTime = null;
  }

  private _resumeLoops(): void {
    if (this.stopped) return;
    this._startTick();
    this._startRaf();
  }
}
