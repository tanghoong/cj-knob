// -------------------------------------------------
// cj-heat — a ring of cells coloured by their own values
// https://github.com/tanghoong/cj-knob
//
// <cj-heat values="4,6,9,14,19,23,25,22,17,11,7,5" label="year" unit="°C"></cj-heat>
// <cj-heat values="..." rows="7" scale="#0b2b4a,#1f6feb,#3fb950,#d29922,#f85149"></cj-heat>
//
// A knob shows one value on a ring. This shows a hundred of them on the same
// ring, by colour instead of by length — twenty-four hours round a clock face,
// a week of load, a year of temperature. It is the one reading a dial cannot
// give you: not where the needle is, but the shape of everything it has done.
//
// rows= splits the list into concentric rings, oldest outermost, which turns the
// same data into a polar calendar: seven rows of twenty-four is a week you can
// read the daily rhythm off at a glance.
// -------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
const PATH_LENGTH = 100;   // every ring normalised, so cell maths ignores radius

const num = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };

const parseColor = (c) => {
  const h = c.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const v = parseInt(full, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

const mixColor = (a, b, t) =>
  `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`;

const DEFAULT_SCALE = '#123f6d,#1f6feb,#3fb950,#d29922,#f85149';

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host {
    /* ---- public theming API ---- */
    --cj-size: 220px;
    --cj-thickness: 9;
    --cj-gap: .12;              /* of a cell, so it holds at any cell count */
    --cj-empty: rgba(127, 127, 127, .16);
    --cj-num-size: max(13px, calc(var(--cj-size) * .19));
    --cj-label-size: max(9px, calc(var(--cj-size) * .075));
    --cj-text: #14161a;
    --cj-muted: #6b7280;

    display: inline-grid;
    place-items: center;
    inline-size: var(--cj-size);
    block-size: var(--cj-size);
    color: var(--cj-text);
    font: inherit;
    -webkit-tap-highlight-color: transparent;
  }
  :host([hidden]) { display: none; }
  :host([interactive]) { cursor: crosshair; }

  @media (prefers-color-scheme: dark) {
    :host { --cj-text: #f2f4f7; --cj-muted: #98a2b3; }
  }

  svg { grid-area: 1 / 1; inline-size: 100%; block-size: 100%; overflow: visible; }
  .cells { transform: rotate(var(--cj-start, -90deg)); transform-origin: 50% 50%; transform-box: view-box; }
  circle { fill: none; stroke-linecap: butt; }

  /* the cell under the pointer lifts out of the ring rather than changing colour,
     which would be indistinguishable from it simply holding a different value */
  circle.hot { stroke-width: calc(var(--cj-cell-width, 9) * 1.35); }

  .center { grid-area: 1 / 1; display: grid; place-items: center; text-align: center; pointer-events: none; line-height: 1.05; }
  .readout {
    font-size: var(--cj-num-size);
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    letter-spacing: -.02em;
  }
  .readout[hidden] { display: none; }
  .unit { font-size: .5em; font-weight: 600; margin-inline-start: .12em; color: var(--cj-muted); }
  .label {
    font-size: var(--cj-label-size);
    font-weight: 600;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--cj-muted);
  }
  .label[hidden] { display: none; }
</style>

<svg viewBox="0 0 100 100" part="svg" aria-hidden="true" focusable="false">
  <g class="cells" part="cells"></g>
</svg>

<div class="center" part="center">
  <div class="readout" part="readout"><span class="num"></span><span class="unit"></span></div>
  <div class="label" part="label" hidden></div>
</div>
`;

export class CJHeat extends HTMLElement {
  static observedAttributes = [
    'values', 'scale', 'min', 'max', 'rows', 'sweep', 'start',
    'label', 'unit', 'decimals', 'readout', 'interactive',
  ];

  #root;
  #els;
  #cells = [];      // one <circle> per value, in the order they were given
  #values = [];
  #hot = -1;
  #sig = '';

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.append(template.content.cloneNode(true));
    this.#els = {
      cells: this.#root.querySelector('.cells'),
      readout: this.#root.querySelector('.readout'),
      num: this.#root.querySelector('.num'),
      unit: this.#root.querySelector('.unit'),
      label: this.#root.querySelector('.label'),
    };
  }

  connectedCallback() {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
    this.#read();
    this.#render();
    this.#syncInteractivity();
  }

  disconnectedCallback() {
    this.removeEventListener('pointermove', this.#onMove);
    this.removeEventListener('pointerleave', this.#onLeave);
  }

  attributeChangedCallback(name) {
    if (name === 'values') this.#read();
    if (name === 'interactive') this.#syncInteractivity();
    if (this.isConnected) this.#render();
  }

  /** The values as given. Assigning an array is the same as setting values=. */
  get values() { return this.#values.slice(); }
  set values(v) { this.setAttribute('values', Array.isArray(v) ? v.join(',') : v); }

  get rows() { return Math.max(1, Math.round(num(this.getAttribute('rows'), 1))); }
  set rows(v) { this.setAttribute('rows', v); }

  /** The value the pointer is over, or null. */
  get hot() { return this.#hot >= 0 ? this.#values[this.#hot] : null; }

  #read() {
    const spec = this.getAttribute('values') || '';
    this.#values = spec.split(/[\s,]+/).filter(Boolean).map(Number);
  }

  /**
   * The colour range. Given min= and max= it is those; otherwise the data's own
   * extremes, so a heat ring is readable before anyone has worked out its scale.
   */
  get #domain() {
    const finite = this.#values.filter(Number.isFinite);
    const lo = num(this.getAttribute('min'), finite.length ? Math.min(...finite) : 0);
    const hi = num(this.getAttribute('max'), finite.length ? Math.max(...finite) : 1);
    return hi === lo ? { lo, hi: lo + 1 } : { lo, hi };
  }

  #stops() {
    const spec = this.getAttribute('scale') || DEFAULT_SCALE;
    const stops = spec.split(',').map((s) => s.trim()).filter(Boolean).map(parseColor);
    return stops.length >= 2 ? stops : [parseColor('#1f6feb'), parseColor('#f85149')];
  }

  /** how far apart the rows sit, shared by the drawing and the hit test */
  #step(rows, thickness) {
    const INNER = 22;   // the middle stays clear for the readout and its label
    return rows > 1 ? Math.min(thickness * 1.35, (42 - INNER) / (rows - 1)) : 0;
  }

  #colorAt(t, stops) {
    const at = clamp(t, 0, 1) * (stops.length - 1);
    const lo = Math.min(Math.floor(at), stops.length - 2);
    return mixColor(stops[lo], stops[lo + 1], at - lo);
  }

  #render() {
    if (!this.isConnected) return;
    const n = this.#values.length;
    const rows = this.rows;
    const sweep = clamp(num(this.getAttribute('sweep'), 360), 1, 360);
    const start = num(this.getAttribute('start'), -90);
    const thickness = num(getComputedStyle(this).getPropertyValue('--cj-thickness'), 9);
    const gapFrac = clamp(num(getComputedStyle(this).getPropertyValue('--cj-gap'), 0.12), 0, 0.9);

    this.style.setProperty('--cj-start', `${start}deg`);

    // A cell is a dash: geometry that only changes when the shape of the data
    // does. Rebuilding a year of them because one value moved would throw away
    // three hundred nodes to change three hundred colours.
    const perRow = Math.ceil(n / rows);
    const sig = `${n}|${rows}|${sweep}|${thickness}|${gapFrac}`;
    if (sig !== this.#sig) {
      this.#sig = sig;
      const frag = document.createDocumentFragment();
      this.#cells = [];
      // Rows step inward from the rim, oldest outermost. They are squeezed to
      // fit between the rim and a reserved middle rather than marching on to the
      // centre: seven rows at their natural spacing would tile the whole disc
      // and bury the readout under the last of them.
      const step = this.#step(rows, thickness);
      // A stroke wider than the spacing makes neighbouring rows overlap, and
      // seven rows of it read as one thick ring cut into wedges. Narrow the
      // cells to whatever the spacing actually allows.
      const width = rows > 1 ? Math.min(thickness, step * 0.78) : thickness;
      const arc = (sweep / 360) * PATH_LENGTH;
      const cell = perRow ? arc / perRow : arc;
      const gap = cell * gapFrac;
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const r = 42 - row * step;
        if (r <= width) break;          // no room left; drop the row rather than invert it
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', '50');
        c.setAttribute('cy', '50');
        c.setAttribute('r', r.toFixed(2));
        c.setAttribute('pathLength', String(PATH_LENGTH));
        c.setAttribute('stroke-width', width.toFixed(2));
        c.setAttribute('stroke-dasharray', `${(cell - gap).toFixed(3)} ${PATH_LENGTH}`);
        // a negative offset pushes the dash along the path to where the cell starts
        c.setAttribute('stroke-dashoffset', (-(col * cell + gap / 2)).toFixed(3));
        frag.append(c);
        this.#cells.push(c);
      }
      this.#els.cells.replaceChildren(frag);
      this.style.setProperty('--cj-cell-width', width.toFixed(2));
    }

    const { lo, hi } = this.#domain;
    const stops = this.#stops();
    for (let i = 0; i < this.#cells.length; i++) {
      const v = this.#values[i];
      const c = this.#cells[i];
      const colour = Number.isFinite(v)
        ? this.#colorAt((v - lo) / (hi - lo), stops)
        : getComputedStyle(this).getPropertyValue('--cj-empty').trim() || 'rgba(127,127,127,.16)';
      if (c.getAttribute('stroke') !== colour) c.setAttribute('stroke', colour);
      c.classList.toggle('hot', i === this.#hot);
    }

    this.#renderText();
  }

  #renderText() {
    const mode = this.getAttribute('readout') ?? 'auto';
    const hide = mode === 'none';
    this.#els.readout.toggleAttribute('hidden', hide);
    if (!hide) {
      const decimals = clamp(num(this.getAttribute('decimals'), 0), 0, 6);
      const finite = this.#values.filter(Number.isFinite);
      // with nothing under the pointer the middle shows the average, which is the
      // one number that says something about the whole ring rather than one cell
      const v = this.#hot >= 0
        ? this.#values[this.#hot]
        : (finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : NaN);
      setText(this.#els.num, Number.isFinite(v) ? v.toFixed(decimals) : '—');
      setText(this.#els.unit, this.getAttribute('unit') ?? '');
    }
    const label = this.getAttribute('label');
    setText(this.#els.label, label ?? '');
    this.#els.label.toggleAttribute('hidden', !label);
    if (label && !this.hasAttribute('aria-label')) this.setAttribute('aria-label', label);
    this.setAttribute('aria-valuetext', this.#values.join(', '));
  }

  // ---- pointer -----------------------------------------------------------
  #syncInteractivity() {
    if (this.hasAttribute('interactive')) {
      this.addEventListener('pointermove', this.#onMove);
      this.addEventListener('pointerleave', this.#onLeave);
    } else {
      this.removeEventListener('pointermove', this.#onMove);
      this.removeEventListener('pointerleave', this.#onLeave);
      this.#onLeave();
    }
  }

  /** which cell the pointer is over, by angle and by distance from the centre */
  #cellAt(clientX, clientY) {
    const n = this.#values.length;
    if (!n) return -1;
    const box = this.getBoundingClientRect();
    const size = Math.min(box.width, box.height) || 1;
    const dx = clientX - (box.left + box.width / 2);
    const dy = clientY - (box.top + box.height / 2);
    const sweep = clamp(num(this.getAttribute('sweep'), 360), 1, 360);
    const start = num(this.getAttribute('start'), -90);
    const rows = this.rows;
    const perRow = Math.ceil(n / rows);
    const thickness = num(getComputedStyle(this).getPropertyValue('--cj-thickness'), 9);

    // the viewBox is 100 wide however big the element is drawn
    const r = Math.hypot(dx, dy) / size * 100;
    const step = this.#step(rows, thickness);
    const width = rows > 1 ? Math.min(thickness, step * 0.78) : thickness;
    const row = step ? Math.round((42 - r) / step) : 0;
    if (row < 0 || row >= rows) return -1;
    if (Math.abs(42 - row * step - r) > width / 2) return -1;

    let deg = Math.atan2(dy, dx) * 180 / Math.PI - start;
    deg = ((deg % 360) + 360) % 360;
    if (deg > sweep) return -1;
    const col = Math.floor((deg / sweep) * perRow);
    const i = row * perRow + col;
    return i < n ? i : -1;
  }

  // arrow fields, not methods: private methods cannot be removeEventListener-ed
  // by identity unless the same reference is held, which a field guarantees
  #onMove = (e) => {
    const i = this.#cellAt(e.clientX, e.clientY);
    if (i === this.#hot) return;
    this.#hot = i;
    this.#render();
    this.dispatchEvent(new CustomEvent('cj-hover', {
      detail: { index: i, value: i >= 0 ? this.#values[i] : null },
      bubbles: true,
    }));
  };

  #onLeave = () => {
    if (this.#hot === -1) return;
    this.#hot = -1;
    if (this.isConnected) this.#render();
    this.dispatchEvent(new CustomEvent('cj-hover', { detail: { index: -1, value: null }, bubbles: true }));
  };
}

if (!customElements.get('cj-heat')) customElements.define('cj-heat', CJHeat);

export default CJHeat;
