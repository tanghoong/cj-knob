// -------------------------------------------------
// cj-horizon — a zero-dependency SVG attitude indicator
// https://github.com/tanghoong/cj-knob
//
// <cj-horizon pitch="8" roll="-20"></cj-horizon>
//
// The artificial horizon an aircraft shows you: sky over ground, tipping with
// bank and sliding with pitch, read against a fixed aircraft symbol. A knob puts
// one number on a rim; this puts two angles on a whole face, so like cj-radar it
// is a sibling element rather than a mode of cj-knob.
// -------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
const FACE = 40;          // radius of the visible face in the 0-100 viewBox
const PER_DEG = 0.62;     // viewBox units the card slides per degree of pitch

let uid = 0;

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
    --cjh-size: 220px;
    --cjh-sky: #2b7fd4;
    --cjh-ground: #8a5a2b;
    --cjh-line: #ffffff;
    --cjh-bezel: #14161a;
    --cjh-scale: #e9edf3;
    --cjh-craft: #ffcf33;
    --cjh-index: #ff4d4d;
    --cjh-text: #ffffff;
    --cjh-text-size: 4.4px;

    display: inline-grid;
    place-items: center;
    inline-size: var(--cjh-size);
    block-size: var(--cjh-size);
    font: inherit;
    -webkit-tap-highlight-color: transparent;
  }
  :host([hidden]) { display: none; }
  :host(:focus-visible) { outline: 2px solid var(--cjh-craft); outline-offset: 2px; }

  svg { inline-size: 100%; block-size: 100%; }

  .sky { fill: var(--cjh-sky); }
  .ground { fill: var(--cjh-ground); }
  .horizon { stroke: var(--cjh-line); stroke-width: .8; }

  /* The card carries sky, ground and the pitch ladder. Roll turns it; pitch
     slides it. Both are transitioned so a change reads as the aircraft moving
     rather than the picture jumping. */
  .card {
    transform: rotate(var(--cjh-roll, 0deg));
    transform-origin: 50% 50%;
    transform-box: view-box;
    transition: transform var(--cjh-duration, 320ms) linear;
  }
  .slide {
    transform: translateY(var(--cjh-pitch, 0px));
    transition: transform var(--cjh-duration, 320ms) linear;
  }

  .ladder line { stroke: var(--cjh-line); stroke-width: .55; }
  .ladder text {
    fill: var(--cjh-text);
    font-size: var(--cjh-text-size);
    font-family: inherit;
    font-weight: 600;
    text-anchor: middle;
    dominant-baseline: central;
  }

  .bezel { fill: none; stroke: var(--cjh-bezel); stroke-width: 8; }
  .scale line { stroke: var(--cjh-scale); stroke-width: .7; stroke-linecap: round; }
  .scale line.major { stroke-width: 1.2; }

  /* the bank pointer rides with the card and is read against the fixed scale */
  .bank {
    fill: var(--cjh-index);
    transform: rotate(var(--cjh-roll, 0deg));
    transform-origin: 50% 50%;
    transform-box: view-box;
    transition: transform var(--cjh-duration, 320ms) linear;
  }
  .craft { fill: none; stroke: var(--cjh-craft); stroke-width: 1.6; stroke-linecap: round; }
  .craft-dot { fill: var(--cjh-craft); }

  @media (prefers-reduced-motion: reduce) {
    .card, .slide, .bank { transition: none; }
  }
</style>

<svg viewBox="0 0 100 100" part="svg" aria-hidden="true" focusable="false">
  <defs>
    <clipPath class="clip"><circle cx="50" cy="50" r="40"/></clipPath>
  </defs>

  <g class="face">
    <g class="card">
      <g class="slide">
        <!-- oversized so the card still covers the face when rolled and pitched -->
        <rect class="sky"    x="-60" y="-110" width="220" height="160"/>
        <rect class="ground" x="-60" y="50"   width="220" height="160"/>
        <line class="horizon" x1="-60" y1="50" x2="160" y2="50"/>
        <g class="ladder" part="ladder"></g>
      </g>
    </g>
  </g>

  <g class="scale" part="scale"></g>
  <polygon class="bank" part="bank" points="50,8.5 46.8,14.5 53.2,14.5"/>
  <circle class="bezel" part="bezel" cx="50" cy="50" r="44"/>

  <!-- the aircraft symbol never moves; everything else moves behind it -->
  <path class="craft" part="craft" d="M28,50 L42,50 M58,50 L72,50 M50,50 L50,56"/>
  <circle class="craft-dot" cx="50" cy="50" r="1.5"/>
