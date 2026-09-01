// -------------------------------------------------
// cj-level — a zero-dependency SVG column gauge
// https://github.com/tanghoong/cj-knob
//
// <cj-level value="62" unit="L" label="fryer oil" liquid></cj-level>
//
// The straight-tube reading a ring cannot give you: a tank, a cylinder, a
// thermometer. Same liquid engine as <cj-knob liquid>, in the container the
// quantity actually lives in, with a scale you read off the side.
// -------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

// viewBox geometry. The tube is narrow and tall; the right-hand strip is scale.
const VB_W = 64;
const VB_H = 200;
const TUBE_X = 9;
const TUBE_W = 26;
const WALL = 3;
const TOP = 7;

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
    --cjl-height: 220px;
    --cjl-fill: #35a7ff;
    --cjl-fill-back: rgba(53, 167, 255, .45);
    --cjl-tube: #e6e9ee;
    --cjl-wall: #c3cad4;
    --cjl-tick: #9aa3ae;
    --cjl-text: #14161a;
    --cjl-muted: #6b7280;
    --cjl-mark-size: 8px;
    --cjl-duration: 600ms;
    --cjl-easing: cubic-bezier(.22,.61,.36,1);

    display: inline-grid;
    justify-items: center;
    gap: .35rem;
    color: var(--cjl-text);
    font: inherit;
    -webkit-tap-highlight-color: transparent;
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --cjl-tube: #21262e; --cjl-wall: #39414c;
      --cjl-text: #f2f4f7; --cjl-muted: #98a2b3; --cjl-tick: #6b7683;
    }
  }
  :host([hidden]) { display: none; }

  svg { block-size: var(--cjl-height); inline-size: auto; display: block; }

  .tube { fill: var(--cjl-tube); stroke: var(--cjl-wall); stroke-width: 1.4; }
  .zone { opacity: .42; }

  /* The fill and the fluid are the same idea: a shape whose top edge sits at the
     value. A flat rect reads as a bar; the wave reads as something poured in. */
  .body {
    transform: translateY(var(--cjl-level, 200px));
    transition: transform var(--cjl-duration) var(--cjl-easing);
  }
  .flat { fill: var(--cjl-fill); }
  .wave { fill: var(--cjl-fill); }
  .wave-b { fill: var(--cjl-fill-back); animation: cjl-drift 4.9s linear infinite reverse; }
  .wave-a { animation: cjl-drift 3.3s linear infinite; }
  /* one wavelength of travel lands the shape back on itself */
  @keyframes cjl-drift {
    from { transform: translateX(0); }
    to   { transform: translateX(-26px); }
  }
  :host(:not([liquid])) .waves { display: none; }
  :host([liquid]) .flat { display: none; }
  @media (prefers-reduced-motion: reduce) { .wave { animation: none; } }

  .ticks line { stroke: var(--cjl-tick); stroke-width: 1; stroke-linecap: round; }
  .ticks line.major { stroke-width: 1.8; }
  .ticks text {
    fill: var(--cjl-muted);
    font-size: var(--cjl-mark-size);
    font-family: inherit;
    font-weight: 600;
    text-anchor: start;
    dominant-baseline: central;
  }

  .readout {
    font-size: max(13px, calc(var(--cjl-height) * .105));
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: -.02em;
    line-height: 1;
    white-space: nowrap;
  }
  .readout[hidden] { display: none; }
  .unit { font-size: .55em; font-weight: 500; color: var(--cjl-muted); margin-inline-start: .12em; }

  .label {
    font-size: max(9px, calc(var(--cjl-height) * .05));
    color: var(--cjl-muted);
    text-align: center;
    line-height: 1.2;
  }
  .label[hidden] { display: none; }
</style>

<svg viewBox="0 0 ${VB_W} ${VB_H}" part="svg" aria-hidden="true" focusable="false">
  <defs>
    <clipPath id="cjl-bore"><path class="bore"/></clipPath>
  </defs>

  <path class="tube" part="tube"/>
  <g clip-path="url(#cjl-bore)">
    <g class="body" part="body">
      <rect class="flat" x="-40" y="0" width="200" height="${VB_H * 2}"/>
      <g class="waves">
        <path class="wave wave-b"/>
        <path class="wave wave-a"/>
      </g>
    </g>
    <g class="zones" part="zones"></g>
  </g>
  <g class="ticks" part="ticks"></g>
