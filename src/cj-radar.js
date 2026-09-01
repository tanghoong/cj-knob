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
    --cjr-beam-opacity: 0;  /* eased by script as the sweep spins up and down */
    --cjr-tail: 130deg;   /* how far the luminous trail reaches behind the line */
    --cjr-fade: 2.2s;     /* how long a contact stays lit after the beam passes */

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

  /* The classic scope sweep: a bright radius line with a long luminous tail
     trailing behind it. The tail is one conic gradient — CSS paints that far more
     cheaply than stacking a dozen SVG wedges — laid out so the brightest edge sits
     at 360deg, i.e. immediately counter-clockwise of 0deg. Rotating the whole layer
     by the beam angle therefore puts the leading edge exactly on the angle, with
     the tail sweeping along behind it. The angle is driven from script so each
     contact can be tested against the beam. */
  .beam {
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      transparent 0deg,
      transparent calc(360deg - var(--cjr-tail)),
      color-mix(in srgb, var(--cjr-beam) 0%,  transparent) calc(360deg - var(--cjr-tail)),
      color-mix(in srgb, var(--cjr-beam) 24%, transparent) calc(360deg - var(--cjr-tail) * .5),
      color-mix(in srgb, var(--cjr-beam) 58%, transparent) calc(360deg - var(--cjr-tail) * .18),
      color-mix(in srgb, var(--cjr-beam) 92%, transparent) 360deg);
    rotate: var(--cjr-beam-angle, 0deg);
    pointer-events: none;
    /* the phosphor is brightest at the hub and thins out toward the rim */
    -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 8%, rgba(0,0,0,.55) 74%, rgba(0,0,0,.25) 100%);
    mask-image: radial-gradient(circle at 50% 50%, #000 8%, rgba(0,0,0,.55) 74%, rgba(0,0,0,.25) 100%);
  }
  /* the leading edge itself — the line you actually watch go round */
  .beam-line {
    stroke: var(--cjr-beam);
    stroke-width: 1.3;
    stroke-linecap: round;
    filter: drop-shadow(0 0 2.5px var(--cjr-beam));
    transform: rotate(var(--cjr-beam-angle, 0deg));
    transform-origin: 50% 50%;
    transform-box: view-box;
  }
  /* Driven from script so the beam can wind up and coast down. display:none is
     what made stopping look like the sweep had been deleted mid-frame. */
  .beam, .beam-line { opacity: var(--cjr-beam-opacity, 0); }
  /* with no sweep passing over them, static contacts need their own contrast */
  :host([period="0"]) .blips .dot,
  :host(:not([period])) .blips .dot { opacity: .9; }

  /* A contact is a dot plus a halo. The beam crossing it flares the dot white and
     fires the halo outward, then both decay until the next revolution finds it. */
  .blip .dot {
    fill: var(--cjr-blip);
    opacity: .26;
    transition: opacity var(--cjr-fade) linear, fill var(--cjr-fade) linear;
  }
  .blip .halo {
    fill: var(--cjr-blip);
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
  }
  .blip[data-ping] .dot {
    fill: var(--cjr-blip-hot);
    opacity: 1;
    transition: none;
    filter: drop-shadow(0 0 var(--cjr-glow) var(--cjr-blip));
  }
  .blip[data-ping] .halo { animation: cjr-ping var(--cjr-fade) ease-out; }

  @keyframes cjr-ping {
    from { opacity: .5; scale: .4; }
    to   { opacity: 0;  scale: 3; }
  }

  .marks text {
    fill: var(--cjr-mark);
    font-size: var(--cjr-mark-size);
    font-family: inherit;
    font-weight: 600;
    text-anchor: middle;
    dominant-baseline: central;
  }

  /* Reduced motion parks the sweep instead of deleting it. Hiding it outright made
     the scope look broken rather than calm — you lose the thing that says "radar"
     and gain nothing, since a stationary beam moves no pixels either way. */
  @media (prefers-reduced-motion: reduce) {
    .blip .dot { opacity: .85; transition: none; }
    .blip[data-ping] .halo { animation: none; }
  }
</style>

