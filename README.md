# cj-knob

A knob, gauge and meter as a single custom element. **Zero runtime dependencies, no build step, no framework.**

```html
<script type="module" src="cj-knob/src/cj-knob.js"></script>

<cj-knob value="78"></cj-knob>
<cj-knob value="64" sweep="270" color="#7c3aed" label="Gauge"></cj-knob>
<cj-knob value="60" interactive label="Volume"></cj-knob>
```

Because it is a custom element it works the same in plain HTML, React, Vue, Svelte, Astro or anything else that renders DOM.

## Install

```sh
npm install cj-knob
```

```js
import 'cj-knob';           // registers <cj-knob>
import { CJKnob } from 'cj-knob';  // if you need the class
```

Or drop it in with no tooling at all:

```html
<script type="module" src="https://esm.sh/cj-knob"></script>
```

## Attributes

| Attribute | Default | Description |
|---|---|---|
| `value` | `min` | Current value. Above `max` an inner overflow ring appears. |
| `min` / `max` | `0` / `100` | The scale. |
| `sweep` | `360` | Degrees of arc. `360` is a ring, `270` a gauge, `180` a half-circle. |
| `start` | auto | Start angle in degrees (`0` = 3 o'clock). Defaults to the top for a full ring, and to a bottom-centred gap otherwise. |
| `benchmark` | — | Draws a target tick at this value, on top of the value ring. |
| `readout` | `percent` | `percent`, `value`, or `none`. |
| `unit` | `%` / `""` | Suffix after the number. |
| `decimals` | `0` | Decimal places in the readout. |
| `label` | — | Caption under the number. Also used as the accessible name. |
| `color` | — | Shorthand for `--cj-value`. |
| `interactive` | — | Makes it draggable and keyboard-operable. |
| `step` | `1` | Increment for dragging and arrow keys. |
| `disabled` | — | Dims it and ignores input. |
| `animate-in` | — | Grow from empty on first paint. |
| `needle` | — | A pointer that swings to the value, taking the short way round a closed dial. `needle="hand"` swaps the rim marker for a centre-mounted hand. |
| `labels` | — | Upright captions spaced round the arc: `"N,E,S,W"`. Every fourth reads heavier. |
| `label-radius` | `29.5` | How far out the captions sit, in the 0–100 viewBox. |
| `value-2` | — | A second value, drawn as a second pointer alongside the first. |
| `rotating` | — | The card turns under a fixed index, the way a heading indicator works. |
| `range` | — | Two handles with a band between them: `range="20 70"`. Reads back as `{low, high}`. |
| `endless` | — | No ends: dragging reports movement, so the value keeps counting past `max` while the ring wraps. |
| `pulse` | `60` | A ring that swells and fades at this many beats per minute. |
| `inset` | `low` | Where `slot="inset"` content sits: `low` under the number, `fill` up the middle. |
| `ballistics` | — | Meter ballistics: `"attack release"` in seconds, one number for both. |
| `peak-hold` | `1.2` | Seconds to hold the highest reading before it falls. Draws a marker in `--cj-peak`. |
| `peak-fall` | — | How fast the held peak decays, in value units per second. |
| `liquid` | — | Fills the dial with fluid whose surface sits at the value, with drifting waves. Good for tanks, fuel, reagents. |
| `gradient` | — | A colour ramp that follows the arc: `"#22c55e,#f59e0b,#ef4444"`. Colour maps to the scale, so the value reveals part of the ramp rather than compressing all of it. |
| `zones` | — | Coloured bands on the track, in value units: `"0-60:#22c55e, 60-85:#f59e0b, 85-100:#ef4444"`. |
| `segments` | — | Consecutive stacked slices in place of the value ring: `"42:#3b82f6, 23:#8b5cf6"`. |
| `ticks` | — | Number of graduations around the arc. |
| `tick-major` | — | Every Nth tick is drawn longer and heavier. |

Properties `value`, `min`, `max`, `step`, `interactive` and the read-only `ratio` mirror the attributes.

## Styling

Everything is a CSS custom property, so you theme it from the outside — no options object:

```css
cj-knob {
  --cj-size: 180px;
  --cj-thickness: 10;      /* unitless, in a 0-100 viewBox */
  --cj-value: #019ae6;
  --cj-track: #d9dce1;
  --cj-benchmark: #94cefe;
  --cj-text: #14161a;
  --cj-muted: #6b7280;
  --cj-num-size: 2rem;     /* defaults to 20% of --cj-size, floored at 13px */
  --cj-label-size: .8rem;  /* defaults to 8.2% of --cj-size, floored at 9px  */
  --cj-needle: #e0433f;     /* the pointer */
  --cj-mark: #6b7280;       /* bearing captions */
  --cj-mark-major: #14161a; /* every fourth caption */
  --cj-mark-size: 7px;      /* in the 0-100 viewBox, so it scales */
  --cj-needle-2: #2f7ae5;   /* the second pointer */
  --cj-liquid: #35a7ff;     /* the fluid, and --cj-liquid-back behind it */
  --cj-duration: 600ms;
  --cj-easing: cubic-bezier(.22,.61,.36,1);
}
```

Type scales with the knob but never drops below a legible floor, so a 56px knob is still readable.

### How the middle is laid out

The number is the anchor. It sits on the ring's centre point and nothing is allowed to push it sideways — the unit is positioned out of flow, so `78%`, `36.6°C` and `18°` all put their digits in exactly the same place and a row of knobs lines up. When a `label` is present the number lifts by a quarter of its own height so the lower half of the dial belongs to the text; without a label it stays dead centre.

Light and dark palettes are built in via `prefers-color-scheme`; anything you set from the outside wins. Internals are also reachable through `::part(track)`, `::part(value)`, `::part(benchmark)`, `::part(readout)` and `::part(label)`.

Put anything you like in the middle with the `icon` slot:

```html
<cj-knob value="68" readout="none">
  <img slot="icon" src="sun.svg" alt="">
</cj-knob>
```

## Events

Interactive knobs fire `cj-input` continuously and `cj-change` when the interaction settles. Both carry `detail.value` and bubble.

```js
knob.addEventListener('cj-change', (e) => console.log(e.detail.value));
```

## Accessibility

- `role="meter"`, or `role="slider"` when `interactive`.
- `aria-valuenow` / `aria-valuemin` / `aria-valuemax` / `aria-valuetext` stay in sync, and `label` becomes the accessible name.
- Arrow keys step by `step`, PageUp/PageDown by ten steps, Home/End jump to the bounds.
- Animation is dropped under `prefers-reduced-motion: reduce`.
- Geometry and ARIA are written synchronously on connect, so assistive tech and server-side snapshots never see an empty element.

### Ballistics and peak hold

A meter needle does not track its input. It snaps up and sags back, because the mass
behind it can be flicked upward far faster than gravity and damping return it. That
asymmetry is what makes a needle readable on music, and it is what `ballistics` gives
you — two time constants, one for rising and one for falling.

```html
<cj-knob sweep="100" needle="hand" readout="none"
         ballistics=".02 .5" peak-hold="1"
         ticks="10" tick-major="5" zones="80-100:#fee2e2"></cj-knob>
```

`peak-hold` adds a marker parked at the highest reading, held for that many seconds
and then decaying at `peak-fall` units per second. Read the current pair from script
with `.shown` (what the dial is drawing) and `.peak`; `.value` stays the number you
set, untouched.

The element runs a frame loop only while something is still moving, and lets go of it
once the needle has settled and the peak has caught up.

### Putting something inside the face

A dial answers *how much*. A trace beside it answers *and how has it been going*.
Putting the second inside the first is one glance instead of two, so `<cj-knob>`
has a slot for it:

```html
<cj-knob value="72" min="40" max="180" readout="value" unit="bpm" label="heart" pulse="72">
  <cj-trace slot="inset" beat="72" readout="none" pen="none"
            style="--cj-height:40px"></cj-trace>
</cj-knob>

<cj-knob value="62" readout="none" inset="fill" ticks="24" tick-major="6">
  <cj-level slot="inset" value="62" liquid bulb style="--cjl-height:96px"></cj-level>
</cj-knob>
```

The knob lays the slotted element out and nothing more — it stays an ordinary
element you style and script directly, the same bargain `<cj-rings>` makes. What
it solves is the arithmetic: the room inside a ring is a circle, so a box low on
the face is much narrower than one across the middle, and the defaults are the
deepest and widest box whose corners all still fall inside the track. With
`inset="low"` the number and its label lift out of the way, and the chart does
not lift with them — or the two would never come apart. Content taller than the
region is clipped rather than allowed to hang out through the ring, so set the
child's own height (`--cj-height`, `--cjl-height`) to about a fifth of the dial.

`pulse="72"` breathes a ring at 72 beats a minute. It carries no number — it is
there so the rhythm is legible from across the room, where the digits are not.
Under `prefers-reduced-motion` it parks as a still ring rather than vanishing.

### Range and endless

Two ways of taking input that a single value cannot express.

```html
<cj-knob range="18 26" min="10" max="32" step=".5" interactive></cj-knob>
<cj-knob endless value="0" readout="value" interactive></cj-knob>
```

A **range** draws a band between two handles instead of a fill from the start of
the arc. Drag either handle; they may meet but never cross, and a drag keeps the
handle it grabbed even when the pointer passes the other one. Arrow keys move the
high handle, shift+arrows the low one. `cj-input` and `cj-change` carry
`{low, high}` instead of `{value}`. Read and write it from script as `.range`,
which takes `[20, 70]` or `{low: 20, high: 70}`.

An **endless** knob has no ends. It reports how far your hand moved rather than
where it points, so the value runs past `max` and below `min` while the ring
wraps round to show the part-turn — a volume knob, a jog wheel, a camera dial.
The running total is kept unrounded and only the committed value is snapped to
`step`; rounding the total itself would let each small movement round up, and a
slow half-turn would arrive as two thirds of one.

## `<cj-rings>`

Concentric knobs without the arithmetic. It lays out; it does not draw — the children
stay ordinary knobs, so ticks, gradients, needles and zones all still work on them and
script still sets their values directly.

```html
<script type="module" src="cj-knob/src/cj-rings.js"></script>

<cj-rings style="--cjs-size:160px">
  <cj-knob readout="none" max="12" value="3"  color="#e8b64c"></cj-knob>
  <cj-knob readout="none" max="60" value="42" color="#64b5f6"></cj-knob>
  <cj-knob readout="none" max="60" value="17" color="#ef6c6c"></cj-knob>
  <div slot="center">03:42:17</div>
</cj-rings>
```

| Attribute | Default | Description |
|---|---|---|
| `thickness` | `0.043` | Ring weight as a fraction of the box, so every ring gets the same pixel stroke. |
| `gap` | `0.065` | Space between rings, also a fraction of the box. |

Size comes from `--cjs-size`; the middle takes anything you put in `slot="center"`.
A ring the box has no room left for is dropped rather than drawn inside out, and the
layout redoes itself on resize, so one stack of markup works at any size.

Nesting rings by hand means choosing a `--cj-size` and a `--cj-thickness` per ring so
the gaps and the weights come out even — which is easy to get subtly wrong. The world
clock and the reactor core in the lab were both hand-tuned that way; converting them
produced almost exactly the same radii, but with stroke weights that are actually
equal, which they had not been.

## `<cj-trace>`

```html
<script type="module" src="./src/cj-trace.js"></script>

<cj-trace beat="72" label="heart" grid></cj-trace>
<cj-trace shape="ring" beat="66"></cj-trace>
```

Every other element here answers *what is the value now*. A trace answers *what
has it been doing*, which is the one question a dial cannot. Same data, a few
hundred samples deep instead of one.

`shape="line"` writes across a strip the way a bedside monitor does; the pen
travels, pushing a small erase gap ahead of it, and what it has not reached yet
is last time round, still faded. `shape="ring"` wraps the same samples round a
circle and deflects them outward from a baseline, leaving the middle clear for
the readout. The buffer, the pen and the sweep are identical — only the two lines
that turn an index into a point differ.

`beat="72"` drives it with a built-in ECG so a demo needs no script at all. For
your own data, `push(v)` one sample at a time:

```js
const trace = document.querySelector('cj-trace');
setInterval(() => trace.push(load()), 25);
```

Samples are written by elapsed time, not per frame, so a slow frame writes more
of them rather than slowing the heart down. Under `prefers-reduced-motion` the
window is filled once and left there: a parked heartbeat would be a flat line,
which reads as the worst possible thing.

| Attribute | Default | What it does |
| --- | --- | --- |
| `shape` | `line` | `line` for a strip, `ring` to wrap it round a circle. |
| `mode` | `sweep` | `sweep` travels a pen over the old trace; `scroll` slides the window so the newest sample is always at the end. |
| `samples` | `240` | How many samples the window holds. |
| `points` | — | A written-out waveform: `"12,40,38,90"`. No pen, nothing faded. |
| `beat` | — | Beats per minute of a built-in ECG. Omit to feed it yourself. |
| `rate` | `125` | Samples per second while self-driving — the paper speed. |
| `min` / `max` | `0` / `100` | The vertical scale. |
| `grid` | — | Graph paper behind the trace, ruled square or polar to match the shape. |
| `pen` | — | `pen="none"` hides the writing head. |
| `readout-at` | `top left` | Which corner the readout sits in: `"bottom right"` and the other three. A resting trace sits low, so the bottom corner is the one place it must not go by default. |
| `sweep` / `start` / `amplitude` | `360` / `-90` / `.18` | Ring shape only: the arc it covers and how far it deflects. |
| `readout` | auto | The rate when `beat` is set, else the last sample. `none` to hide. |
| `unit` / `decimals` / `label` / `color` | — | As on `<cj-knob>`. |

Properties: `.push(v)`, `.clear()`, `.last`, `.samples`, `.min`, `.max`, `.beat`.

Tokens: `--cj-trace`, `--cj-trace-stale`, `--cj-stale-opacity`, `--cj-pen`, `--cj-grid`,
`--cj-grid-step`, `--cj-face`, `--cj-width`, `--cj-height`, `--cj-size`.

## `<cj-heat>`

```html
<script type="module" src="./src/cj-heat.js"></script>

<cj-heat values="7,6,6,5,8,11,14,17,20,22,24,25,24,22,19,16,14,12,10,9,8,7"
         label="a day" unit="°C" interactive></cj-heat>
<cj-heat rows="7" label="a week"></cj-heat>
```

A knob shows one value on a ring. This shows a hundred of them on the same ring,
by colour instead of by length — twenty-four hours round a clock face, a year of
rainfall, a week of load. Not where the needle is, but the shape of everything it
has done.

`rows` splits the list into concentric rings, oldest outermost, which turns the
same data into a polar calendar: seven rows of twenty-four and the daily rhythm
is there at a glance, weekends two cooler rings. Rows are squeezed to fit between
the rim and a reserved middle, and narrowed so they cannot overlap into wedges.

Without `min`/`max` the colour scale spans the data's own extremes, so a heat
ring is readable before anyone has worked out its scale. The cells are geometry
and are cached: assigning new `values` recolours them rather than rebuilding
them, which matters when there are three hundred.

| Attribute | Default | What it does |
| --- | --- | --- |
| `values` | — | The list: `"4,6,9,14,19"`. Also `.values = [...]` from script. |
| `shape` | `cells` | `cells` for blocks of colour, `bars` for towers standing off a baseline. |
| `scale` | 5-stop blue→red | Colour stops the values are mapped across. |
| `min` / `max` | the data | The colour domain. Omit to fit the data. |
| `rows` | `1` | Split the list across this many concentric rings. |
| `sweep` / `start` | `360` / `-90` | The arc the cells cover. |
| `interactive` | — | Hovering lifts a cell out of the ring and reads it in the middle. |
| `readout` | auto | The hovered cell, or the ring's average. `none` to hide. |
| `unit` / `decimals` / `label` | — | As on `<cj-knob>`. |

`shape="bars"` draws each value as a tower instead of a block, which is what
turns a year into something you can read like a skyline:

```html
<cj-heat shape="bars" label="2025" unit="mm" interactive></cj-heat>
```

```js
document.querySelector('cj-heat').values = rainfallByDay;   // 365 numbers
```

Length carries the value and colour carries it again, which is why bars default
to a calmer scale than cells do: a five-stop rainbow across three hundred towers
says the same thing twice and reads as noise. That default ramp moves through hue
rather than lightness, so neither end disappears into a dark page or a light one.
A value of zero still gets a stub, so a quiet day reads as a quiet day and not as
a hole in the ring, and the whole angular slot is hoverable — nobody can be asked
to hit a one-pixel line.

Properties: `.values`, `.rows`, `.hot`. Event: `cj-hover` with
`{index, value}` — `index` is `-1` when the pointer leaves the cells.

Tokens: `--cj-size`, `--cj-thickness`, `--cj-gap`, `--cj-empty`.

## `<cj-level>`

The straight tube a ring cannot give you: a tank, a cylinder, a thermometer. Same
liquid engine as `<cj-knob liquid>`, in the container the quantity actually lives in,
with a scale you read off the side.

```html
<script type="module" src="cj-knob/src/cj-level.js"></script>

<cj-level value="62" unit="L" label="fryer oil" liquid ticks="10" tick-major="5"></cj-level>
<cj-level value="36.6" min="34" max="42" decimals="1" unit="°C" bulb liquid></cj-level>
```

| Attribute | Default | Description |
|---|---|---|
| `value` / `min` / `max` | `0` / `100` | The column and its scale. |
| `liquid` | — | A wavy drifting surface instead of a flat bar. |
| `bulb` | — | Adds a reservoir at the foot, drawn as one outline with the column — a thermometer. |
| `ticks` / `tick-major` | — | Graduations down the side, every Nth one labelled in value units. |
| `zones` | — | Bands painted *over* the column, so a low-level warning tints the fluid sitting in it. |
| `readout` | `value` | `value`, `percent` or `none`. |
| `unit` / `decimals` / `label` | — | As on `<cj-knob>`. |
| `color` | — | Shorthand for `--cjl-fill`. |

Height comes from `--cjl-height` and the width follows. Theme with `--cjl-fill`,
`--cjl-fill-back`, `--cjl-tube`, `--cjl-wall` and `--cjl-tick`.

## `<cj-radar>`

A knob describes one value on a rim; a radar describes many contacts across a whole
field. Different geometry and a different API, so it is a sibling element rather than
a mode — import it only if you want it.

```html
<script type="module" src="cj-knob/src/cj-radar.js"></script>

<cj-radar period="4" rings="4" spokes="8" labels="N,E,S,W"
          blips="35:0.62, 118:0.34, 214:0.78"></cj-radar>
```

| Attribute | Default | Description |
|---|---|---|
| `rings` | `4` | Concentric range rings. |
| `spokes` | `8` | Bearing spokes. `0` for none. |
| `period` | — | Seconds per sweep revolution. Omit or `0` for a static scope. |
| `labels` | — | Bearing captions, spaced evenly from north. |
| `blips` | — | Contacts as `bearing:range` pairs, range 0 at the centre to 1 at the rim. |
| `interactive` | — | Clicking the scope adds a contact where you clicked. |

Tune the sweep with `--cjr-tail` (how far the luminous trail reaches behind the leading
line) and `--cjr-fade` (how long a contact stays lit after a pass).

Contacts are also a property, so they do not have to go through an attribute:

```js
radar.blips = [{ bearing: 45, range: 0.6 }];
radar.addBlip({ bearing: 190, range: 0.3 });
radar.scatter(6);
radar.clearBlips();

// the sweep lights each contact as it crosses it
radar.addEventListener("cj-detect", (e) => console.log(e.detail.bearing));
```

Theme it with `--cjr-field`, `--cjr-grid`, `--cjr-beam`, `--cjr-blip`, `--cjr-mark`
and `--cjr-size`. With no `period` the beam is not drawn at all and the contacts
carry their own contrast.

The sweep winds up when it starts and coasts to a halt when it stops, rather than
switching on and off — `period = 0` decelerates and fades instead of vanishing.

**If the sweep is not turning at all, check your system motion setting.** Under
`prefers-reduced-motion: reduce` the beam parks instead of rotating — it stays
visible, it just holds still. On Windows that is Settings → Accessibility → Visual
effects → Animation effects; on macOS, System Settings → Accessibility → Display →
Reduce motion.

## `<cj-horizon>`

The artificial horizon an aircraft shows you: sky over ground, tipping with bank and
sliding with pitch, read against a fixed aircraft symbol. Two angles across a whole
face rather than one number on a rim, so it is a third element rather than a knob mode.

```html
<script type="module" src="cj-knob/src/cj-horizon.js"></script>

<cj-horizon pitch="8" roll="-20"></cj-horizon>
```

| Attribute | Default | Description |
|---|---|---|
| `pitch` | `0` | Nose-up in degrees. Positive slides the horizon down the face. |
| `roll` | `0` | Right bank in degrees. Positive lifts the horizon's right-hand end — the ground rises to your right, as it does out of the window. |
| `ladder-step` | `10` | Degrees between pitch-ladder rungs. |
| `ladder-max` | `30` | Highest rung drawn, either side of the horizon. |

`pitch` and `roll` are also properties, and `.attitude` returns the state in words
(`"climbing, left bank"`) — which is what the element puts in its own `aria-label`.
Theme it with `--cjh-sky`, `--cjh-ground`, `--cjh-craft`, `--cjh-index` and `--cjh-size`.

## The instrument lab

`lab/` is 30 full-screen dashboards. Every dial on every one of them is the same `<cj-knob>` —
the only thing that changes is the CSS custom properties and the numbers fed in.

Open `lab/` and switch panels from the header. Each page also stands alone at `lab/aviation.html`
and so on. All data is simulated.

| | |
|---|---|
| **Vehicles** | Aviation · Submarine · Spacecraft · Mobile Suit · Race |
| **Worlds** | Steampunk · Futuristic · Xenology · Reactor · Campaign |
| **Systems** | Server · Jobs · Micro |
| **Human** | Body · Emotion · Life OS · Charm |
| **Money** | Enterprise · Personal · Salary · Markets |
| **Work** | Kitchen |
| **World** | Countries · Population · Resources · Food · Faiths · Singapore · Malaysia · World Clock |

Six of them are hand-written top to bottom (aviation, submarine, steampunk, futuristic,
worldclock, micro) to show the element dropped into completely bespoke markup. The rest are
built from [`lab/panel.js`](lab/panel.js) + [`lab/panel.css`](lab/panel.css), a ~150-line
declarative wrapper, so each panel is just a theme and a `tick()`:

```js
buildPanel({
  title: 'host cj-prod-01 — simulation',
  status: [{ id: 'load', label: 'load', value: '—' }],
  rows: [{ size: 'lg', items: [
    { id: 'cpu', cap: 'CPU', min: 0, max: 100, sweep: 270, readout: 'value',
      ticks: 10, tickMajor: 5, label: '%', zones: '88-100:#ff4d5e' },
  ]}],
  tick(t, set) { set('cpu', 46 + wave(t, 23, 22)); },
});
```

Things worth stealing from the lab: the sonar sweep (a short arc + one CSS rotation), the
concentric clock (three knobs on one grid cell), the neon glow (`::part(value)` +
`drop-shadow`), and the engine bells (a generated row rather than nine copies of the markup).

## Demo & tests

The demo lives at the repository root so that `./src/cj-knob.js` never points outside the document root. **Serve from the repo root** (any static server works: `npm run dev`, `php -S localhost:8000`, `python -m http.server`) and open `/`. Serving from a subfolder, or opening the file over `file://`, breaks the ES module import.

```sh
npm run dev     # then open http://127.0.0.1:8765/
npm test        # 211 Playwright checks: geometry, needle, radar, horizon, keyboard, a11y
```

## Browser support

Any browser with custom elements and shadow DOM — Chrome/Edge 67+, Firefox 63+,
Safari 12.1+. No polyfills, no transpiler.

The one exception is `<cj-radar>`, whose phosphor tail is a CSS `conic-gradient`
built with `color-mix`, so the sweep needs Chrome/Edge 111+, Firefox 113+ or
Safari 16.2+. The scope, its rings and its blips draw fine below that; only the
fading tail behind the beam does not.

## Migrating from the jQuery plugin (v0.x)

The jQuery plugin is gone. The mapping is direct:

| v0.x option | now |
|---|---|
| `$("#el").cjknob({ cColor: "green" })` | `<cj-knob color="green">` |
| `bgcolor` | `--cj-track` |
| `cBenchmark` / `cBenchmarkD` | `--cj-benchmark` / `benchmark` |
| `width` / `height` | `--cj-size` |
| `mode: 'dknob'` | automatic once `value > max` |
| `mode: 'gauge'` | `sweep="270"` |
| `cjIcon` | `<img slot="icon">` |
| value read from element text | `value` attribute |

## Origins

cj-knob started on 19 June 2013 as a jQuery canvas plugin — the first thing I ever put on GitHub. Version 1.0 is a full rewrite as a standards-based custom element, but it is still the same knob.

## License

MIT