</svg>
`;

export class CJHorizon extends HTMLElement {
  static observedAttributes = ['pitch', 'roll', 'ladder-step', 'ladder-max'];

  #root;
  #els;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.append(template.content.cloneNode(true));
    const q = (s) => this.#root.querySelector(s);

    // clip paths are referenced by id, so each instance needs its own
    const id = `cjh-clip-${++uid}`;
    q('.clip').id = id;
    q('.face').setAttribute('clip-path', `url(#${id})`);

    this.#els = { ladder: q('.ladder'), scale: q('.scale') };
  }

  // ---- public API --------------------------------------------------------
  /** Nose-up in degrees. Positive pitches the horizon down the face. */
  get pitch() { return num(this.getAttribute('pitch'), 0); }
  set pitch(v) { this.setAttribute('pitch', v); }

  /** Right bank in degrees. Positive rolls the horizon anticlockwise. */
  get roll() { return num(this.getAttribute('roll'), 0); }
  set roll(v) { this.setAttribute('roll', v); }

  /** "level" | "climbing" | "descending", with the bank named alongside. */
  get attitude() {
    const p = this.pitch, r = this.roll;
    const nose = p > 2 ? 'climbing' : p < -2 ? 'descending' : 'level';
    const bank = r > 2 ? 'right bank' : r < -2 ? 'left bank' : 'wings level';
    return `${nose}, ${bank}`;
  }

  // ---- lifecycle ---------------------------------------------------------
  connectedCallback() {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
    this.#buildScale();
    this.#buildLadder();
    this.#apply();
  }

  attributeChangedCallback(name) {
    if (!this.isConnected) return;
    if (name === 'ladder-step' || name === 'ladder-max') this.#buildLadder();
    this.#apply();
  }

  // ---- drawing -----------------------------------------------------------
  #apply() {
    const pitch = clamp(this.pitch, -90, 90);
    const roll = clamp(this.roll, -180, 180);
    // a nose-up attitude drops the horizon down the face, hence the positive sign
    this.style.setProperty('--cjh-pitch', `${(pitch * PER_DEG).toFixed(2)}px`);
    this.style.setProperty('--cjh-roll', `${(-roll).toFixed(2)}deg`);
    this.setAttribute('aria-label',
      `Attitude: pitch ${pitch.toFixed(0)}°, roll ${roll.toFixed(0)}° — ${this.attitude}`);
  }

  /** the fixed bank scale around the top of the bezel */
  #buildScale() {
    const frag = document.createDocumentFragment();
    for (const deg of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const major = deg % 30 === 0;
      const a = (deg - 90) * Math.PI / 180;
      const r1 = major ? 34 : 36.5;
      const l = document.createElementNS(SVG_NS, 'line');
      l.setAttribute('x1', (50 + Math.cos(a) * r1).toFixed(2));
      l.setAttribute('y1', (50 + Math.sin(a) * r1).toFixed(2));
      l.setAttribute('x2', (50 + Math.cos(a) * 40).toFixed(2));
      l.setAttribute('y2', (50 + Math.sin(a) * 40).toFixed(2));
      if (major) l.setAttribute('class', 'major');
      frag.append(l);
    }
    this.#els.scale.replaceChildren(frag);
  }

  /** the pitch ladder: a rung every `ladder-step` degrees, labelled */
  #buildLadder() {
    const step = clamp(Math.round(num(this.getAttribute('ladder-step'), 10)), 5, 30);
    const max = clamp(Math.round(num(this.getAttribute('ladder-max'), 30)), step, 90);
    const frag = document.createDocumentFragment();

    for (let d = -max; d <= max; d += step) {
      if (d === 0) continue;                 // the horizon line is the zero rung
      const y = 50 - d * PER_DEG;            // up the face is nose-up
      const half = Math.abs(d) % (step * 2) === 0 ? 11 : 6;
      const l = document.createElementNS(SVG_NS, 'line');
      l.setAttribute('x1', String(50 - half));
      l.setAttribute('y1', y.toFixed(2));
      l.setAttribute('x2', String(50 + half));
      l.setAttribute('y2', y.toFixed(2));
      frag.append(l);

      for (const side of [-1, 1]) {
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', String(50 + side * (half + 4)));
        t.setAttribute('y', y.toFixed(2));
        t.textContent = String(Math.abs(d));
        frag.append(t);
      }
    }
    this.#els.ladder.replaceChildren(frag);
  }
}

if (!customElements.get('cj-horizon')) customElements.define('cj-horizon', CJHorizon);

export default CJHorizon;
