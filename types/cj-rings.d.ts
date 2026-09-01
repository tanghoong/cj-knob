import type { CJKnob } from './cj-knob';

export declare class CJRings extends HTMLElement {
  /**
   * The slotted knobs, outermost first — the order they appear in the markup.
   * cj-rings sizes them; it does not draw them, so each stays an ordinary knob
   * you can set `value` on directly.
   */
  readonly rings: CJKnob[];
}

declare global {
  interface HTMLElementTagNameMap {
    'cj-rings': CJRings;
  }
}

export default CJRings;
