export declare class CJHeat extends HTMLElement {
  /**
   * The values as given. Assigning an array is the same as setting `values=`.
   * Reading returns a copy, so mutating it does not change the ring.
   */
  values: number[];
  /** How many concentric rings to split the list across. Attribute: `rows` (default 1). */
  rows: number;
  /** The value the pointer is over, or `null`. Needs `interactive`. Read-only. */
  readonly hot: number | null;
  /**
   * Presentational attributes with no property mirror:
   * `shape` (`"cells"` | `"bars"`), `scale`, `min`, `max`, `sweep`, `start`,
   * `label`, `unit`, `decimals`, `readout`, `interactive`.
   * Set them with `setAttribute`.
   *
   * Without `min`/`max` the colour scale spans the data's own extremes.
   */
}

export interface CJHeatHoverDetail {
  /** Index into `values`, or -1 when the pointer left the cells. */
  index: number;
  /** The value at that index, or `null`. */
  value: number | null;
}

declare global {
  interface HTMLElementTagNameMap {
    'cj-heat': CJHeat;
  }
  interface HTMLElementEventMap {
    /** Fired when the pointer moves onto a different cell, or off the ring. */
    'cj-hover': CustomEvent<CJHeatHoverDetail>;
  }
}

export default CJHeat;
