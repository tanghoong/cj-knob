// -------------------------------------------------
// cj-knob — a zero-dependency SVG knob / gauge / meter
// https://github.com/tanghoong/cj-knob
//
// <cj-knob value="78"></cj-knob>
// -------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";
const PATH_LENGTH = 100; // every ring is normalised to 100 units via pathLength

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host {
    /* ---- public theming API ---- */
    --cj-size: 220px;
    --cj-thickness: 8;
    --cj-thickness-overflow: calc(var(--cj-thickness) * 0.55);
    /* type scales with the knob but never shrinks below a legible floor */
    --cj-num-size: max(13px, calc(var(--cj-size) * .2));
    --cj-label-size: max(9px, calc(var(--cj-size) * .082));
    --cj-track: #d9dce1;
    --cj-value: #019ae6;
    --cj-benchmark: #94cefe;
    --cj-tick: #9aa3ae;
    --cj-tick-width: .8;
    --cj-needle: #e0433f;
    --cj-needle-2: #2f7ae5;
    --cj-liquid: #35a7ff;
    --cj-liquid-back: rgba(53, 167, 255, .45);
    --cj-mark: #6b7280;
    --cj-mark-major: #14161a;
    --cj-mark-size: 7px;
    --cj-text: #14161a;
    --cj-muted: #6b7280;
    --cj-duration: 600ms;
    --cj-easing: cubic-bezier(.22,.61,.36,1);
    /* ---- internal ---- */
    --cj-start: -90deg;
    --cj-shift: 0px;

    display: inline-grid;
    place-items: center;
    inline-size: var(--cj-size);
    block-size: var(--cj-size);
    color: var(--cj-text);
    font: inherit;
    -webkit-tap-highlight-color: transparent;
  }

  @media (prefers-color-scheme: dark) {
    :host {
      --cj-track: #2f333a;
      --cj-text: #f2f4f7;
      --cj-muted: #98a2b3;
      --cj-mark: #98a2b3;
      --cj-mark-major: #f2f4f7;
    }
  }

  :host([hidden]) { display: none; }
  :host([interactive]) { cursor: grab; touch-action: none; }
  :host([data-dragging]) { cursor: grabbing; }
  /* the value must track the pointer, not ease behind it */
  :host([data-dragging]) .value,
  :host([data-dragging]) .overflow { transition: none; }
  :host([disabled]) { opacity: .5; cursor: not-allowed; pointer-events: none; }

  :host(:focus-visible) { outline: none; }
  :host(:focus-visible) .focus-ring { opacity: 1; }

  svg { grid-area: 1 / 1; inline-size: 100%; block-size: 100%; overflow: visible; }

  .rings {
    transform: rotate(var(--cj-start));
    transform-origin: 50% 50%;
    transform-box: view-box;
  }

  circle {
    fill: none;
    stroke-width: var(--cj-thickness);
    stroke-linecap: round;
  }

  .track     { stroke: var(--cj-track); }
  .value     { stroke: var(--cj-value); }
  /* the benchmark is a target tick drawn over the value ring, so it stays visible either side of it */
  .benchmark {
    stroke: var(--cj-benchmark);
    stroke-linecap: butt;
    stroke-width: calc(var(--cj-thickness) * 1.5);
  }
  .benchmark[hidden] { display: none; }
  .track-2   { stroke: var(--cj-track); stroke-width: var(--cj-thickness-overflow); }
  .overflow  { stroke: var(--cj-value); stroke-width: var(--cj-thickness-overflow); }

  .value, .overflow, .benchmark {
    transition: stroke-dashoffset var(--cj-duration) var(--cj-easing),
                stroke-dasharray  var(--cj-duration) var(--cj-easing);
  }

  .focus-ring {
    fill: none;
    stroke: var(--cj-value);
    stroke-width: 1.5;
    opacity: 0;
    transition: opacity 120ms linear;
  }

  .overflow-group[hidden] { display: none; }

  /* graduations. Drawn inside .rings so the group's rotation positions them for free. */
  .ticks line {
    stroke: var(--cj-tick);
    stroke-width: var(--cj-tick-width);
    stroke-linecap: round;
  }
  .ticks line.major { stroke-width: calc(var(--cj-tick-width) * 2); }

  /* ---- liquid fill ---- */
  .liquid[hidden] { display: none; }
  /* the surface rises with the value; the transition is what makes filling and
     draining look like pouring rather than a jump cut */
  .level {
    transform: translateY(var(--cj-level, 34px));
    transition: transform var(--cj-duration) var(--cj-easing);
  }
  .wave {
    fill: var(--cj-liquid);
    transform-box: view-box;
  }
  /* the readout sits over the fluid, so it needs its own contrast — a pale liquid
     otherwise swallows pale text entirely */
  :host([liquid]) .readout, :host([liquid]) .label {
    text-shadow: 0 1px 2px rgba(0, 0, 0, .5), 0 0 6px rgba(0, 0, 0, .3);
  }
  .wave-a { animation: cj-drift 3.1s linear infinite; }
  .wave-b { fill: var(--cj-liquid-back); animation: cj-drift 4.7s linear infinite reverse; }
  /* sliding by exactly one wavelength puts the shape back where it started */
  @keyframes cj-drift {
    from { transform: translateX(0); }
    to   { transform: translateX(-34px); }
  }
  @media (prefers-reduced-motion: reduce) { .wave { animation: none; } }

  /* zones sit on the track; segments replace the value ring */
  .zones circle, .segments circle { stroke-width: var(--cj-thickness); }
  :host([segments]) .value { display: none; }

  /* the fan of colour steps, and the mask that reveals it up to the value */
  .gradient circle {
    stroke-width: var(--cj-thickness);
    stroke-linecap: butt;      /* round caps would notch every join */
  }
  .gradient[hidden] { display: none; }
  .value-mask {
    stroke-width: var(--cj-thickness);
    transition: stroke-dashoffset var(--cj-duration) var(--cj-easing),
                stroke-dasharray  var(--cj-duration) var(--cj-easing);
  }
  :host([data-dragging]) .value-mask { transition: none; }
  /* the plain ring steps aside when a gradient is painting the value */
  :host([gradient]) .value { display: none; }

  /* a pointer that swings to the value — compass rose, speedometer, VU meter */
  .needle {
    fill: var(--cj-needle);
    transform: rotate(var(--cj-needle-angle, 0deg));
    transform-origin: 50% 50%;
    transform-box: view-box;
    transition: transform var(--cj-duration) var(--cj-easing);
  }
  .needle[hidden] { display: none; }

  /* only one pointer shape is ever drawn; needle="hand" picks the other */
  .hand { display: none; }
  :host([needle="hand"]) .mark { display: none; }
  :host([needle="hand"]) .hand { display: block; }
  .hub { fill: var(--cj-needle); }
  .hub[hidden] { display: none; }

  /* a second pointer, for dials where the two ends mean different things */
  .needle-2 {
    fill: var(--cj-needle-2);
    transform: rotate(var(--cj-needle-2-angle, 0deg));
    transform-origin: 50% 50%;
    transform-box: view-box;
    transition: transform var(--cj-duration) var(--cj-easing);
  }
  .needle-2[hidden] { display: none; }

  /* Rotating-card dial: the graduations and captions turn under a fixed index,
     the way a heading indicator works, instead of a pointer moving over a fixed
     card. The card turns by -value, so the current heading ends up under the index. */
  .ticks, .marks {
    transform: rotate(var(--cj-card-angle, 0deg));
    transform-origin: 50% 50%;
    transform-box: view-box;
    transition: transform var(--cj-duration) var(--cj-easing);
  }
  .lubber { fill: var(--cj-needle); }
  .lubber[hidden] { display: none; }

  /* bearing labels. Outside .rings so they stay upright instead of turning with it. */
  .marks text {
    fill: var(--cj-mark);
    font-size: var(--cj-mark-size);
    font-family: inherit;
    font-weight: 600;
    text-anchor: middle;
    dominant-baseline: central;
  }
  .marks text.major { fill: var(--cj-mark-major); }

  /* Everything in the middle is stacked in one grid cell and anchored off the centre,
     so the NUMBER always sits on the ring's centre point. The unit and the label hang
     off it without shifting it — otherwise a wide unit ("°C") drags the number left
     and no two knobs in a dashboard line up. */
  .center {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    inline-size: 100%;
    block-size: 100%;
    translate: 0 var(--cj-shift);
    pointer-events: none;
    line-height: 1;
  }

  /* With a number AND a label the number lifts, so the lower half of the dial belongs
     to the text and the pair reads as optically centred rather than bottom-heavy. */
  .center:has(.readout:not([hidden])):has(.label:not([hidden])) {
    translate: 0 calc(var(--cj-shift) - var(--cj-num-size) * .26);
  }

  /* Whatever is in the middle has to own the centre. With a number showing, the icon
     and label hang off it. With readout="none" there is nothing to hang off, so they
     take the centre themselves instead of orbiting an invisible number. */
  .center:has(.readout:not([hidden])) {
    --icon-y: calc(var(--cj-num-size) * -.85);
    --label-y: calc(var(--cj-num-size) * .82);
  }
  .center:has(.readout[hidden]) { --icon-y: 0px; --label-y: 0px; }
  /* an icon on its own is the centre; an icon WITH a label shares the space with it */
  .center[data-icon]:has(.readout[hidden]):has(.label:not([hidden])) {
    --icon-y: calc(var(--cj-label-size) * -1);
    --label-y: calc(var(--cj-label-size) * 1.5);
  }

  /* A centre hand pivots exactly where the number sits, so the number drops below
     the hub — which is where a real tachometer puts its digital readout anyway.
     Declared last so it beats the label-lift rule at equal specificity. */
  :host([needle="hand"]) .center:has(.readout:not([hidden])) {
    translate: 0 calc(var(--cj-shift) + var(--cj-num-size) * .74);
  }

  .readout, .icon, .label { grid-area: 1 / 1; }

  .readout {
    position: relative;
    font-size: var(--cj-num-size);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: -.02em;
    white-space: nowrap;
  }
  .readout[hidden] { visibility: hidden; }

  /* absolute, so it adds no width to .readout and cannot pull the number off-centre */
  .unit {
    position: absolute;
    inset-inline-start: 100%;
    inset-block-end: .06em;
    margin-inline-start: .1em;
    font-size: .5em;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--cj-muted);
  }

  /* offsets key off the number's size, not the knob's, so the label tucks under the
     digits at every scale instead of drifting out onto the ring on small knobs */
  .icon { translate: 0 var(--icon-y, 0px); }

  .label {
    translate: 0 var(--label-y, 0px);
    inline-size: max-content;
    max-inline-size: calc(var(--cj-size) * .46);
    font-size: var(--cj-label-size);
    line-height: 1.2;
    color: var(--cj-muted);
    text-align: center;
    text-wrap: balance;
  }
  .label[hidden] { display: none; }
  /* with no number in the way the label gets the full inner circle to wrap into */
  .center:has(.readout[hidden]) .label { max-inline-size: calc(var(--cj-size) * .62); }

  /* graphics get sized by width; anything else (an emoji, a glyph) by font-size */
  ::slotted(*) { font-size: calc(var(--cj-size) * .2); line-height: 1; }
  ::slotted(img), ::slotted(svg), ::slotted(picture) {
    inline-size: calc(var(--cj-size) * .15);
    block-size: auto;
    display: block;
  }

  /* opt-in entrance: grow from empty on first paint. Purely visual — the DOM is already correct. */
  @keyframes cj-grow { from { stroke-dashoffset: var(--cj-arc); } }
  :host([animate-in]) .value,
  :host([animate-in]) .overflow { animation: cj-grow var(--cj-duration) var(--cj-easing); }

  @media (prefers-reduced-motion: reduce) {
    .value, .overflow, .benchmark { transition: none; }
    :host([animate-in]) .value, :host([animate-in]) .overflow { animation: none; }
  }
