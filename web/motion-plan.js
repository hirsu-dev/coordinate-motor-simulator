const finite = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
export function validateConfig(input) {
  const c = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, Number(v)]),
  );
  if (
    !finite(c.azMin, -720, 720) ||
    !finite(c.azMax, -720, 720) ||
    c.azMin >= c.azMax ||
    !finite(c.altMin, -10, 90) ||
    !finite(c.altMax, -10, 90) ||
    c.altMin >= c.altMax ||
    !finite(c.azRate, 1, 90) ||
    !finite(c.altRate, 1, 90)
  )
    throw Error(
      "Check continuous azimuth limits, altitude limits and rates (1–90°/s).",
    );
  return c;
}
export const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * t * (10 + t * (-15 + t * 6));
};
export function intersectsBox(a, b, z) {
  let lo = 0,
    hi = 1;
  for (const [key, min, max] of [
    ["az", z.azMin, z.azMax],
    ["alt", z.altMin, z.altMax],
  ]) {
    const delta = b[key] - a[key];
    if (Math.abs(delta) < 1e-12) {
      if (a[key] < min || a[key] > max) return false;
      continue;
    }
    const t1 = (min - a[key]) / delta,
      t2 = (max - a[key]) / delta;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
    if (lo > hi) return false;
  }
  return lo <= hi;
}
function checkPoint(p, c) {
  return finite(p.az, c.azMin, c.azMax) && finite(p.alt, c.altMin, c.altMax);
}
export function buildMotion(from, direction, config, zones = []) {
  const c = validateConfig(config);
  if (!checkPoint(from, c))
    throw Error("The starting position is outside the configured limits.");
  if (!finite(direction.az, 0, 360) || !finite(direction.alt, -90, 90))
    throw Error("Enter a target azimuth of 0–360° and altitude of −90–90°.");
  for (const z of zones) {
    if (
      ![z.azMin, z.azMax, z.altMin, z.altMax].every(Number.isFinite) ||
      z.azMin > z.azMax ||
      z.altMin > z.altMax
    )
      throw Error("Check the exclusion-zone bounds.");
  }
  const candidates = [];
  for (let turns = -3; turns <= 3; turns++) {
    const to = { az: direction.az + 360 * turns, alt: direction.alt };
    if (!checkPoint(to, c)) continue;
    for (const [strategy, points] of [
      ["Simultaneous", [from, to]],
      ["Elevation first", [from, { az: from.az, alt: to.alt }, to]],
      ["Azimuth first", [from, { az: to.az, alt: from.alt }, to]],
    ]) {
      const segments = [];
      let duration = 0,
        blocked = null;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        // Quintic profile's maximum derivative is 1.875. Scale duration so
        // configured rates bound the peak speed, not only the average speed.
        const seconds =
          1.875 *
          Math.max(
            Math.abs(b.az - a.az) / c.azRate,
            Math.abs(b.alt - a.alt) / c.altRate,
          );
        for (const z of zones)
          if (intersectsBox(a, b, z)) blocked = z.name || "Exclusion zone";
        segments.push({
          from: { ...a },
          to: { ...b },
          start: duration,
          duration: seconds,
        });
        duration += seconds;
      }
      candidates.push({ strategy, to, segments, duration, blocked });
    }
  }
  const valid = candidates
    .filter((p) => !p.blocked)
    .sort(
      (a, b) =>
        a.duration - b.duration ||
        Math.abs(a.to.az - from.az) - Math.abs(b.to.az - from.az),
    );
  return {
    from: { ...from },
    direction: { ...direction },
    config: c,
    zones,
    selected: valid[0] || null,
    candidates,
    reason: valid.length
      ? "Fastest valid candidate under the configured axis limits and exclusion boxes."
      : candidates.length
        ? "Every candidate intersects a configured exclusion zone."
        : "No equivalent target position fits the axis limits.",
  };
}
export function sampleMotion(plan, seconds) {
  if (!plan.segments.length) return { ...plan.to };
  for (const s of plan.segments) {
    if (seconds <= s.start + s.duration) {
      const t = s.duration ? smooth((seconds - s.start) / s.duration) : 1;
      return {
        az: s.from.az + (s.to.az - s.from.az) * t,
        alt: s.from.alt + (s.to.alt - s.from.alt) * t,
      };
    }
  }
  return { ...plan.to };
}
export function skyToHorizontal(ra, dec, latitude, longitude, date) {
  if (
    !finite(ra, 0, 23.999999) ||
    !finite(dec, -90, 90) ||
    !finite(latitude, -90, 90) ||
    !finite(longitude, -180, 180)
  )
    throw Error("Check RA, declination, latitude and longitude.");
  const when = new Date(date);
  if (
    !Number.isFinite(+when) ||
    when.getUTCFullYear() < 2020 ||
    when.getUTCFullYear() > 2050
  )
    throw Error("Use a UTC date between 2020 and 2050.");
  const rad = (n) => (n * Math.PI) / 180,
    deg = (n) => (n * 180) / Math.PI,
    d = +when / 86400000 + 2440587.5 - 2451545,
    t = d / 36525;
  const gmst =
    (67310.548 +
      (3155760000 + 8640184.812866) * t +
      0.093104 * t * t -
      6.2e-6 * t * t * t) /
    240;
  const h = rad(gmst + longitude - ra * 15),
    lat = rad(latitude),
    decl = rad(dec);
  return {
    alt: deg(
      Math.asin(
        Math.max(
          -1,
          Math.min(
            1,
            Math.sin(lat) * Math.sin(decl) +
              Math.cos(lat) * Math.cos(decl) * Math.cos(h),
          ),
        ),
      ),
    ),
    az:
      (deg(
        Math.atan2(
          -Math.cos(decl) * Math.sin(h),
          Math.sin(decl) * Math.cos(lat) -
            Math.cos(decl) * Math.sin(lat) * Math.cos(h),
        ),
      ) +
        360) %
      360,
  };
}
