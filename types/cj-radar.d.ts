export interface CJBlip {
  /** Bearing in degrees, 0 = north, clockwise. */
  bearing: number;
  /** Distance from the centre, 0 at the origin to 1 at the outer ring. */
  range: number;
  label?: string;
}

export declare class CJRadar extends HTMLElement {
  /** Contacts on the scope. Assigning replaces the whole set and redraws. */
  blips: CJBlip[];
  /** Seconds per revolution of the sweep. `0` stops it. Attribute: `period`. */
  period: number;

  addBlip(blip: CJBlip): this;
  clearBlips(): this;
  /** Replace the contacts with `n` at random bearings and ranges. */
  scatter(n?: number): this;
}

declare global {
  interface HTMLElementTagNameMap {
    'cj-radar': CJRadar;
  }
  interface HTMLElementEventMap {
    /** Fired each time the sweep's leading edge crosses a contact. */
    'cj-detect': CustomEvent<CJBlip & { index: number }>;
    /** Fired when a click on an `interactive` scope adds a contact. */
    'cj-blip': CustomEvent<{ bearing: number; range: number; count: number }>;
  }
}

export default CJRadar;
