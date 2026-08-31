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
  /** Normalised position: `(value - min) / (max - min)`. Exceeds 1 when value > max. Read-only. */
  readonly ratio: number;
}

export interface CJKnobEventDetail {
  value: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'cj-knob': CJKnob;
  }
  interface HTMLElementEventMap {
    /** Fired continuously while dragging or on each key press. */
    'cj-input': CustomEvent<CJKnobEventDetail>;
    /** Fired when an interaction settles (pointer release, key press). */
    'cj-change': CustomEvent<CJKnobEventDetail>;
  }
}

export default CJKnob;