<svg viewBox="0 0 100 100" part="svg" aria-hidden="true" focusable="false">
  <circle class="field" part="field" cx="50" cy="50" r="46"/>
  <g class="grid" part="grid"></g>
  <!-- drawn pointing NORTH, matching the conic gradient's own 0deg, so the line and
       its trail stay welded together once both are rotated by the beam angle -->
  <line class="beam-line" part="beam-line" x1="50" y1="50" x2="50" y2="4"/>
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
  #spin = 0;   // current deg/sec, eased toward the target
  #glow = 0;   // current brightness 0..1, eased toward the target

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
    // clearing the id matters: #loop() treats a non-zero one as "already running",
    // so a re-attached scope would otherwise never start turning again
    this.#frame = 0;
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
      const x = (50 + Math.cos(a) * b.range * R).toFixed(2);
      const y = (50 + Math.sin(a) * b.range * R).toFixed(2);
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'blip');
      // the halo is drawn first so the dot always sits on top of its own flare
      for (const [cls, r] of [['halo', 2.6], ['dot', 1.9]]) {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('class', cls);
        c.setAttribute('cx', x);
        c.setAttribute('cy', y);
        c.setAttribute('r', String(r));
        g.append(c);
      }
      if (b.label) {
        const t = document.createElementNS(SVG_NS, 'title');
        t.textContent = b.label;
        g.append(t);
      }
      frag.append(g);
    }
    this.#els.blips.replaceChildren(frag);
  }

  // ---- the sweep ---------------------------------------------------------
  /**
   * Spin the sweep up and down rather than switching it on and off.
   *
   * The beam used to be display:none whenever period was 0, so stopping it made
   * the whole sweep vanish between one frame and the next. Now the loop keeps
   * running through the transition: the rotation eases toward its target speed
   * and the brightness eases toward its target, so starting winds up and stopping
   * coasts to a halt and fades. The loop only lets go once both have settled.
   */
  #start() {
    // Someone who asked for less motion still gets a scope, just a still one:
    // the beam parks off the vertical so it reads as a sweep caught mid-turn.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
      this.#angle = this.period ? 45 : 0;
      this.style.setProperty('--cjr-beam-angle', `${this.#angle}deg`);
      this.style.setProperty('--cjr-beam-opacity', this.period ? '1' : '0');
      return;
    }
    this.#loop();
  }

  #loop() {
    if (this.#frame) return;                 // already running; it reads the target itself
    this.#last = performance.now();

    const tick = (now) => {
      // a long frame (a background tab, a slow paint) must not teleport the beam
      const dt = Math.min(0.05, Math.max(0, (now - this.#last) / 1000));
      this.#last = now;

      const spinTo = this.period ? 360 / this.period : 0;
      const glowTo = this.period ? 1 : 0;
      // framerate-independent exponential ease: the same curve at 30fps and 144
      const ease = (tau) => 1 - Math.exp(-dt / tau);
      this.#spin += (spinTo - this.#spin) * ease(0.55);
      this.#glow += (glowTo - this.#glow) * ease(0.34);

      this.#prevAngle = this.#angle;
      this.#angle = (this.#angle + this.#spin * dt) % 360;
      this.style.setProperty('--cjr-beam-angle', `${this.#angle.toFixed(2)}deg`);
      this.style.setProperty('--cjr-beam-opacity', this.#glow.toFixed(3));

      // no pings while it is barely turning, or a spin-down would fire a burst
      if (this.#spin > 2) this.#detect();

      if (!this.period && this.#spin < 1 && this.#glow < 0.01) {
        this.#spin = 0;
        this.#glow = 0;
        this.style.setProperty('--cjr-beam-opacity', '0');
        this.#frame = 0;
        return;
      }
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
        // Re-adding the flag restarts the halo animation even when the previous
        // pass has not finished decaying; the reflow between is what makes the
        // browser treat it as a new animation rather than a continuing one.
        el.removeAttribute('data-ping');
        void el.getBoundingClientRect();
        el.setAttribute('data-ping', '');
        // dropping it next frame lets the dot's own transition fade it back down
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
