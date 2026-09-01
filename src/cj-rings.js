// -------------------------------------------------
// cj-rings — concentric layout for <cj-knob>
// https://github.com/tanghoong/cj-knob
//
// <cj-rings>
//   <cj-knob readout="none" max="12" value="3"  color="#e8b64c"></cj-knob>
//   <cj-knob readout="none" max="60" value="42" color="#64b5f6"></cj-knob>
//   <cj-knob readout="none" max="60" value="17" color="#ef6c6c"></cj-knob>
//   <div slot="center">12:42:17</div>
// </cj-rings>
//
// It lays out; it does not draw. The children stay ordinary knobs, so ticks,
// gradients, needles and zones all still work on them, and script still talks to
// them directly. All this solves is the arithmetic — nesting rings by hand means
// picking a --cj-size and a --cj-thickness per ring so the gaps and the stroke
// weights come out even, and getting that subtly wrong every time.
// -------------------------------------------------

// A knob's ring sits at 42% of its own box, which is what ties a ring's centre
// radius to the --cj-size it needs.
const RING_AT = 0.42;

const num = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host {
    --cjs-size: 220px;
    display: inline-grid;
    place-items: center;
    inline-size: var(--cjs-size);
    block-size: var(--cjs-size);
    font: inherit;
    /* A dial is an instrument, not text. Its numbers are drawn readings, and
       select-all dragging a blue box across every gauge on a dashboard helps
       nobody. This blocks selection only — pointer and keyboard input, and
       everything a screen reader reads off the ARIA attributes, are untouched. */
    -webkit-user-select: none;
    user-select: none;
  }
  :host([hidden]) { display: none; }

  /* every ring and the centre share one cell, so they stack on one axis */
  ::slotted(*) { grid-area: 1 / 1; }
  /* a ring the box has no room left for is dropped rather than drawn inside out */
  ::slotted([data-cjs-clipped]) { display: none; }

  .center { grid-area: 1 / 1; display: grid; place-items: center; pointer-events: none; }
</style>

<slot></slot>
<div class="center"><slot name="center"></slot></div>
`;

export class CJRings extends HTMLElement {
  static observedAttributes = ['thickness', 'gap'];

  #root;
  #slot;
  #observer;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.append(template.content.cloneNode(true));
    this.#slot = this.#root.querySelector('slot:not([name])');
    this.#slot.addEventListener('slotchange', () => this.#layout());
  }

  connectedCallback() {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'group');
    // the layout is in pixels, so it has to be redone whenever the box changes —
    // which is also what makes a stack of rings responsive for free
    this.#observer = new ResizeObserver(() => this.#layout());
    this.#observer.observe(this);
    this.#layout();
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#observer = null;
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#layout();
  }

  /** The rings, outermost first — the order they appear in. */
  get rings() {
    return this.#slot.assignedElements().filter((el) => el.matches?.('cj-knob'));
  }

  #layout() {
    const rings = this.rings;
    if (!rings.length) return;

    const size = this.clientWidth || parseFloat(getComputedStyle(this).inlineSize) || 0;
    if (!size) return;

    // both are fractions of the box, so a stack keeps its proportions at any scale
    const stroke = size * num(this.getAttribute('thickness'), 0.043);
    const gap = size * num(this.getAttribute('gap'), 0.065);
    const step = stroke + gap;

    rings.forEach((el, i) => {
      // the outermost ring fills the box; each one inside steps in by a stroke and a gap
      const centre = RING_AT * size - i * step;
      if (centre <= stroke) {
        el.setAttribute('data-cjs-clipped', '');
        return;
      }
      el.removeAttribute('data-cjs-clipped');
      // work back from where the ring must sit to the box the knob needs
      const box = centre / RING_AT;
      el.style.setProperty('--cj-size', `${box.toFixed(2)}px`);
      // --cj-thickness is in viewBox units, so the same pixel weight is a
      // different number on every ring
      el.style.setProperty('--cj-thickness', (100 * stroke / box).toFixed(3));
    });
  }
}

if (!customElements.get('cj-rings')) customElements.define('cj-rings', CJRings);

export default CJRings;