</style>

<svg viewBox="0 0 100 100" part="svg" aria-hidden="true" focusable="false">
  <defs>
    <clipPath id="cj-vessel"><circle cx="50" cy="50" r="33"/></clipPath>
    <mask id="cj-arcmask" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <circle class="value-mask" cx="50" cy="50" r="42" pathLength="100"
              fill="none" stroke="#fff" stroke-linecap="round"
              stroke-dasharray="100 100" stroke-dashoffset="100"/>
    </mask>
  </defs>

  <!-- Liquid: a wave-topped body whose surface sits at the value. Two waves of
       different wavelength and speed drift across each other, which reads as
       moving fluid rather than a bar that happens to have a wavy edge. -->
  <g class="liquid" part="liquid" clip-path="url(#cj-vessel)" hidden>
    <g class="level">
      <path class="wave wave-b"/>
      <path class="wave wave-a"/>
    </g>
  </g>

  <g class="rings" part="rings">
    <circle class="track"     part="track"     cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="100 100"/>
    <g class="zones"    part="zones"></g>
    <circle class="value"     part="value"     cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100"/>
    <!-- Gradient arc. SVG has no conic gradient, so the colour ramp is laid down
         once as a fan of short solid arcs across the whole sweep, and the value
         reveals it through a mask that mirrors the value ring exactly. Changing
         the value therefore costs one dash offset, not a rebuild of the fan. -->
    <g class="gradient" part="gradient" mask="url(#cj-arcmask)" hidden></g>
    <g class="segments" part="segments"></g>
    <g class="ticks"    part="ticks"></g>
    <circle class="benchmark" part="benchmark" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="0 100" hidden/>
    <g class="overflow-group" hidden>
      <circle class="track-2"  part="track-overflow" cx="50" cy="50" r="31" pathLength="100" stroke-dasharray="100 100"/>
      <circle class="overflow" part="overflow"       cx="50" cy="50" r="31" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100"/>
    </g>
    <!-- Two pointer styles. The rim marker is the default; needle="hand" swaps in a
         centre-mounted hand, which is what a clock or a pressure gauge wants. Both
         are drawn pointing right, i.e. at 0deg before .rings applies --cj-start. -->
    <g class="needle" part="needle" hidden>
      <polygon class="mark" points="87.5,50 79.5,46.3 79.5,53.7"/>
      <polygon class="hand" points="86,50 52,48.1 43,50 52,51.9"/>
    </g>
    <g class="needle-2" part="needle-2" hidden>
      <polygon class="mark" points="85.5,50 78.5,47.4 78.5,52.6"/>
      <polygon class="hand" points="68,50 52,48.5 44,50 52,51.5"/>
    </g>
    <circle class="hub" part="hub" cx="50" cy="50" r="2.6" hidden/>
  </g>
  <g class="marks" part="marks"></g>
  <!-- a fixed index for the rotating-card dial, the way a heading indicator has one -->
  <polygon class="lubber" part="lubber" points="50,4.5 46.6,11 53.4,11" hidden/>
  <circle class="focus-ring" cx="50" cy="50" r="49"/>
