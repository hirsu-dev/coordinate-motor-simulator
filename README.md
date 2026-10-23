# Pointing Lab: Coordinate-to-Motor Simulator

Try telescope mount movements before you connect a motor. [Open the browser app](https://hrushikbarani-hub.github.io/coordinate-motor-simulator/).

This is a simulation inspired by my Robo Telescope, which is currently under repair. It uses an illustrative 3D mount, continuous azimuth angles, user-defined axis limits and an exclusion box. It never sends hardware commands.

## What you can do

- Convert approximate RA/declination and an observer location/time into a horizontal direction.
- Compare direct, elevation-first and azimuth-first routes across equivalent azimuth turns.
- Reject routes that cross configured angle-space exclusion boxes.
- Preview or manually scrub a smooth route. Drag or use arrow keys to orbit the 3D view.
- Inspect candidate durations and export a JSON mission with sampled positions.

## Run and check

This is static HTML, CSS and JavaScript. You need Node.js 22+ only for development checks.

```powershell
npm ci
npm run check
python -m http.server 8142 --bind 127.0.0.1 --directory web
```

Open `http://127.0.0.1:8142`. The app has no runtime dependency, account, API key, telemetry or network checker. Its GitHub Actions workflow checks the source and publishes `web` to free GitHub Pages.

## Conventions and limits

Azimuth is clockwise from north toward east. Continuous motor azimuth can go negative or exceed 360 degrees if your configured bounds allow it. Equivalent sky directions do not imply the same cable position. Elevation is degrees above the horizon.

The planner evaluates direct and two axis-order strategies; it is not an exhaustive obstacle-avoidance solver. Exclusion boxes live in angle space and do not model real physical collision geometry. Edges count as blocked. All segments must remain inside axis limits. A quintic smooth-step profile has maximum derivative 1.875, so each segment's duration is scaled to respect the configured peak angular rates. Motor torque, acceleration limits, backlash, cable geometry and real clearance are unverified.

Sky conversion uses the mean sidereal-time polynomial in [JPL's Horizons documentation](https://ssd.jpl.nasa.gov/horizons/manual.html#greenwich-mean-sidereal-time) and spherical rotation. RA is decimal hours, declination is degrees, longitude is east-positive and time is UTC. Dates are limited to 2020–2050. Coordinates are treated as mean coordinates of date; there is no catalog-epoch conversion, refraction, precession or moving-body model. Azimuth near zenith is ill-conditioned. Do not use this for solar pointing or real hardware control.

Six checks cover cable wrapping, exact box intersections, unreachable paths, peak speeds, polar coordinate conversion and the real form/scrubber events. Visual browser QA was unavailable for this release. The canvas model is supplemental; numerical readouts, candidate tables and manual scrub controls work without canvas. Animation stops when the page hides; reduced motion defaults to manual preview.

## Files

`web/motion-plan.js` contains pure planning and coordinate functions. `web/app.js` owns the controls, on-demand 3D canvas and preview lifecycle. Tests are in `tests`.

Next useful work: measured mount constraints, independent astronomy reference comparisons, multiple editable exclusion zones and a proper geometric collision model. Hardware drivers should be designed and validated separately.
