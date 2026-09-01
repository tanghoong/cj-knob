export declare class CJTrace extends HTMLElement {
  /** How many samples the window holds. Attribute: `samples` (default 240). */
  samples: number;
  /** Bottom of the vertical scale. Attribute: `min` (default 0). */
  min: number;
  /** Top of the vertical scale. Attribute: `max` (default 100). */
  max: number;
  /**
   * Beats per minute when the trace drives itself with a built-in ECG. 0 or
   * absent means it does not, and you feed it with `push`. Attribute: `beat`.
   */
  beat: number;
  /** Samples written per second while self-driving — the paper speed. Read-only. */
  readonly rate: number;
  /** The most recent sample, or `null` before anything has been written. Read-only. */
  readonly last: number | null;
  /**
   * How loud the talker is right now, 0..1, while `voice` is driving the trace.
   * Exactly zero between phrases. Read-only.
   */
  readonly level: number;
  /** Whether anyone is talking. Changes fire `cj-speech`. Read-only. */
  readonly speaking: boolean;
  /** Write one sample. This is the whole input API; everything else is styling. */
  push(value: number): void;
  /** Wipe the window back to empty. */
  clear(): void;
  /**
   * Presentational attributes with no property mirror:
   * `shape` (`"line"` | `"ring"`), `mode` (`"sweep"` | `"scroll"`), `points`,
   * `voice` (a built-in talker, optionally 0..1 for how loud), `mirror`
   * (the waveform straddles the centre line), `rate`, `sweep`, `start`,
   * `amplitude`, `grid`, `pen`, `readout`,
   * `readout-at` (`"top left"` and the other three corners), `unit`,
   * `decimals`, `label`, `color`. Set them with `setAttribute`.
   */
}

declare global {
  interface HTMLElementTagNameMap {
    'cj-trace': CJTrace;
  }
  interface HTMLElementEventMap {
    /** Fired when a `voice` trace starts or stops talking. */
    'cj-speech': CustomEvent<{ speaking: boolean; level: number }>;
  }
}

export default CJTrace;