</svg>

<div class="readout" part="readout"><span class="num"></span><span class="unit"></span></div>
<div class="label" part="label" hidden></div>
`;

export class CJLevel extends HTMLElement {
  static observedAttributes = [
    'value', 'min', 'max', 'unit', 'decimals', 'label', 'readout',
    'ticks', 'tick-major', 'zones', 'liquid', 'bulb', 'color',
  ];

  #root;
  #els;
  #waveBuilt = false;
  #shapeKey = '';

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.append(template.content.cloneNode(true));
    const q = (s) => this.#root.querySelector(s);
    this.#els = {
      tube: q('.tube'), bore: q('.bore'), zones: q('.zones'), body: q('.body'),
      waveA: q('.wave-a'), waveB: q('.wave-b'), ticks: q('.ticks'),
      readout: q('.readout'), num: q('.num'), unit: q('.unit'), label: q('.label'),
    };
  }

  // ---- value ---------------------------------------------------------------
  get min() { return num(this.getAttribute('min'), 0); }
  set min(v) { this.setAttribute('min', v); }
  get max() { return num(this.getAttribute('max'), 100); }
  set max(v) { this.setAttribute('max', v); }
  get value() { return num(this.getAttribute('value'), this.min); }
  set value(v) { this.setAttribute('value', v); }
  /** 0..1 along the tube. */
  get ratio() {
    const span = this.max - this.min;
    return span === 0 ? 0 : clamp((this.value - this.min) / span, 0, 1);
  }

  // ---- lifecycle -----------------------------------------------------------
  connectedCallback() {
    this.#render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  // ---- drawing -------------------------------------------------------------
  /** The bore is the inside of the tube: the column, plus a bulb if asked for. */
  #geometry() {
    const bulb = this.hasAttribute('bulb');
    const bulbR = 20;
    const bulbCY = VB_H - bulbR - 3;
    // the scale ends where the column meets the bulb; the reservoir is not scale
    const bottom = bulb ? bulbCY - Math.sqrt(bulbR ** 2 - (TUBE_W / 2) ** 2) : VB_H - TOP;
    return { bulb, bulbR, bulbCY, top: TOP, bottom, colH: bottom - TOP };
  }

  /**
   * One closed outline, not a column with a circle sitting under it. Drawing them
   * as separate subpaths leaves both their strokes visible where they meet, which
   * is the seam that gives away a fake thermometer.
   */
  #shape({ bulb, bulbR, bulbCY, top }, inset) {
    const cx = TUBE_X + TUBE_W / 2;
    const half = TUBE_W / 2 - inset;
    const y = top + inset;

    if (!bulb) {
      const bot = VB_H - TOP - inset;
      return `M${cx - half},${y + half} a${half},${half} 0 0 1 ${half * 2},0 `
        + `v${bot - y - half * 2} a${half},${half} 0 0 1 ${-half * 2},0 Z`;
    }

    // where the straight sides run into the circle
    const R = bulbR - inset;
    const dy = Math.sqrt(Math.max(0, R * R - half * half));
    const meet = bulbCY - dy;
    return `M${cx - half},${meet} V${y + half} `
      + `a${half},${half} 0 0 1 ${half * 2},0 V${meet} `
      // the major arc, clockwise, so it wraps the bottom of the bulb
      + `A${R},${R} 0 1 1 ${(cx - half).toFixed(2)},${meet.toFixed(2)} Z`;
  }

  #render() {
    const g = this.#geometry();
    const key = `${g.bulb}`;
    if (key !== this.#shapeKey) {
      this.#shapeKey = key;
      this.#els.tube.setAttribute('d', this.#shape(g, 0));
      this.#els.bore.setAttribute('d', this.#shape(g, WALL));
    }

    if (this.hasAttribute('color')) this.style.setProperty('--cjl-fill', this.getAttribute('color'));

    // The bulb always reads full: a thermometer's reservoir is not part of the
    // scale, so the column alone carries the value.
    const surface = g.bottom - this.ratio * g.colH;
    this.#els.body.style.setProperty('--cjl-level', `${surface.toFixed(2)}px`);

    this.#buildWaves();
    this.#renderZones(g);
    this.#renderTicks(g);
    this.#renderText();

    this.setAttribute('role', 'meter');
    this.setAttribute('aria-valuenow', String(this.value));
    this.setAttribute('aria-valuemin', String(this.min));
    this.setAttribute('aria-valuemax', String(this.max));
    const label = this.getAttribute('label');
    if (label && !this.hasAttribute('aria-label')) this.setAttribute('aria-label', label);
  }

  #buildWaves() {
    if (this.#waveBuilt) return;
    // wider than the tube at every drift offset, or sliding it left pulls its own
    // edge into the bore and the column appears to empty sideways
    const WL = 26;
    const wave = (amp) => {
      const pts = [];
      for (let x = -WL; x <= VB_W + WL; x += 2) {
        pts.push(`${x},${(Math.sin((x / WL) * Math.PI * 2) * amp).toFixed(2)}`);
      }
      return `M${pts.join(' L')} L${VB_W + WL},${VB_H * 2} L${-WL},${VB_H * 2} Z`;
    };
    this.#els.waveA.setAttribute('d', wave(2));
    this.#els.waveB.setAttribute('d', wave(3));
    this.#waveBuilt = true;
  }

  /** zones="0-20:#ef4444, 80-100:#f59e0b" — bands painted down the bore */
  #renderZones({ top, bottom, colH }) {
    const spec = this.getAttribute('zones');
    if (!spec) return void this.#els.zones.replaceChildren();
    const span = (this.max - this.min) || 1;
    const frag = document.createDocumentFragment();
    for (const part of spec.split(',')) {
      const m = part.trim().match(/^(-?[\d.]+)\s*-\s*(-?[\d.]+)\s*:\s*(.+)$/);
      if (!m) continue;
      const a = clamp((parseFloat(m[1]) - this.min) / span, 0, 1);
      const b = clamp((parseFloat(m[2]) - this.min) / span, 0, 1);
      if (b <= a) continue;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'zone');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', (bottom - b * colH).toFixed(2));
      rect.setAttribute('width', String(VB_W));
      rect.setAttribute('height', ((b - a) * colH).toFixed(2));
      rect.setAttribute('fill', m[3].trim());
      frag.append(rect);
    }
    this.#els.zones.replaceChildren(frag);
  }

  /** graduations down the right-hand side, labelled in value units */
  #renderTicks({ top, bottom, colH }) {
    const n = Math.round(num(this.getAttribute('ticks'), 0));
    if (!(n > 0)) return void this.#els.ticks.replaceChildren();
    const major = Math.round(num(this.getAttribute('tick-major'), 0));
    const frag = document.createDocumentFragment();
    const x = TUBE_X + TUBE_W + 2;

    for (let i = 0; i <= n; i++) {
      const isMajor = major > 0 && i % major === 0;
      const y = bottom - (i / n) * colH;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x));
      line.setAttribute('y1', y.toFixed(2));
      line.setAttribute('x2', String(x + (isMajor ? 7 : 4)));
      line.setAttribute('y2', y.toFixed(2));
      if (isMajor) line.setAttribute('class', 'major');
      frag.append(line);

      if (isMajor) {
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', String(x + 9.5));
        t.setAttribute('y', y.toFixed(2));
        t.textContent = String(Math.round(this.min + (i / n) * (this.max - this.min)));
        frag.append(t);
      }
    }
    this.#els.ticks.replaceChildren(frag);
  }

  #renderText() {
    const mode = this.getAttribute('readout') ?? 'value';
    const decimals = clamp(num(this.getAttribute('decimals'), 0), 0, 6);
    const hide = mode === 'none';
    this.#els.readout.toggleAttribute('hidden', hide);
    if (!hide) {
      const shown = mode === 'percent' ? this.ratio * 100 : this.value;
      this.#els.num.textContent = shown.toFixed(decimals);
      this.#els.unit.textContent = this.getAttribute('unit') ?? (mode === 'percent' ? '%' : '');
    }
    const label = this.getAttribute('label');
    this.#els.label.textContent = label ?? '';
    this.#els.label.toggleAttribute('hidden', !label);
  }
}

if (!customElements.get('cj-level')) customElements.define('cj-level', CJLevel);

export default CJLevel;
