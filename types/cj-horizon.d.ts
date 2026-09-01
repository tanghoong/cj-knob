export declare class CJHorizon extends HTMLElement {
  /** Nose-up in degrees, clamped to ±90. Positive slides the horizon down the face. */
  pitch: number;
  /** Right bank in degrees, clamped to ±180. Positive lifts the horizon's right-hand end. */
  roll: number;
  /** The attitude in words, e.g. `"climbing, left bank"`. Also used as the accessible name. */
  readonly attitude: string;
}

declare global {
  interface HTMLElementTagNameMap {
    'cj-horizon': CJHorizon;
  }
}

export default CJHorizon;
