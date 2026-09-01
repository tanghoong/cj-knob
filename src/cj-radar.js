// -------------------------------------------------
// cj-radar — a zero-dependency SVG radar scope
// https://github.com/tanghoong/cj-knob
//
// <cj-radar period="4" blips="45:0.6, 210:0.35"></cj-radar>
//
// A sibling of <cj-knob> rather than a mode of it: a knob describes one value
// on a rim, a radar describes many contacts across a whole field. Different
// geometry, different API, so it gets its own element and its own file.
// -------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 46;            // field radius in the 0-100 viewBox
const TAU = Math.PI * 2;

const num = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host {
    /* ---- public theming API ---- */
    --cjr-size: 260px;
    --cjr-field: #04140d;
    --cjr-grid: #1f7a52;
    --cjr-beam: #35e08a;
    --cjr-blip: #35e08a;
    --cjr-blip-hot: #eaffef;
    --cjr-mark: #4f9e78;
    --cjr-mark-size: 6px;
    --cjr-grid-width: .6;
    --cjr-glow: 6px;

    display: inline-grid;
    place-items: center;
    inline-size: var(--cjr-size);
    block-size: var(--cjr-size);
    font: inherit;
    -webkit-tap-highlight-color: transparent;
  }
  :host([hidden]) { display: none; }
  :host([interactive]) { cursor: crosshair; }
  :host(:focus-visible) { outline: 2px solid var(--cjr-beam); outline-offset: 2px; }

  svg, .beam { grid-area: 1 / 1; inline-size: 100%; block-size: 100%; }

  .field { fill: var(--cjr-field); }
  .grid { fill: none; stroke: var(--cjr-grid); stroke-width: var(--cjr-grid-width); }
  .grid line { stroke: var(--cjr-grid); stroke-width: var(--cjr-grid-width); }

  /* The sweep is a rotating conic wedge. CSS paints the gradient far more cheaply
     than stacking a dozen SVG wedges, and masking it to a circle keeps it inside
     the scope. Its angle is driven from script so blips can be tested against it. */
  .beam {
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      color-mix(in srgb, var(--cjr-beam) 55%, transparent) 0deg,
      color-mix(in srgb, var(--cjr-beam) 12%, transparent) 34deg,
      transparent 70deg,
      transparent 360deg);
    rotate: var(--cjr-beam-angle, 0deg);
    /* the wedge trails BEHIND the leading edge, so shift it back by its own width */
    transform: rotate(-70deg);
    pointer-events: none;
  }
  :host([period="0"]) .beam, :host(:not([period])) .beam { display: none; }
  /* with no sweep passing over them, static contacts need their own contrast */
  :host([period="0"]) .blips circle,
  :host(:not([period])) .blips circle { opacity: .9; }

  .blips circle {
    fill: var(--cjr-blip);
    opacity: .34;
    transition: opacity 1.6s linear, r 1.6s linear;
  }
  /* a contact brightens as the beam crosses it, then fades until the next pass */
  .blips circle[data-ping] {
    fill: var(--cjr-blip-hot);
    opacity: 1;
    transition: none;
    filter: drop-shadow(0 0 var(--cjr-glow) var(--cjr-blip));
  }

  .marks text {
    fill: var(--cjr-mark);
    font-size: var(--cjr-mark-size);
    font-family: inherit;
    font-weight: 600;
    text-anchor: middle;
    dominant-baseline: central;
  }

  @media (prefers-reduced-motion: reduce) {
    .beam { display: none; }
    .blips circle { opacity: .8; transition: none; }
  }
</style>

<svg viewBox="0 0 100 100" part="svg" aria-hidden="true" focusable="false">
  <circle class="field" part="field" cx="50" cy="50" r="46"/>
  <g class="grid" part="grid"></g>
  <g class="blips" part="blips"></g>
  <g class="marks" part="marks"></g>
