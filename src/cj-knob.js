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
    --cj-peak: #ffc61a;
    --cj-handle: #ffffff;
    --cj-hit: rgba(127, 127, 127, .13);
    --cj-gas: #9ca3af;
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
    /* A dial is an instrument, not text. Its numbers are drawn readings, and
       select-all dragging a blue box across every gauge on a dashboard helps
       nobody. This blocks selection only — pointer and keyboard input, and
       everything a screen reader reads off the ARIA attributes, are untouched. */
    -webkit-user-select: none;
    user-select: none;
  }

  @media (prefers-color-scheme: dark) {
    :host {
      --cj-track: #2f333a;
      --cj-handle: #14161a;
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
  /* the peak marker: the highest reading still being held, drawn like the
     benchmark but in its own colour so the two never read as the same thing */
  .peak {
    stroke: var(--cj-peak);
    stroke-linecap: butt;
    stroke-width: calc(var(--cj-thickness) * 1.5);
  }
  .peak[hidden] { display: none; }
  /* With ballistics the script is already easing the reading frame by frame.
     Leaving the CSS transition on as well would smooth an already-smoothed
     value and the needle would never keep up with its own attack. */
  :host([ballistics]) .value,
  :host([ballistics]) .needle,
  :host([ballistics]) .needle-2,
  :host([ballistics]) .value-mask,
  :host([ballistics]) .peak { transition: none; }
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

  /* ---- button: the dial is the control, not just the readout ---- */
  /* The face takes the press, not the ring: a ring is a hairline and the middle
     is the part anyone actually aims at. */
  :host([button]) { cursor: pointer; }
  :host([button][disabled]) { cursor: not-allowed; }
  .hit {
    fill: var(--cj-hit);
    stroke: none;
    opacity: 0;
    transition: opacity 140ms ease, transform 140ms ease;
    transform-origin: 50% 50%;
    transform-box: view-box;
  }
  :host([button]:hover) .hit { opacity: 1; }
  :host([button]:active) .hit { opacity: 1; transform: scale(.94); }
  :host([button]) .icon { transition: transform 140ms ease; transform-origin: 50% 50%; }
  :host([button]:active) .icon { transform: scale(.9); }
  /* A button's caption is a caption: it belongs clear of the glyph, not tucked
     against it the way a number's label is. The glyph lifts to make the room.
     The width is the tight part — the space inside a ring narrows fast as you
     go down it, so a caption sitting at .215 of the size below centre has only
     about .57 of it to be wide in before its bottom corners reach the track —
     and capping it tighter than that is worse, not better, because the second
     line it then wraps onto reaches further down than the wide one ever did. */
  :host([button]) .center:has(.readout[hidden]) {
    --icon-y: calc(var(--cj-size) * -.075);
    --label-y: calc(var(--cj-size) * .215);
  }
  /* A disc turns about its own middle, so it cannot also be shifted up. It is
     the content rather than a glyph beside one, so it gets more room — and the
     caption drops below it. Set on .center, not on :host: the icon size is
     declared there too, and the nearer declaration is the one that inherits. */
  /* Solved, not chosen: .31 and .22 are the largest disc and the caption depth
     that still let a twelve-character caption sit on ONE line and keep both its
     bottom corners inside the track. Deeper or wider and it wraps, and wrapping
     is a trap here — the caption is anchored by its first line, so a second one
     reaches further down than the wide single line ever did, and no width fixes
     it. */
  :host([spin]) .center:has(.readout[hidden]) {
    --icon-y: 0px;
    --cj-icon-size: calc(var(--cj-size) * .31);
    --label-y: calc(var(--cj-size) * .22);
  }
  /* ---- spin: the dial as a turntable ---- */
  /* Only what is in the middle turns. The ring is the scale and the track is
     the progress; a record spinning under both is what the eye reads as playing. */
  .icon { transform: rotate(var(--cj-spin-angle, 0deg)); }
  :host([spin]) .icon > * { transform-origin: 50% 50%; }
  /* a record is round even when the artwork is not */
  :host([spin]) ::slotted(img), :host([spin]) ::slotted(picture) { border-radius: 50%; }

  /* only one of the two glyphs is ever shown; which one is the pressed state */
  .icon-on { display: none; }
  :host([pressed]) .icon-off { display: none; }
  :host([pressed]) .icon-on { display: block; }

  /* ---- gas: the third state of matter the dial did not have ---- */
  /* Liquid has a surface and a solid has an edge; a gas has neither, so density
     is the only thing left to carry the value. Blobs are stacked, blurred and
     drifting, and the value decides how many of them exist. */
  .gas[hidden] { display: none; }
  .gas circle {
    fill: var(--cj-gas);
    stroke: none;
    animation: cj-waft var(--cj-waft, 14s) ease-in-out infinite alternate;
  }
  @keyframes cj-waft {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(var(--dx), var(--dy)) scale(var(--ds)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .gas circle { animation: none; }
  }

  /* range — a band floating between two handles, instead of a fill from the start */
  .handles[hidden] { display: none; }
  .handle {
    fill: var(--cj-handle);
    stroke: var(--cj-value);
    stroke-width: 2.2;
    transform-origin: 50% 50%;
    transform-box: view-box;
    transition: transform var(--cj-duration) var(--cj-easing);
  }
  .handle-lo { transform: rotate(var(--cj-lo-angle, 0deg)); }
  .handle-hi { transform: rotate(var(--cj-hi-angle, 0deg)); }
  :host([data-dragging]) .handle { transition: none; }
  /* "20–70" is twice the width of a single number, so it needs a smaller type scale */
  :host([range]) {
    --cj-num-size: max(11px, calc(var(--cj-size) * .125));
    /* the label hangs off the number, so a smaller number would otherwise pull it up */
    --range-label-y: 1.05;
  }
  :host([range]) .center:has(.readout:not([hidden])) {
    --label-y: calc(var(--cj-num-size) * var(--range-label-y));
  }
  /* an encoder is spun, not pointed at: the ring must not ease behind the hand */
  :host([endless]) .value,
  :host([endless]) .value-mask,
  :host([endless]) .needle { transition: none; }

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
  /* An icon on its own is the centre; an icon WITH a label shares the space.
     The offsets key off the icon, not the label: now that a centre icon is a
     third of the dial, spacing them by the caption's size puts the caption
     inside the glyph. */
  .center[data-icon]:has(.readout[hidden]):has(.label:not([hidden])) {
    --icon-y: calc(var(--cj-icon-size) * -.34);
    --label-y: calc(var(--cj-icon-size) * .62);
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

  /* ---- the inset region ---- */
  /*
   * Something living inside the face: a trace, a tube, a sparkline. The knob
   * lays it out; it does not draw it, so the slotted element stays an ordinary
   * one you can style and script directly. All this solves is where it goes.
   *
   * The room available is a circle, so a box low on the face is much narrower
   * than one across the middle. inset="low" sits its CENTRE at .19 of the size
   * below the middle, which is the deepest a box .52 wide can go while both its
   * bottom corners stay inside the ring's inner edge. Going lower and wider is
   * what pushes a chart out through the track.
   */
  .inset {
    grid-area: 1 / 1;
    align-self: center;
    /* the text lift is added back, so raising the number does not raise the
       chart with it — they would then never come apart */
    translate: 0 calc(var(--inset-y) + var(--inset-lift, 0px));
    inline-size: calc(var(--cj-size) * var(--inset-w));
    /* Bounded, and clipped if the content overruns it. A slotted element
       brings its own height — a cj-trace is 130px tall by default — and
       without a ceiling it hangs out through the ring and off the dial
       entirely. Clipped inside the face beats spilling across the page. */
    max-block-size: calc(var(--cj-size) * var(--inset-h));
    overflow: hidden;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .inset > slot { display: block; }
  .center:not([data-inset]) .inset { display: none; }

  /* inset="low" — a chart under the number, across the lower third of the face */
    /* Every one of these is the deepest, widest, tallest box whose corners all
     still fall inside the ring: half-width .25 at .28 below centre gives a
     corner radius of .375, against an inner edge at about .39 of the size. */
  :host { --inset-y: calc(var(--cj-size) * .17); --inset-w: .5; --inset-h: .22; }
  /* inset="fill" — a tube or a column standing up the middle of the face */
    /* A tube is narrow and tall, so it trades width for height and gets far more
     of it — the corners are what the circle constrains, not the height. */
  :host([inset="fill"]) { --inset-y: 0px; --inset-w: .34; --inset-h: .70; }

  /* With something in the lower third, the number and its label move up out of
     the way instead of sitting on top of it. */
  .center[data-inset="low"]:has(.readout:not([hidden])) {
    --label-y: calc(var(--cj-num-size) * .82);
    --inset-lift: calc(var(--cj-size) * .14);
    translate: 0 calc(var(--cj-shift) - var(--inset-lift));
  }

  /* ---- the breathing ring ---- */
  .pulse {
    fill: none;
    stroke: var(--cj-pulse, var(--cj-value));
    stroke-width: calc(var(--cj-thickness) * .5);
    transform-origin: 50% 50%;
    transform-box: view-box;
    opacity: 0;
    animation: cj-breathe var(--cj-pulse-period, 1s) ease-out infinite;
  }
  .pulse[hidden] { display: none; }
  @keyframes cj-breathe {
    0%   { transform: scale(1);    opacity: .6; }
    75%  { transform: scale(1.17); opacity: 0; }
    100% { transform: scale(1.17); opacity: 0; }
  }
  /* Parked, not deleted: a still ring at rest still reads as part of the dial,
     where removing it would leave a gap where something used to be. */
  @media (prefers-reduced-motion: reduce) {
    .pulse { animation: none; opacity: .28; }
  }

  /* Anchored by its first line, not by its middle. Centring the whole box on
     --label-y meant a label that wrapped to two lines grew half a line UPWARD,
     back under the number — which is exactly where it must not go. Starting from
     the top of the centre box and backing off half a line reproduces the
     one-line position and lets any extra lines grow downward instead. */
  .label {
    align-self: start;
    translate: 0 calc(var(--cj-size) * .5 + var(--label-y, 0px) - .6em);
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
  .center:has(.readout[hidden]) .label { max-inline-size: calc(var(--cj-size) * .52); }

  /* Graphics get sized by width; anything else (an emoji, a glyph) by font-size.
     With a number in the middle the icon is a label for it and steps back. With
     readout="none" the icon IS the middle, and it should look like it — a line
     drawing at 15% of the dial is a smudge you have to lean in to identify. */
  :host { --cj-icon-size: calc(var(--cj-size) * .2); }
  .center:has(.readout[hidden]) { --cj-icon-size: calc(var(--cj-size) * .34); }
  ::slotted(*) { font-size: var(--cj-icon-size); line-height: 1; }
  ::slotted(img), ::slotted(svg), ::slotted(picture) {
    inline-size: var(--cj-icon-size);
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
    <filter id="cj-haze" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="5.5"/>
    </filter>
    <mask id="cj-arcmask" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <circle class="value-mask" cx="50" cy="50" r="42" pathLength="100"
              fill="none" stroke="#fff" stroke-linecap="round"
              stroke-dasharray="100 100" stroke-dashoffset="100"/>
    </mask>
  </defs>

  <!-- Liquid: a wave-topped body whose surface sits at the value. Two waves of
       different wavelength and speed drift across each other, which reads as
       moving fluid rather than a bar that happens to have a wavy edge. -->
  <g class="gas" part="gas" clip-path="url(#cj-vessel)" filter="url(#cj-haze)" hidden></g>

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
    <circle class="peak" part="peak" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="0 100" hidden/>
    <!-- Range handles. Drawn at the rim pointing right, like the needles, and
         swung into place by their own angle properties. -->
    <g class="handles" part="handles" hidden>
      <circle class="handle handle-lo" part="handle" cx="92" cy="50" r="4.4"/>
      <circle class="handle handle-hi" part="handle" cx="92" cy="50" r="4.4"/>
    </g>
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
  <!-- a ring that swells and fades on the beat, so the rhythm is legible from
       across the room even when the number is not -->
  <circle class="pulse" part="pulse" cx="50" cy="50" r="42" hidden/>
  <circle class="hit" cx="50" cy="50" r="33"/>
  <circle class="focus-ring" cx="50" cy="50" r="49"/>
</svg>

<div class="center" part="center">
  <div class="readout" part="readout"><span class="num"></span><span class="unit"></span></div>
  <div class="icon">
    <span class="icon-off"><slot name="icon"></slot></span>
    <span class="icon-on"><slot name="icon-on"></slot></span>
  </div>
  <div class="label" part="label" hidden></div>
  <!-- Anything that belongs inside the face rather than beside it: a trace, a
       tube, a sparkline. Kept inside the ring's inner circle so it cannot poke
       out through the track. -->
  <div class="inset" part="inset"><slot name="inset"></slot></div>
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
    'ballistics', 'peak-hold', 'peak-fall',
    'range', 'endless', 'pulse', 'inset', 'button', 'toggle', 'pressed', 'gas', 'spin',
    'interactive', 'disabled', 'step',
  ];

  #root;
  #els;
  #dragging = false;
  #ownsColor = false;
  #grab = null;      // which range handle a drag has hold of
  #lastAngle = 0;    // where an endless encoder was last seen, for the delta
  #turnAcc = 0;      // the encoder's exact total, before the step rounds it
  // unwrapped angles per pointer, so a full dial never spins the long way round
  #turns = {};
  // the wave path is geometry, not state — build it once and move it by transform
  #waveBuilt = false;
  #gasBuilt = false;
  // a turntable takes a moment to come up to speed and longer to stop
  #spinFrame = 0;
  #spinLast = 0;
  #spinAngle = 0;
  #spinRate = 0;
  #ro = null;      // watches the box, so the caption can be refitted when it changes
  #boxW = 0;
  #fitSig = '';
  #tick = 0;        // ballistics frame id
  #tickLast = 0;
  #shown = 0;       // the reading being drawn, lagging value when ballistics are on
  #peak = 0;        // the highest reading still held
  #peakAge = 0;
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
      peak: q('.peak'),
      handles: q('.handles'),
      handleLo: q('.handle-lo'),
      handleHi: q('.handle-hi'),
      hub: q('.hub'),
      liquid: q('.liquid'),
      waveA: q('.wave-a'),
      waveB: q('.wave-b'),
      marks: q('.marks'),
      center: q('.center'),
      slot: q('slot[name="icon"]'),
      insetSlot: q('slot[name="inset"]'),
      pulse: q('.pulse'),
      gas: q('.gas'),
      iconOnSlot: q('slot[name="icon-on"]'),
      readout: q('.readout'),
      num: q('.num'),
      unit: q('.unit'),
      label: q('.label'),
    };
    this.#els.slot.addEventListener('slotchange', () => this.#syncIcon());
    this.#els.insetSlot.addEventListener('slotchange', () => this.#syncInset());
  }

  // CSS cannot ask "is anything slotted?", so record it as an attribute it can match.
  // slotchange is async, so this also runs synchronously on connect — otherwise the
  // first painted frame lays the icon out as if there were none.
  #syncIcon() {
    const filled = this.#els.slot.assignedNodes({ flatten: true })
      .some((n) => n.nodeType === Node.ELEMENT_NODE || n.textContent.trim());
    this.#els.center.toggleAttribute('data-icon', filled);
  }

  // Same problem as the icon, same answer: CSS cannot ask whether a slot has
  // anything in it, so record it as an attribute that CSS can match on.
  #syncInset() {
    const filled = this.#els.insetSlot.assignedElements({ flatten: true }).length > 0;
    if (filled) this.#els.center.setAttribute('data-inset', this.getAttribute('inset') ?? 'low');
    else this.#els.center.removeAttribute('data-inset');
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

  /**
   * range="20 70" — two handles with a band between them, instead of one value.
   * Reads back as {low, high}, or null on an ordinary dial. Assigning takes
   * either shape: knob.range = [20, 70] or knob.range = {low: 20, high: 70}.
   */
  get range() {
    if (!this.hasAttribute('range')) return null;
    const p = (this.getAttribute('range') || '').trim().split(/[ ,]+/).filter(Boolean);
    const a = clamp(num(p[0], this.min), this.min, this.max);
    const b = clamp(num(p[1], this.max), this.min, this.max);
    // written the wrong way round is a typo, not an error — read it as a span
    return a <= b ? { low: a, high: b } : { low: b, high: a };
  }

  set range(v) {
    if (v == null) return void this.removeAttribute('range');
    const { low, high } = Array.isArray(v) ? { low: v[0], high: v[1] } : v;
    this.setAttribute('range', `${low} ${high}`);
  }

  /** Whether a toggle button is currently on. Attribute: `pressed`. */
  get pressed() { return this.hasAttribute('pressed'); }
  set pressed(v) { this.toggleAttribute('pressed', !!v); }

  /** endless — a knob with no ends: it keeps turning and the value keeps counting. */
  get endless() { return this.hasAttribute('endless'); }
  set endless(v) { this.toggleAttribute('endless', !!v); }

  get interactive() { return this.hasAttribute('interactive') && !this.hasAttribute('disabled'); }
  set interactive(v) { this.toggleAttribute('interactive', !!v); }

  // ---- lifecycle ---------------------------------------------------------
  connectedCallback() {
    this.#syncInteractivity();
    this.#syncIcon();
    this.#syncInset();
    // seed the reading at the value, or every meter would sweep up from zero on load
    this.#shown = this.value;
    this.#peak = this.value;
    this.#render();
    this.#pump();
    this.#pumpSpin();
    // The caption is fitted to the circle, so it has to be refitted when the
    // circle changes size. Only an actual resize fires this, so a dial whose
    // value is moving sixty times a second pays nothing for it.
    this.#ro = new ResizeObserver(() => {
      const w = this.clientWidth;
      if (w === this.#boxW) return;
      this.#boxW = w;
      this.#fitLabel();
    });
    this.#ro.observe(this);
  }

  disconnectedCallback() {
    this.#ro?.disconnect();
    this.#ro = null;
    cancelAnimationFrame(this.#spinFrame);
    this.#spinFrame = 0;   // zeroed, or a re-attached turntable never starts again
    cancelAnimationFrame(this.#tick);
    // clearing the id matters: #pump() reads a non-zero one as already running
    this.#tick = 0;
    this.#teardownPointer();
    this.removeEventListener('pointerdown', this.#onPointerDown);
    this.removeEventListener('keydown', this.#onKeyDown);
  }

  // Rendering is synchronous on purpose: the geometry and the ARIA attributes must be
  // correct in the DOM the moment the element connects, not one animation frame later
  // (rAF is throttled in background tabs, and assistive tech reads the DOM, not the paint).
  attributeChangedCallback(name) {
    if (name === 'interactive' || name === 'disabled' || name === 'button') this.#syncInteractivity();
    if (name === 'inset') this.#syncInset();
    if (!this.isConnected) return;
    this.#render();
    // a new value is a target for the ballistics, not a jump
    this.#pump();
    if (name === 'spin' || name === 'pressed' || name === 'toggle') this.#pumpSpin();
  }

  // ---- render ------------------------------------------------------------
  #render() {
    if (!this.isConnected) return;
    const { min, max } = this;
    const sweep = this.#sweep;
    const arc = (sweep / 360) * PATH_LENGTH;
    // the dial draws the reading, which is the value unless ballistics lag it
    const span = (max - min) || 1;
    let raw = (this.shown - min) / span;
    // An encoder has no ends. Past max the ring starts round again rather than
    // stopping, while the number under it keeps counting — that mismatch is the
    // whole point of the thing: position is relative, the total is absolute.
    const endless = this.hasAttribute('endless');
    if (endless) raw -= Math.floor(raw);
    const pct = clamp(raw, 0, 1);
    const over = endless ? 0 : clamp(raw - 1, 0, 1);

    this.style.setProperty('--cj-start', `${this.#start}deg`);
    this.style.setProperty('--cj-arc', String(arc));
    // a partial arc leaves a gap at the bottom, so nudge the text up in proportion to it
    const shift = (-(360 - sweep) / 360 * 0.14).toFixed(4);
    this.style.setProperty('--cj-shift', `calc(var(--cj-size) * ${shift})`);

    const dash = `${arc} ${PATH_LENGTH}`;
    this.#els.track.setAttribute('stroke-dasharray', dash);

    // A range dial fills between its two handles rather than from the start of
    // the arc — the same dash trick the zones use: a dash as long as the band,
    // pushed along the path by a negative offset to where the band begins.
    const range = this.range;
    this.#els.handles.toggleAttribute('hidden', !range);
    let bandDash = dash;
    let bandOffset = arc * (1 - pct);
    if (range) {
      const lo = (range.low - min) / span;
      const hi = (range.high - min) / span;
      bandDash = `${arc * (hi - lo)} ${PATH_LENGTH}`;
      bandOffset = -(arc * lo);
      this.style.setProperty('--cj-lo-angle', `${(lo * sweep).toFixed(2)}deg`);
      this.style.setProperty('--cj-hi-angle', `${(hi * sweep).toFixed(2)}deg`);
    }
    for (const el of [this.#els.value, this.#els.valueMask]) {
      el.setAttribute('stroke-dasharray', bandDash);
      el.setAttribute('stroke-dashoffset', bandOffset);
    }

    // peak hold: the same short tick, parked at the highest reading still held
    const holding = this.hasAttribute('peak-hold');
    this.#els.peak.toggleAttribute('hidden', !holding);
    if (holding) {
      const pk = clamp((this.#peak - min) / ((max - min) || 1), 0, 1);
      const tick = 1.2;
      this.#els.peak.setAttribute('stroke-dasharray', `${tick} ${PATH_LENGTH}`);
      this.#els.peak.setAttribute('stroke-dashoffset', -(arc * pk - tick / 2));
    }

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
    this.#renderGas(pct);
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

    this.#renderPulse();
    this.#renderText(raw, range);
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

  // ---- ballistics and peak hold -------------------------------------------
  /**
   * A meter needle does not track its input. It has ballistics: it snaps up and
   * sags back, because the mass behind it can be flicked upward far faster than
   * gravity and damping can return it. `ballistics="attack release"` in seconds
   * gives the two time constants; one number sets both.
   */
  get #ballistics() {
    if (!this.hasAttribute('ballistics')) return null;
    const parts = (this.getAttribute('ballistics') || '').trim().split(/\s+/).filter(Boolean);
    const attack = num(parts[0], 0.02);
    return { attack, release: num(parts[1], parts.length > 1 ? 0.45 : attack) };
  }

  /** The reading the dial is drawing, which lags the value when ballistics are on. */
  get shown() {
    return this.#ballistics ? this.#shown : this.value;
  }

  /** The highest reading still being held, or null when peak hold is off. */
  get peak() {
    return this.hasAttribute('peak-hold') ? this.#peak : null;
  }

  /**
   * Advance the reading and the peak, then draw. Runs only while something is
   * still moving: once the needle has settled and the peak has caught up with
   * it there is nothing left to animate, so the loop lets go of the frame.
   */
  #pump() {
    if (!this.#ballistics && !this.hasAttribute('peak-hold')) {
      cancelAnimationFrame(this.#tick);
      this.#tick = 0;
      return;
    }
    if (this.#tick) return;              // already running; it reads the target itself
    this.#tickLast = performance.now();

    const step = (now) => {
      // a long frame must not let the needle teleport past its own ballistics
      const dt = Math.min(0.05, Math.max(0, (now - this.#tickLast) / 1000));
      this.#tickLast = now;

      const target = this.value;
      const b = this.#ballistics;
      if (b) {
        // rising and falling are different constants — that is the whole effect
        const tau = target > this.#shown ? b.attack : b.release;
        this.#shown += (target - this.#shown) * (tau > 0 ? 1 - Math.exp(-dt / tau) : 1);
      } else {
        this.#shown = target;
      }

      let busy = Math.abs(target - this.#shown) > (Math.abs(target) + 1) * 1e-4;

      if (this.hasAttribute('peak-hold')) {
        const hold = num(this.getAttribute('peak-hold'), 1.2);
        const fall = num(this.getAttribute('peak-fall'),
          Math.abs(this.max - this.min) * 0.35);
        if (this.#shown >= this.#peak) {
          // a new high is taken instantly; that is what makes it a peak
          this.#peak = this.#shown;
          this.#peakAge = 0;
        } else {
          this.#peakAge += dt;
          if (this.#peakAge > hold) this.#peak = Math.max(this.#shown, this.#peak - fall * dt);
        }
        busy = busy || this.#peak > this.#shown;
      }

      this.#render();
      if (!busy) { this.#tick = 0; return; }
      this.#tick = requestAnimationFrame(step);
    };
    this.#tick = requestAnimationFrame(step);
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

  /**
   * gas — density instead of a level.
   *
   * Liquid has a surface and a solid has an edge; a gas has neither, so the only
   * thing left to carry the value is how much of the dial is occupied. The blobs
   * are built once and then switched on and off: the value decides how many
   * exist, not where they are, so a rising value thickens the cloud instead of
   * rearranging it.
   */
  #renderGas(pct) {
    const on = this.hasAttribute('gas');
    this.#els.gas.toggleAttribute('hidden', !on);
    if (!on) return;

    const COUNT = 11;
    if (!this.#gasBuilt) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < COUNT; i++) {
        // A deterministic scatter, not Math.random: two dials showing the same
        // value should look the same, and a re-render must not reshuffle it.
        const a = i * 2.399963;                 // the golden angle, so they never band
        const r = 4 + 20 * Math.sqrt((i + 0.5) / COUNT);
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', (50 + Math.cos(a) * r).toFixed(2));
        c.setAttribute('cy', (50 + Math.sin(a) * r).toFixed(2));
        // Big and few, not small and many. Small blobs read as a rash of dots;
        // large overlapping ones blur into the single soft mass that says "gas".
        c.setAttribute('r', (11 + (i % 4) * 3).toFixed(2));
        c.style.setProperty('--dx', `${(Math.cos(a * 3.1) * 7).toFixed(2)}px`);
        c.style.setProperty('--dy', `${(Math.sin(a * 2.7) * 7).toFixed(2)}px`);
        c.style.setProperty('--ds', (1 + (i % 4) * 0.09).toFixed(2));
        c.style.setProperty('--cj-waft', `${(12 + (i % 6) * 2.4).toFixed(1)}s`);
        c.style.animationDelay = `-${(i * 0.7).toFixed(1)}s`;
        frag.append(c);
      }
      this.#els.gas.replaceChildren(frag);
      this.#gasBuilt = true;
    }

    const live = Math.floor(pct * COUNT);
    const edge = pct * COUNT - live;
    const blobs = this.#els.gas.children;
    for (let i = 0; i < blobs.length; i++) {
      // the blob at the edge fades in rather than popping, so a slowly rising
      // value thickens smoothly instead of ticking over like a counter
      const o = i < live ? 1 : (i === live ? edge : 0);
      const next = (o * 0.3).toFixed(3);
      if (blobs[i].getAttribute('opacity') !== next) blobs[i].setAttribute('opacity', next);
    }
  }

  /**
   * spin — the middle of the dial turns, like a record under a tonearm.
   *
   * The value is revolutions per minute; bare `spin` is 33, which is what an LP
   * does. On a `toggle` button it only turns while pressed, because a record
   * that keeps spinning after you hit pause is not what anyone has ever seen.
   *
   * Speed is eased rather than switched. A turntable that reaches full speed in
   * one frame and stops dead in another reads as a broken animation; the whole
   * recognisable thing about one is the wind-up and the coast.
   */
  #pumpSpin() {
    const wants = this.hasAttribute('spin')
      && !(this.hasAttribute('toggle') && !this.pressed);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      cancelAnimationFrame(this.#spinFrame);
      this.#spinFrame = 0;
      this.#spinRate = 0;
      return;
    }
    if (!wants && this.#spinRate === 0) {
      cancelAnimationFrame(this.#spinFrame);
      this.#spinFrame = 0;
      return;
    }
    if (this.#spinFrame) return;
    this.#spinLast = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - this.#spinLast) / 1000));
      this.#spinLast = now;
      const on = this.hasAttribute('spin')
        && !(this.hasAttribute('toggle') && !this.pressed);
      const target = on ? clamp(num(this.getAttribute('spin'), 33), 0, 600) : 0;
      // Spinning up is a motor: torque against inertia, so it eases in. Coasting
      // down is friction, which is near enough constant — and that difference is
      // not pedantry, it is the only way it ever actually stops. Easing toward
      // zero approaches it and never arrives: nine seconds later the platter was
      // still creeping round.
      if (target > this.#spinRate) {
        this.#spinRate += (target - this.#spinRate) * (1 - Math.exp(-dt / 0.55));
      } else {
        const DECEL = 26;   // rpm per second, so an LP takes about a second and a half
        this.#spinRate = Math.max(target, this.#spinRate - DECEL * dt);
      }
      this.#spinAngle = (this.#spinAngle + this.#spinRate * 6 * dt) % 360;
      this.style.setProperty('--cj-spin-angle', `${this.#spinAngle.toFixed(2)}deg`);
      if (!on && this.#spinRate === 0) { this.#spinFrame = 0; return; }
      this.#spinFrame = requestAnimationFrame(step);
    };
    this.#spinFrame = requestAnimationFrame(step);
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

  /**
   * pulse — a ring that breathes at a rate, so a heart or an engine reads as
   * having a rhythm and not just a number.
   *
   * The value is beats per minute. `pulse="auto"` takes it from the dial's own
   * reading instead, which is what a heart rate dial actually wants: the ring
   * speeds up and slows down with the number, rather than sitting at whatever
   * rate it was given once. Bare `pulse` is 60.
   */
  #renderPulse() {
    const on = this.hasAttribute('pulse');
    this.#els.pulse.toggleAttribute('hidden', !on);
    if (!on) return;
    const spec = this.getAttribute('pulse');
    const bpm = clamp(spec === 'auto' ? this.shown : num(spec, 60), 1, 600);
    // rounded, or every frame of a moving value restarts the animation and the
    // ring never gets far enough through a breath to be seen taking one
    this.style.setProperty('--cj-pulse-period', `${(60 / Math.round(bpm)).toFixed(2)}s`);
  }

  /**
   * How wide the caption may be where it sits.
   *
   * The room inside a ring is a circle, so a caption low on the face has far
   * less of it than one across the middle — and the deeper it goes the faster
   * that room runs out. Hand-picked widths per layout do not survive contact
   * with an actual caption: too generous and its bottom corners cross the
   * track, too tight and it wraps onto a second line that reaches further down
   * than the wide one ever did.
   *
   * So it is solved rather than guessed. The chord at the caption's own depth
   * is what it may be wide, and two passes settle it: the first measures the
   * height it wants, the second the height it ends up with once wrapped.
   */
  #fitLabel() {
    const el = this.#els.label;
    if (!this.#boxW || el.hasAttribute('hidden')) return;
    const size = this.#boxW;
    const th = num(getComputedStyle(this).getPropertyValue('--cj-thickness'), 8);
    // the inner edge of the track, less a hair so nothing sits exactly on it
    const R = (size * 0.42 - size * th / 200) * 0.97;

    // Measured, not read off --label-y. A custom property computes to its own
    // token stream, so that one comes back as the string "calc(190px * .285)"
    // and parses as nothing at all. Where the caption actually is cannot lie.
    const reach = () => {
      const host = this.getBoundingClientRect();
      const cx = host.left + host.width / 2, cy = host.top + host.height / 2;
      const b = el.getBoundingClientRect();
      return {
        worst: Math.max(
          Math.hypot(b.left - cx, b.top - cy), Math.hypot(b.right - cx, b.top - cy),
          Math.hypot(b.left - cx, b.bottom - cy), Math.hypot(b.right - cx, b.bottom - cy)),
        deep: Math.max(Math.abs(b.top - cy), Math.abs(b.bottom - cy)),
      };
    };

    el.style.maxInlineSize = '';
    const loose = reach();
    if (loose.worst <= R) return;         // already inside; leave it alone

    const half = Math.sqrt(Math.max(0, R * R - loose.deep * loose.deep));
    if (half <= 0) return;
    el.style.maxInlineSize = `${(half * 2).toFixed(1)}px`;

    // Narrowing is not automatically an improvement. The caption is anchored by
    // its first line, so a second one reaches further DOWN than the wide single
    // line ever did — and down is the direction the circle runs out in. Keep the
    // narrower version only if it actually pulled the corners in.
    if (reach().worst >= loose.worst) el.style.maxInlineSize = '';
  }

  #renderText(raw, range) {
    const mode = this.getAttribute('readout') ?? 'percent';
    const decimals = clamp(num(this.getAttribute('decimals'), 0), 0, 6);
    const hide = mode === 'none';
    this.#els.readout.toggleAttribute('hidden', hide);
    if (!hide) {
      if (range) {
        // a range has no single number to show, so it shows the span it covers
        setText(this.#els.num, `${range.low.toFixed(decimals)}–${range.high.toFixed(decimals)}`);
        setText(this.#els.unit, this.getAttribute('unit') ?? '');
      } else {
        const shown = mode === 'value' ? this.value : raw * 100;
        setText(this.#els.num, shown.toFixed(decimals));
        setText(this.#els.unit, this.getAttribute('unit') ?? (mode === 'percent' ? '%' : ''));
      }
    }
    const label = this.getAttribute('label');
    setText(this.#els.label, label ?? '');
    this.#els.label.toggleAttribute('hidden', !label);
    // refit only when something that moves the caption has moved: the text, the
    // box, or the layout case that decides how far down it sits
    const sig = `${label}|${this.#boxW}|${mode}|${this.hasAttribute('button')}|${this.hasAttribute('spin')}`;
    if (label && sig !== this.#fitSig) {
      this.#fitSig = sig;
      this.#fitLabel();
    }
  }

  #renderA11y() {
    const range = this.range;
    if (this.hasAttribute('button')) {
      this.setAttribute('role', 'button');
      // a plain button has no pressed state to announce; a toggle does
      if (this.hasAttribute('toggle')) this.setAttribute('aria-pressed', String(this.pressed));
      else this.removeAttribute('aria-pressed');
    } else {
      this.removeAttribute('aria-pressed');
      this.setAttribute('role', this.interactive ? 'slider' : 'meter');
    }
    if (this.hasAttribute('button')) return this.#renderA11yLabel();
    this.setAttribute('aria-valuenow', String(range ? range.high : this.value));
    this.setAttribute('aria-valuemin', String(this.min));
    this.setAttribute('aria-valuemax', String(this.max));
    const label = this.getAttribute('label');
    if (label && !this.hasAttribute('aria-label')) this.setAttribute('aria-label', label);
    const unit = this.getAttribute('unit') ?? '';
    const text = range ? `${range.low}${unit} to ${range.high}${unit}` : `${this.value}${unit}`;
    this.setAttribute('aria-valuetext', text);
  }

  /** the accessible name, which a button needs even though its numbers do not apply */
  #renderA11yLabel() {
    const label = this.getAttribute('label');
    if (label && !this.hasAttribute('aria-label')) this.setAttribute('aria-label', label);
  }

  // ---- interaction -------------------------------------------------------
  #syncInteractivity() {
    // A button is a different control from a slider, so it gets its own wiring
    // rather than sharing the drag path: the ring is a hairline, and what anyone
    // aims at on a button is the whole face.
    const isButton = this.hasAttribute('button') && !this.hasAttribute('disabled');
    if (isButton) {
      if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
      this.addEventListener('click', this.#onActivate);
      this.addEventListener('keydown', this.#onButtonKey);
    } else {
      this.removeEventListener('click', this.#onActivate);
      this.removeEventListener('keydown', this.#onButtonKey);
      if (!this.interactive) this.removeAttribute('tabindex');
    }
    if (this.interactive) {
      if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
      this.addEventListener('pointerdown', this.#onPointerDown);
      this.addEventListener('keydown', this.#onKeyDown);
    } else {
      // a button put that tabindex there a moment ago; only a dial that is
      // neither a slider nor a button has no reason to be focusable
      if (!isButton) this.removeAttribute('tabindex');
      this.removeEventListener('pointerdown', this.#onPointerDown);
      this.removeEventListener('keydown', this.#onKeyDown);
    }
  }

  /** where the pointer is, as an angle about the centre, in degrees */
  #angleAt(clientX, clientY) {
    const r = this.getBoundingClientRect();
    return Math.atan2(clientY - (r.top + r.height / 2), clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  }

  #valueFromPoint(clientX, clientY) {
    const deg = this.#angleAt(clientX, clientY);
    const sweep = this.#sweep;
    let rel = (deg - this.#start) % 360;
    if (rel < 0) rel += 360;
    if (rel > sweep) rel = (rel - sweep) < (360 - rel) ? sweep : 0; // snap to the nearer end of the gap
    const v = this.min + (rel / sweep) * (this.max - this.min);
    return clamp(Math.round(v / this.step) * this.step, this.min, this.max);
  }

  /**
   * An encoder reads how far the hand moved, not where it points — which is what
   * lets it keep going past the end. The step is taken the short way round, so
   * crossing the seam at the top is a nudge and not a full turn backwards.
   *
   * The running total is kept unrounded and only the committed value is snapped
   * to the step. Rounding the total itself would feed each frame's rounding back
   * into the next one, and a slow turn — many small deltas, each rounded up —
   * would drift: half a revolution of hand movement arriving as two thirds.
   */
  #turnBy(clientX, clientY) {
    const deg = this.#angleAt(clientX, clientY);
    let d = deg - this.#lastAngle;
    d -= Math.round(d / 360) * 360;
    this.#lastAngle = deg;
    this.#turnAcc += (d / this.#sweep) * ((this.max - this.min) || 1);
    return Math.round(this.#turnAcc / this.step) * this.step;
  }

  /** move whichever handle the drag has hold of; the two may meet but not cross */
  #commitRange(v) {
    const r = this.range;
    if (!r) return;
    const low = this.#grab === 'low' ? Math.min(v, r.high) : r.low;
    const high = this.#grab === 'low' ? r.high : Math.max(v, r.low);
    if (low === r.low && high === r.high) return;
    this.setAttribute('range', `${low} ${high}`);
    this.dispatchEvent(new CustomEvent('cj-input', { detail: { low, high }, bubbles: true }));
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
    const range = this.range;
    if (range) {
      // Take hold of whichever handle is nearer, and keep hold of it for the whole
      // drag. Re-deciding on every move would hand the drag to the other handle
      // the moment the pointer passed it, and the band would turn inside out.
      const v = this.#valueFromPoint(e.clientX, e.clientY);
      this.#grab = Math.abs(v - range.low) <= Math.abs(v - range.high) ? 'low' : 'high';
      this.#commitRange(v);
    } else if (this.endless) {
      // no jump to where the pointer landed: an encoder only reports movement
      this.#lastAngle = this.#angleAt(e.clientX, e.clientY);
      this.#turnAcc = this.value;
    } else {
      this.#commit(this.#valueFromPoint(e.clientX, e.clientY), 'cj-input');
    }
  };

  #onPointerMove = (e) => {
    if (!this.#dragging) return;
    if (this.range) this.#commitRange(this.#valueFromPoint(e.clientX, e.clientY));
    else if (this.endless) this.#commit(this.#turnBy(e.clientX, e.clientY), 'cj-input');
    else this.#commit(this.#valueFromPoint(e.clientX, e.clientY), 'cj-input');
  };

  #onPointerUp = () => {
    if (!this.#dragging) return;
    const r = this.range;
    this.#teardownPointer();
    this.dispatchEvent(new CustomEvent('cj-change', {
      detail: r ? { low: r.low, high: r.high } : { value: this.value },
      bubbles: true,
    }));
  };

  #teardownPointer() {
    this.#dragging = false;
    this.#grab = null;
    this.removeAttribute('data-dragging');
    this.removeEventListener('pointermove', this.#onPointerMove);
    this.removeEventListener('pointerup', this.#onPointerUp);
    this.removeEventListener('pointercancel', this.#onPointerUp);
  }

  #onActivate = () => {
    if (this.hasAttribute('disabled')) return;
    if (this.hasAttribute('toggle')) this.pressed = !this.pressed;
    this.#pumpSpin();
    this.dispatchEvent(new CustomEvent('cj-press', {
      detail: { pressed: this.pressed },
      bubbles: true,
    }));
  };

  // Enter and Space are what a button answers to. Space is also the one a browser
  // scrolls the page with, so it has to be swallowed.
  #onButtonKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    this.#onActivate();
  };

  #onKeyDown = (e) => {
    const s = this.step;
    const big = s * 10;
    const map = {
      ArrowUp: s, ArrowRight: s, ArrowDown: -s, ArrowLeft: -s,
      PageUp: big, PageDown: -big,
    };
    const r = this.range;
    if (r) {
      // arrows move the high handle, shift+arrows the low one — the same two
      // targets the pointer has, reachable without one
      const known = e.key in map || e.key === 'Home' || e.key === 'End';
      if (!known) return;
      e.preventDefault();
      this.#grab = e.shiftKey ? 'low' : 'high';
      const from = e.shiftKey ? r.low : r.high;
      const to = e.key === 'Home' ? this.min : e.key === 'End' ? this.max : from + map[e.key];
      this.#commitRange(clamp(to, this.min, this.max));
      this.dispatchEvent(new CustomEvent('cj-change', { detail: { ...this.range }, bubbles: true }));
      return;
    }

    let next;
    if (e.key in map) next = this.value + map[e.key];
    else if (e.key === 'Home') next = this.min;
    else if (e.key === 'End') next = this.max;
    else return;
    e.preventDefault();
    // an encoder has no ends to stop at, so stepping never clamps
    this.#commit(this.endless && e.key in map ? next : clamp(next, this.min, this.max), 'cj-input');
    this.dispatchEvent(new CustomEvent('cj-change', { detail: { value: this.value }, bubbles: true }));
  };
}

if (!customElements.get('cj-knob')) customElements.define('cj-knob', CJKnob);

export default CJKnob;
