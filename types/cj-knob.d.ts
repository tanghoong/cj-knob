export declare class CJKnob extends HTMLElement {
  /** Lower bound of the scale. Attribute: `min`. Default `0`. */
  min: number;
  /** Upper bound of the scale. Attribute: `max`. Default `100`. */
  max: number;
  /** Current value. Attribute: `value`. Values above `max` draw the inner overflow ring. */
  value: number;
  /** Increment used by drag-snapping and arrow keys. Attribute: `step`. Default `1`. */
  step: number;
  /** Turns the knob into a draggable/keyboard-operable slider. Attribute: `interactive`. */
  interactive: boolean;
  /**
   * Two handles with a band between them instead of one value. Attribute:
   * `range="20 70"`. Reads back as `{low, high}`, or `null` on an ordinary dial;
   * assigning takes either `[20, 70]` or `{low: 20, high: 70}`.
   */
  range: CJKnobRange | [number, number] | null;
  /**
   * A knob with no ends: dragging reports movement rather than position, so the
   * value keeps counting past `max` and below `min` while the ring wraps round.
   * Attribute: `endless`.
   */
  endless: boolean;
  /**
   * Presentational attributes with no property mirror:
   * `sweep`, `start`, `benchmark`, `zones`, `segments`, `ticks`, `tick-major`,
   * `needle`, `labels`, `label-radius`, `readout`, `unit`, `decimals`, `label`,
   * `color`, `disabled`, `animate-in`, `liquid`, `rotating`, `value-2`,
   * `gradient`, `ballistics`, `peak-hold`, `peak-fall`. Set them with `setAttribute`.
   */
  /** Normalised position: `(value - min) / (max - min)`. Exceeds 1 when value > max. Read-only. */
  readonly ratio: number;
  /**
   * What the dial is currently drawing. Equal to `value` unless `ballistics` is
   * set, in which case it lags behind — fast on the way up, slow on the way down.
   * Read-only.
   */
  readonly shown: number;
  /**
   * The highest reading still being held, or `null` without `peak-hold`.
   * Read-only.
   */
  readonly peak: number | null;
}

export interface CJKnobRange {
  low: number;
  high: number;
}

export interface CJKnobEventDetail {
  value: number;
}

/** What `cj-input` and `cj-change` carry from a `range` dial instead. */
export interface CJKnobRangeEventDetail {
  low: number;
  high: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'cj-knob': CJKnob;
  }
  interface HTMLElementEventMap {
    /** Fired continuously while dragging or on each key press. */
    'cj-input': CustomEvent<CJKnobEventDetail | CJKnobRangeEventDetail>;
    /** Fired when an interaction settles (pointer release, key press). */
    'cj-change': CustomEvent<CJKnobEventDetail | CJKnobRangeEventDetail>;
  }
}

export default CJKnob;