</svg>
<div class="beam" part="beam"></div>
`;

export class CJRadar extends HTMLElement {
  static observedAttributes = ['rings', 'spokes', 'period', 'labels', 'blips', 'interactive', 'max-range'];

  #root;
  #els;
  #blips = [];
  #frame = 0;
  #angle = 0;
  #prevAngle = 0;
  #last = 0;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.append(template.content.cloneNode(true));
    const q = (s) => this.#root.querySelector(s);
    this.#els = { grid: q('.grid'), blips: q('.blips'), marks: q('.marks'), svg: q('svg') };
  }

  // ---- public API --------------------------------------------------------
  /** Contacts on the scope: [{ bearing: 0-360, range: 0-1, label? }] */
  get blips() { return this.#blips.map((b) => ({ ...b })); }
  set blips(list) {
    this.#blips = (list ?? []).map((b) => ({
      bearing: ((num(b.bearing, 0) % 360) + 360) % 360,
      range: clamp(num(b.range, 0.5), 0, 1),
      label: b.label ?? '',
    }));
    this.#drawBlips();
  }

  addBlip(blip) {
    this.blips = [...this.#blips, blip];
    return this;
  }

  clearBlips() {
    this.blips = [];
    return this;
  }

  /** Scatter n contacts at random bearings and ranges. */
  scatter(n = 6) {
    this.blips = Array.from({ length: n }, () => ({
      bearing: Math.random() * 360,
      range: 0.18 + Math.random() * 0.76,
    }));
    return this;
  }

  get period() { return Math.max(0, num(this.getAttribute('period'), 0)); }
  set period(v) { this.setAttribute('period', v); }

  // ---- lifecycle ---------------------------------------------------------
  connectedCallback() {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
    if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', 'Radar scope');
    this.#syncInteractive();
    this.#render();
    this.#start();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.#frame);
    this.removeEventListener('pointerdown', this.#onPointerDown);
  }

  attributeChangedCallback(name) {
    if (!this.isConnected) return;
    if (name === 'interactive') this.#syncInteractive();
    this.#render();
    this.#start();
  }

  // ---- drawing -----------------------------------------------------------
  #render() {
    const rings = clamp(Math.round(num(this.getAttribute('rings'), 4)), 1, 10);
    const spokes = clamp(Math.round(num(this.getAttribute('spokes'), 8)), 0, 36);

    const frag = document.createDocumentFragment();
    for (let i = 1; i <= rings; i++) {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', '50');
      c.setAttribute('cy', '50');
      c.setAttribute('r', (R * i / rings).toFixed(2));
      frag.append(c);
    }
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU - Math.PI / 2;
      const l = document.createElementNS(SVG_NS, 'line');
      l.setAttribute('x1', '50');
      l.setAttribute('y1', '50');
      l.setAttribute('x2', (50 + Math.cos(a) * R).toFixed(2));
      l.setAttribute('y2', (50 + Math.sin(a) * R).toFixed(2));
      frag.append(l);
    }
    this.#els.grid.replaceChildren(frag);

    // bearing labels, kept just inside the outer ring
    const spec = this.getAttribute('labels');
    if (!spec) {
      this.#els.marks.replaceChildren();
    } else {
      const parts = spec.split(',').map((s) => s.trim());
      const mf = document.createDocumentFragment();
      parts.forEach((text, i) => {
        if (!text) return;
        const a = (i / parts.length) * TAU - Math.PI / 2;
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', (50 + Math.cos(a) * (R - 5)).toFixed(2));
        t.setAttribute('y', (50 + Math.sin(a) * (R - 5)).toFixed(2));
        t.textContent = text;
        mf.append(t);
      });
      this.#els.marks.replaceChildren(mf);
    }

    // declarative contacts: blips="45:0.6, 210:0.35"
    const bspec = this.getAttribute('blips');
    if (bspec !== null) {
      this.blips = bspec.split(',').map((part) => {
        const [b, r] = part.split(':');
        return { bearing: num(b, 0), range: num(r, 0.5) };
      }).filter((b) => Number.isFinite(b.bearing));
    } else {
      this.#drawBlips();
    }
  }

  #drawBlips() {
    const frag = document.createDocumentFragment();
    for (const b of this.#blips) {
      // bearing 0 is north, and clockwise from there
      const a = (b.bearing - 90) * Math.PI / 180;
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', (50 + Math.cos(a) * b.range * R).toFixed(2));
      c.setAttribute('cy', (50 + Math.sin(a) * b.range * R).toFixed(2));
      c.setAttribute('r', '1.9');
      frag.append(c);
    }
    this.#els.blips.replaceChildren(frag);
  }

  // ---- the sweep ---------------------------------------------------------
  #start() {
    cancelAnimationFrame(this.#frame);
    if (!this.period) {
      this.style.setProperty('--cjr-beam-angle', '0deg');
      return;
    }
    this.#last = performance.now();
    const tick = (now) => {
      const dt = (now - this.#last) / 1000;
      this.#last = now;
      this.#prevAngle = this.#angle;
      this.#angle = (this.#angle + (dt / this.period) * 360) % 360;
      this.style.setProperty('--cjr-beam-angle', `${this.#angle.toFixed(2)}deg`);
      this.#detect();
      this.#frame = requestAnimationFrame(tick);
    };
    this.#frame = requestAnimationFrame(tick);
  }

  /** Light up any contact the beam's leading edge has just crossed. */
  #detect() {
    const nodes = this.#els.blips.children;
    const from = this.#prevAngle;
    const to = this.#angle;
    for (let i = 0; i < this.#blips.length; i++) {
      const bearing = this.#blips[i].bearing;
      // handle the wrap through 0 without a modulo branch per blip
      const crossed = to >= from
        ? bearing > from && bearing <= to
        : bearing > from || bearing <= to;
      if (crossed) {
        const el = nodes[i];
        if (!el) continue;
        el.setAttribute('data-ping', '');
        // drop the flag on the next frame so the CSS transition can fade it out
        requestAnimationFrame(() => el.removeAttribute('data-ping'));
        this.dispatchEvent(new CustomEvent('cj-detect', {
          detail: { index: i, ...this.#blips[i] }, bubbles: true,
        }));
      }
    }
  }

  // ---- click to add a contact -------------------------------------------
  #syncInteractive() {
    if (this.hasAttribute('interactive')) {
      if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
      this.addEventListener('pointerdown', this.#onPointerDown);
    } else {
      this.removeAttribute('tabindex');
      this.removeEventListener('pointerdown', this.#onPointerDown);
    }
  }

  #onPointerDown = (e) => {
    const box = this.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    const range = clamp(Math.hypot(dx, dy) / (box.width / 2 * (R / 50)), 0, 1);
    const bearing = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
    this.addBlip({ bearing, range });
    this.dispatchEvent(new CustomEvent('cj-blip', {
      detail: { bearing, range, count: this.#blips.length }, bubbles: true,
    }));
  };
}

if (!customElements.get('cj-radar')) customElements.define('cj-radar', CJRadar);

export default CJRadar;
