export declare class CJLevel extends HTMLElement {
  /** Lower bound of the scale. Attribute: `min`. Default `0`. */
  min: number;
  /** Upper bound of the scale. Attribute: `max`. Default `100`. */
  max: number;
  /** Current value. Attribute: `value`. */
  value: number;
  /** Normalised fill, 0 at the bottom of the column to 1 at the top. Read-only. */
  readonly ratio: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'cj-level': CJLevel;
  }
}

export default CJLevel;