</svg>

<div class="center" part="center">
  <div class="readout" part="readout"><span class="num"></span><span class="unit"></span></div>
  <div class="icon"><slot name="icon"></slot></div>
  <div class="label" part="label" hidden></div>
</div>
`;

const num = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Assigning textContent replaces the text node even when the string is identical,
// so a dial driven from requestAnimationFrame churns three nodes a frame for
// captions that never change. Compare first.
const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };

/** #rgb / #rrggbb -> [r,g,b]. Anything else falls back to mid grey. */
const parseColor = (c) => {
  const h = c.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const v = parseInt(full, 16);
  return Number.isFinite(v) && full.length === 6
    ? [(v >> 16) & 255, (v >> 8) & 255, v & 255]
    : [128, 128, 128];
};
const mixColor = (a, b, t) =>
  "#" + a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, "0")).join("");

export class CJKnob extends HTMLElement {
  static observedAttributes = [
    'value', 'min', 'max', 'benchmark', 'sweep', 'start',
    'readout', 'unit', 'decimals', 'label', 'color',
    'zones', 'segments', 'ticks', 'tick-major', 'gradient',
    'needle', 'labels', 'label-radius', 'value-2', 'rotating', 'liquid',
    'interactive', 'disabled', 'step',
  ];

  #root;
  #els;
  #dragging = false;
  #ownsColor = false;
  // unwrapped angles per pointer, so a full dial never spins the long way round
  #turns = {};
  // the wave path is geometry, not state — build it once and move it by transform
  #waveBuilt = false;
  // last-rendered signature per geometry part, so none of them rebuild for free
  #sig = {};

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.append(template.content.cloneNode(true));
    const q = (s) => this.#root.querySelector(s);
    this.#els = {
      value: q('.value'),
      benchmark: q('.benchmark'),
      track: q('.track'),
      overflowGroup: q('.overflow-group'),
      overflow: q('.overflow'),
      zones: q('.zones'),
      gradient: q('.gradient'),
      valueMask: q('.value-mask'),
      segments: q('.segments'),
      ticks: q('.ticks'),
      needle: q('.needle'),
      needle2: q('.needle-2'),
      lubber: q('.lubber'),
      hub: q('.hub'),
      liquid: q('.liquid'),
      waveA: q('.wave-a'),
      waveB: q('.wave-b'),
      marks: q('.marks'),
      center: q('.center'),
      slot: q('slot[name="icon"]'),
      readout: q('.readout'),
      num: q('.num'),
      unit: q('.unit'),
      label: q('.label'),
    };
    this.#els.slot.addEventListener('slotchange', () => this.#syncIcon());
  }

  // CSS cannot ask "is anything slotted?", so record it as an attribute it can match.
  // slotchange is async, so this also runs synchronously on connect — otherwise the
  // first painted frame lays the icon out as if there were none.
  #syncIcon() {
    const filled = this.#els.slot.assignedNodes({ flatten: true })
      .some((n) => n.nodeType === Node.ELEMENT_NODE || n.textContent.trim());
    this.#els.center.toggleAttribute('data-icon', filled);
  }

  // ---- geometry ----------------------------------------------------------
  get #sweep() { return clamp(num(this.getAttribute('sweep'), 360), 1, 360); }

  get #start() {
    const s = this.#sweep;
    // a full ring opens at 12 o'clock; a partial arc centres its gap at the bottom
    return num(this.getAttribute('start'), s >= 360 ? -90 : 90 + (360 - s) / 2);
  }

  // ---- value -------------------------------------------------------------
  get min() { return num(this.getAttribute('min'), 0); }
  set min(v) { this.setAttribute('min', v); }

  get max() { return num(this.getAttribute('max'), 100); }
  set max(v) { this.setAttribute('max', v); }

  get step() { return Math.abs(num(this.getAttribute('step'), 1)) || 1; }
  set step(v) { this.setAttribute('step', v); }

  get value() { return num(this.getAttribute('value'), this.min); }
  set value(v) { this.setAttribute('value', v); }

  /** 0..1, and above 1 once the value passes max */
  get ratio() {
    const span = this.max - this.min;
    return span === 0 ? 0 : (this.value - this.min) / span;
  }

  get interactive() { return this.hasAttribute('interactive') && !this.hasAttribute('disabled'); }
  set interactive(v) { this.toggleAttribute('interactive', !!v); }

  // ---- lifecycle ---------------------------------------------------------
  connectedCallback() {
    this.#syncInteractivity();
    this.#syncIcon();
    this.#render();
  }

  disconnectedCallback() {
    this.#teardownPointer();
    this.removeEventListener('pointerdown', this.#onPointerDown);
    this.removeEventListener('keydown', this.#onKeyDown);
  }

  // Rendering is synchronous on purpose: the geometry and the ARIA attributes must be
  // correct in the DOM the moment the element connects, not one animation frame later
  // (rAF is throttled in background tabs, and assistive tech reads the DOM, not the paint).
  attributeChangedCallback(name) {
    if (name === 'interactive' || name === 'disabled') this.#syncInteractivity();
    if (this.isConnected) this.#render();
  }

  // ---- render ------------------------------------------------------------
  #render() {
    if (!this.isConnected) return;
    const { min, max } = this;
    const sweep = this.#sweep;
    const arc = (sweep / 360) * PATH_LENGTH;
    const raw = this.ratio;
    const pct = clamp(raw, 0, 1);
    const over = clamp(raw - 1, 0, 1);

    this.style.setProperty('--cj-start', `${this.#start}deg`);
    this.style.setProperty('--cj-arc', String(arc));
    // a partial arc leaves a gap at the bottom, so nudge the text up in proportion to it
    const shift = (-(360 - sweep) / 360 * 0.14).toFixed(4);
    this.style.setProperty('--cj-shift', `calc(var(--cj-size) * ${shift})`);

    const dash = `${arc} ${PATH_LENGTH}`;
    this.#els.track.setAttribute('stroke-dasharray', dash);
    this.#els.value.setAttribute('stroke-dasharray', dash);
    this.#els.value.setAttribute('stroke-dashoffset', arc * (1 - pct));
    this.#els.valueMask.setAttribute('stroke-dasharray', dash);
    this.#els.valueMask.setAttribute('stroke-dashoffset', arc * (1 - pct));

    // benchmark: a short tick positioned on the arc, not a fill from zero
    const bm = this.getAttribute('benchmark');
    this.#els.benchmark.toggleAttribute('hidden', bm === null);
    if (bm !== null) {
      const bmPct = clamp((num(bm, min) - min) / ((max - min) || 1), 0, 1);
      const tick = 1.2;
      this.#els.benchmark.setAttribute('stroke-dasharray', `${tick} ${PATH_LENGTH}`);
      // a negative offset shifts the dash forward along the path; centre it on the mark
      this.#els.benchmark.setAttribute('stroke-dashoffset', -(arc * bmPct - tick / 2));
    }

    // overflow ring: only exists once the value passes max
    const showOverflow = over > 0;
    this.#els.overflowGroup.toggleAttribute('hidden', !showOverflow);
    if (showOverflow) {
      this.#els.overflow.setAttribute('stroke-dasharray', dash);
      this.#els.overflow.setAttribute('stroke-dashoffset', arc * (1 - over));
    }

    this.#renderGradient(arc, sweep);
    this.#renderZones(arc, min, max);
    this.#renderSegments(arc, min, max);
    this.#renderTicks(sweep);
    this.#renderNeedle(sweep, pct);
    this.#renderCard(sweep, pct);
    this.#renderLiquid(pct);
    this.#renderMarks(sweep, this.#start);

    // `color` is a shorthand for the --cj-value custom property. Only clear it again if
    // WE set it — an author may have put --cj-value in their own inline style, and
    // removing that would silently override their choice.
    if (this.hasAttribute('color')) {
      this.style.setProperty('--cj-value', this.getAttribute('color'));
      this.#ownsColor = true;
    } else if (this.#ownsColor) {
      this.style.removeProperty('--cj-value');
      this.#ownsColor = false;
    }

    this.#renderText(raw);
    this.#renderA11y();
  }

  // --- zones, segments and ticks -----------------------------------------
  // All three reuse the pathLength=100 trick: an arc from a to b is a dash of
  // length (b-a) pushed along the path by a negative dash offset.
  /**
   * Ticks, captions, zones and the gradient fan are all geometry: they depend on
   * their own attributes and the arc, never on the value. Rebuilding them on
   * every value change meant a 36-tick dial driven from requestAnimationFrame
   * threw away and recreated three dozen nodes sixty times a second, and a lab
   * panel has twenty of those on screen at once.
   */
  #changed(part, signature) {
    if (this.#sig[part] === signature) return false;
    this.#sig[part] = signature;
    return true;
  }

  #arcNode(cls, len, at, stroke) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '50');
    c.setAttribute('cy', '50');
    c.setAttribute('r', '42');
    c.setAttribute('pathLength', String(PATH_LENGTH));
    c.setAttribute('stroke-dasharray', `${len} ${PATH_LENGTH}`);
    c.setAttribute('stroke-dashoffset', String(-at));
    c.setAttribute('fill', 'none');
    if (stroke) c.setAttribute('stroke', stroke);
    return c;
  }

  /**
   * gradient="#22c55e,#f59e0b,#ef4444" — a colour ramp that follows the arc.
   *
   * SVG has no conic gradient, and a linearGradient runs across the bounding box
   * rather than around the curve, which reads wrong on anything past a half turn.
   * So the ramp is a fan of short solid arcs. It is rebuilt only when the colours
   * or the geometry change; the value itself just moves the mask.
   */
  #renderGradient(arc, sweep) {
    const spec = this.getAttribute('gradient');
    this.#els.gradient.toggleAttribute('hidden', !spec);
    if (!spec) return;

    if (!this.#changed('grad', `${spec}|${arc}|${sweep}`)) return;

    const stops = spec.split(',').map((s) => s.trim()).filter(Boolean).map(parseColor);
    if (stops.length < 2) return void this.#els.gradient.replaceChildren();

    const STEPS = 48;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1);
      const at = t * (stops.length - 1);
      const lo = Math.min(Math.floor(at), stops.length - 2);
      const c = mixColor(stops[lo], stops[lo + 1], at - lo);
      // overlap each step slightly so no hairline of track shows through the joins
      frag.append(this.#arcNode('grad', (arc / STEPS) * 1.35, (arc / STEPS) * i, c));
    }
    this.#els.gradient.replaceChildren(frag);
  }

  /** zones="0-60:#22c55e, 60-85:#f59e0b, 85-100:#ef4444" — coloured bands on the track */
  #renderZones(arc, min, max) {
    const spec = this.getAttribute('zones');
    if (!this.#changed('zones', `${spec}|${arc}|${min}|${max}`)) return;
    if (!spec) return void this.#els.zones.replaceChildren();
    const span = (max - min) || 1;
    const frag = document.createDocumentFragment();
    for (const part of spec.split(',')) {
      const m = part.trim().match(/^(-?[\d.]+)\s*-\s*(-?[\d.]+)\s*:\s*(.+)$/);
      if (!m) continue;
      const a = clamp((parseFloat(m[1]) - min) / span, 0, 1);
      const b = clamp((parseFloat(m[2]) - min) / span, 0, 1);
      if (b <= a) continue;
      frag.append(this.#arcNode('zone', arc * (b - a), arc * a, m[3].trim()));
    }
    this.#els.zones.replaceChildren(frag);
  }

  /** segments="35:#3b82f6, 25:#8b5cf6" — consecutive stacked slices, in value units */
  #renderSegments(arc, min, max) {
    const spec = this.getAttribute('segments');
    if (!this.#changed('segs', `${spec}|${arc}|${min}|${max}`)) return;
    if (!spec) return void this.#els.segments.replaceChildren();
    const span = (max - min) || 1;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const part of spec.split(',')) {
      const m = part.trim().match(/^([\d.]+)\s*:\s*(.+)$/);
      if (!m) continue;
      const len = clamp(parseFloat(m[1]) / span, 0, 1 - at);
      if (len <= 0) continue;
      frag.append(this.#arcNode('segment', arc * len, arc * at, m[2].trim()));
      at += len;
    }
    this.#els.segments.replaceChildren(frag);
  }

  /**
   * On a closed dial 359° -> 1° is a 2° move, not a 358° one. Accumulate an
   * unwrapped angle per pointer so each always takes the short way round.
   */
  #unwrap(key, target, sweep) {
    if (sweep < 360) return target;
    const s = (this.#turns[key] ??= { turn: 0, raw: 0 });
    let step = target - s.raw;
    step -= Math.round(step / 360) * 360;
    s.turn += step;
    s.raw = target;
    return s.turn;
  }

  /** needle — one or two pointers that swing to the value(s) */
  #renderNeedle(sweep, pct) {
    // Angles are relative: .rings already carries --cj-start.
    const on = this.hasAttribute('needle');
    this.#els.needle.toggleAttribute('hidden', !on);
    // centre-mounted hands need a hub to pivot on; rim markers do not
    this.#els.hub.toggleAttribute('hidden', !(on && this.getAttribute('needle') === 'hand'));
    if (on) {
      const a = this.#unwrap('n1', pct * sweep, sweep);
      this.style.setProperty('--cj-needle-angle', `${a.toFixed(2)}deg`);
    }

    // a second pointer, for dials whose two ends mean different things
    const raw2 = this.getAttribute('value-2');
    const has2 = on && raw2 !== null;
    this.#els.needle2.toggleAttribute('hidden', !has2);
    if (has2) {
      const span = (this.max - this.min) || 1;
      const pct2 = clamp((num(raw2, this.min) - this.min) / span, 0, 1);
      const a2 = this.#unwrap('n2', pct2 * sweep, sweep);
      this.style.setProperty('--cj-needle-2-angle', `${a2.toFixed(2)}deg`);
    }
  }

  /**
   * liquid — fill the dial with fluid whose surface sits at the value.
   *
   * The wave path spans two wavelengths so the drift animation can slide it by
   * exactly one and loop invisibly. It is built once and only rebuilt if the
   * amplitude changes, since the level itself moves by transform.
   */
  #renderLiquid(pct) {
    const on = this.hasAttribute('liquid');
    this.#els.liquid.toggleAttribute('hidden', !on);
    if (!on) return;

    const R = 33;                    // the vessel radius the clip path uses
    if (!this.#waveBuilt) {
      // WL must divide evenly into the drift distance, and the path has to stay
      // wider than the vessel at every offset — otherwise sliding it left drags
      // its right-hand edge into view and the vessel appears to empty sideways.
      const WL = 34;
      const wave = (amp) => {
        const pts = [];
        for (let x = -WL; x <= 100 + WL; x += 2) {
          pts.push(`${x},${(50 + Math.sin((x / WL) * Math.PI * 2) * amp).toFixed(2)}`);
        }
        // close the shape downward so it fills everything under the surface
        return `M${pts.join(' L')} L${100 + WL},130 L${-WL},130 Z`;
      };
      this.#els.waveA.setAttribute('d', wave(2.3));
      this.#els.waveB.setAttribute('d', wave(3.4));
      this.#waveBuilt = true;
    }

    // surface at the top of the vessel when full, below the bottom when empty
    this.#els.liquid.style.setProperty('--cj-level', `${(R - pct * 2 * R).toFixed(2)}px`);
  }

  /** rotating — the card turns under a fixed index instead of a pointer moving */
  #renderCard(sweep, pct) {
    const on = this.hasAttribute('rotating');
    this.#els.lubber.toggleAttribute('hidden', !on);
    const a = on ? -this.#unwrap('card', pct * sweep, sweep) : 0;
    this.style.setProperty('--cj-card-angle', `${a.toFixed(2)}deg`);
  }

  /** labels="N,E,S,W" — upright captions spaced around the arc */
  #renderMarks(sweep, start) {
    const spec = this.getAttribute('labels');
    const r = num(this.getAttribute('label-radius'), 29.5);
    if (!this.#changed('marks', `${spec}|${r}|${sweep}|${start}`)) return;
    if (!spec) return void this.#els.marks.replaceChildren();
    const parts = spec.split(',').map((s) => s.trim());
    if (!parts.length) return void this.#els.marks.replaceChildren();

    // A closed dial must not stack the last label on top of the first
    const span = sweep >= 360 ? parts.length : Math.max(1, parts.length - 1);
    const frag = document.createDocumentFragment();
    parts.forEach((text, i) => {
      if (!text) return;
      const a = (start + (i / span) * sweep) * Math.PI / 180;
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', (50 + Math.cos(a) * r).toFixed(2));
      t.setAttribute('y', (50 + Math.sin(a) * r).toFixed(2));
      // the cardinal points read heavier than the intercardinals between them
      if (parts.length % 4 === 0 && i % (parts.length / 4) === 0) t.setAttribute('class', 'major');
      t.textContent = text;
      frag.append(t);
    });
    this.#els.marks.replaceChildren(frag);
  }

  /** ticks="12" tick-major="3" — graduations around the arc */
  #renderTicks(sweep) {
    const n = Math.round(num(this.getAttribute('ticks'), 0));
    const major = Math.round(num(this.getAttribute('tick-major'), 0));
    if (!this.#changed('ticks', `${n}|${major}|${sweep}`)) return;
    if (!(n > 0)) return void this.#els.ticks.replaceChildren();
    // a closed ring would otherwise stack a tick on top of itself at the seam
    const count = sweep >= 360 ? n : n + 1;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      // angles are relative: the parent .rings group already carries --cj-start
      const a = (i / n) * sweep * Math.PI / 180;
      const isMajor = major > 0 && i % major === 0;
      const r1 = isMajor ? 31 : 33.5;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', (50 + Math.cos(a) * r1).toFixed(2));
      line.setAttribute('y1', (50 + Math.sin(a) * r1).toFixed(2));
      line.setAttribute('x2', (50 + Math.cos(a) * 37).toFixed(2));
      line.setAttribute('y2', (50 + Math.sin(a) * 37).toFixed(2));
      if (isMajor) line.setAttribute('class', 'major');
      frag.append(line);
    }
    this.#els.ticks.replaceChildren(frag);
  }

  #renderText(raw) {
    const mode = this.getAttribute('readout') ?? 'percent';
    const decimals = clamp(num(this.getAttribute('decimals'), 0), 0, 6);
    const hide = mode === 'none';
    this.#els.readout.toggleAttribute('hidden', hide);
    if (!hide) {
      const shown = mode === 'value' ? this.value : raw * 100;
      setText(this.#els.num, shown.toFixed(decimals));
      setText(this.#els.unit, this.getAttribute('unit') ?? (mode === 'percent' ? '%' : ''));
    }
    const label = this.getAttribute('label');
    setText(this.#els.label, label ?? '');
    this.#els.label.toggleAttribute('hidden', !label);
  }

  #renderA11y() {
    this.setAttribute('role', this.interactive ? 'slider' : 'meter');
    this.setAttribute('aria-valuenow', String(this.value));
    this.setAttribute('aria-valuemin', String(this.min));
    this.setAttribute('aria-valuemax', String(this.max));
    const label = this.getAttribute('label');
    if (label && !this.hasAttribute('aria-label')) this.setAttribute('aria-label', label);
    const unit = this.getAttribute('unit');
    this.setAttribute('aria-valuetext', unit ? `${this.value}${unit}` : String(this.value));
  }

  // ---- interaction -------------------------------------------------------
  #syncInteractivity() {
    if (this.interactive) {
      if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
      this.addEventListener('pointerdown', this.#onPointerDown);
      this.addEventListener('keydown', this.#onKeyDown);
    } else {
      this.removeAttribute('tabindex');
      this.removeEventListener('pointerdown', this.#onPointerDown);
      this.removeEventListener('keydown', this.#onKeyDown);
    }
  }

  #valueFromPoint(clientX, clientY) {
    const r = this.getBoundingClientRect();
    const deg = Math.atan2(clientY - (r.top + r.height / 2), clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    const sweep = this.#sweep;
    let rel = (deg - this.#start) % 360;
    if (rel < 0) rel += 360;
    if (rel > sweep) rel = (rel - sweep) < (360 - rel) ? sweep : 0; // snap to the nearer end of the gap
    const v = this.min + (rel / sweep) * (this.max - this.min);
    return clamp(Math.round(v / this.step) * this.step, this.min, this.max);
  }

  #commit(v, type) {
    if (v === this.value) return;
    this.value = v;
    this.dispatchEvent(new CustomEvent(type, { detail: { value: v }, bubbles: true }));
  }

  // arrow fields, not methods: private methods are non-writable, so they cannot be .bind()-ed
  #onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.#dragging = true;
    this.setAttribute('data-dragging', '');
    this.setPointerCapture(e.pointerId);
    this.addEventListener('pointermove', this.#onPointerMove);
    this.addEventListener('pointerup', this.#onPointerUp);
    this.addEventListener('pointercancel', this.#onPointerUp);
    this.focus();
    this.#commit(this.#valueFromPoint(e.clientX, e.clientY), 'cj-input');
  };

  #onPointerMove = (e) => {
    if (!this.#dragging) return;
    this.#commit(this.#valueFromPoint(e.clientX, e.clientY), 'cj-input');
  };

  #onPointerUp = () => {
    if (!this.#dragging) return;
    this.#teardownPointer();
    this.dispatchEvent(new CustomEvent('cj-change', { detail: { value: this.value }, bubbles: true }));
  };

  #teardownPointer() {
    this.#dragging = false;
    this.removeAttribute('data-dragging');
    this.removeEventListener('pointermove', this.#onPointerMove);
    this.removeEventListener('pointerup', this.#onPointerUp);
    this.removeEventListener('pointercancel', this.#onPointerUp);
  }

  #onKeyDown = (e) => {
    const s = this.step;
    const big = s * 10;
    const map = {
      ArrowUp: s, ArrowRight: s, ArrowDown: -s, ArrowLeft: -s,
      PageUp: big, PageDown: -big,
    };
    let next;
    if (e.key in map) next = this.value + map[e.key];
    else if (e.key === 'Home') next = this.min;
    else if (e.key === 'End') next = this.max;
    else return;
    e.preventDefault();
    this.#commit(clamp(next, this.min, this.max), 'cj-input');
    this.dispatchEvent(new CustomEvent('cj-change', { detail: { value: this.value }, bubbles: true }));
  };
}

if (!customElements.get('cj-knob')) customElements.define('cj-knob', CJKnob);

export default CJKnob;
