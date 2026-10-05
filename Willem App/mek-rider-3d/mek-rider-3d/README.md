# Mek-Rider 3D

Interactive 3D animation of the MEK-Rider MRTF01, built with [three.js](https://threejs.org) and [Vite](https://vitejs.dev).

The app has two views:

- **Product**: a rotating Mek-Rider with forks that extend from 1,198 to 1,998 mm in 4 s, carrying 0, 1 or 2 pallets.
- **Crossdock**: a standard EPT (2 trips) and the Mek-Rider (1 trip) moving two pallets side by side, with live counters for trips, time and distance.

Dimensions and speeds come from the MRTF01 technical description and dimension drawing (MRTF01-000-00).

## Getting started

Requires Node.js 18 or newer.

```bash
npm install
npm run dev        # dev server with hot reload, opens in the browser
```

## Building

```bash
npm run build          # dist/ with separate files, for your own web server
npm run build:single   # dist/index.html as ONE self-contained file
npm run preview        # serve the build locally to check it
```

Use `build:single` when you want to publish the page as a Claude artifact again, attach it to an email or put it on a USB stick: everything (three.js included) is inlined into one HTML file. Only the Oswald web font is loaded from Google Fonts, with Arial as fallback.

## Project structure

```
mek-rider-3d/
├── index.html                 Page markup: header, canvas, HUD panels, buttons
├── package.json               Scripts and dependencies (three 0.128, Vite)
├── vite.config.js             Normal build and single-file build
└── src/
    ├── main.js                Entry point: renderer, view switching, resize, render loop, recording mode
    ├── styles.css             MEK house style (navy #0e2038, red #d6483d), HUD, recording mode
    ├── config/
    │   └── dimensions.js      All MRTF01 dimensions, speeds and timings in one place
    ├── three/
    │   └── helpers.js         Shared materials and small builders (box, wheel, text textures)
    ├── models/
    │   ├── truck.js           Truck assembly: body + forks, setExt() / setLift()
    │   ├── mekRider.js        Mek-Rider body after the dimension drawing
    │   ├── standardEpt.js     Generic EPT used for the comparison
    │   ├── driver.js          Stylised operator
    │   └── pallet.js          Euro pallet with boxes and stretch wrap
    ├── scenes/
    │   ├── productScene.js    Product view: lights, floor, ruler, controls and buttons
    │   └── crossdockScene.js  Crossdock hall, both lanes, HUD and result panel
    ├── sim/
    │   ├── layout.js          Positions in the hall (lanes, pick-up, spots A and B, walls)
    │   ├── plan.js            Step-by-step script per truck (drive, extend, lift, pick, drop)
    │   └── lane.js            Executes a script: acceleration, lane changes, timers
    └── ui/
        └── dom.js             DOM helpers, big video captions, number formatting
```

## Common changes

| What you want | Where |
| --- | --- |
| Change colours of the Mek-Rider | `src/three/helpers.js` (`M.navy`, `M.red`) and `src/models/mekRider.js` |
| Adjust the body shape | `src/models/mekRider.js`, coordinates in metres, fork face at x = 0, rear at x = 0.83 |
| Different fork length, speed or extend time | `src/config/dimensions.js` |
| Move docks or loading spots | `src/sim/layout.js` |
| Change the order of actions or the captions | `src/sim/plan.js` |
| Change texts, buttons or panels | `index.html` and `src/styles.css` |

Coordinate system: metres, y is up. Each truck's origin is the fork face; the forks point towards -x and the body towards +x.

## Notes

- three.js is pinned to 0.128.0, the version the original page was built with. Newer versions work too, but check the colour management (`outputColorSpace`) because colours will look lighter.
- The model is schematic. Shape and proportions follow the dimension drawing; colours, the steering head and the operator are an interpretation.
- The result in the crossdock view (58% fewer metres, 46% faster) applies to this layout with about 20 m between the docks. The larger the distance, the larger the difference.
