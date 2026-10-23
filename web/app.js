import { buildMotion, sampleMotion, skyToHorizontal } from "./motion-plan.js";
const $ = (s) => document.querySelector(s),
  form = $("#controls");
let mission = null,
  selected = null,
  pose = { az: 0, alt: 25 },
  seconds = 0,
  raf = 0,
  last = 0,
  yaw = 0.7,
  drag = null;
const canvas = $("#mount"),
  ctx = canvas.getContext("2d");
const rad = (n) => (n * Math.PI) / 180;
const unit = (a) => {
  const n = Math.hypot(...a) || 1;
  return a.map((v) => v / n);
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const add = (a, b) => a.map((v, i) => v + b[i]);
function project([x, y, z]) {
  const xx = x * Math.cos(yaw) + z * Math.sin(yaw),
    zz = z * Math.cos(yaw) - x * Math.sin(yaw),
    yy = y * 0.94 - zz * 0.34,
    zr = y * 0.34 + zz * 0.94,
    scale = 400 / (5 - zr);
  return { x: 450 + xx * scale, y: 305 - yy * scale, z: zr };
}
function draw() {
  $("#readout").textContent =
    `Continuous azimuth ${pose.az.toFixed(1)}° / Elevation ${pose.alt.toFixed(1)}°`;
  if (!ctx) return;
  ctx.clearRect(0, 0, 900, 550);
  ctx.lineWidth = 1;
  function line(a, b, color = "#405e57") {
    const p = project(a),
      q = project(b);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  for (let n = -2; n <= 2; n += 0.5) {
    line([n, -1.1, -2], [n, -1.1, 2]);
    line([-2, -1.1, n], [2, -1.1, n]);
  }
  for (const [a, label] of [
    [[0, -1.1, 2], "N"],
    [[2, -1.1, 0], "E"],
    [[0, -1.1, -2], "S"],
    [[-2, -1.1, 0], "W"],
  ]) {
    const p = project(a);
    ctx.fillStyle = "#a7bfb0";
    ctx.font = "16px monospace";
    ctx.fillText(label, p.x, p.y);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    line([0, 0, 0], [Math.sin(a) * 0.95, -1.1, Math.cos(a) * 0.95], "#779385");
  }
  line([0, -0.6, 0], [0, 0.45, 0], "#cbd9cc");
  const axis = [
      Math.sin(rad(pose.az)) * Math.cos(rad(pose.alt)),
      Math.sin(rad(pose.alt)),
      Math.cos(rad(pose.az)) * Math.cos(rad(pose.alt)),
    ],
    u = unit(cross(axis, [0, 1, 0.001])),
    v = unit(cross(axis, u));
  const center = [0, 0.55, 0],
    a = add(
      center,
      axis.map((n) => -n * 0.9),
    ),
    b = add(
      center,
      axis.map((n) => n * 0.9),
    );
  const ring = (c) =>
    Array.from({ length: 16 }, (_, i) =>
      add(
        c,
        u.map(
          (n, j) =>
            (n * Math.cos((i * Math.PI) / 8) +
              v[j] * Math.sin((i * Math.PI) / 8)) *
            0.22,
        ),
      ),
    );
  const aa = ring(a),
    bb = ring(b),
    faces = [];
  for (let i = 0; i < 16; i++)
    faces.push({
      points: [aa[i], aa[(i + 1) % 16], bb[(i + 1) % 16], bb[i]].map(project),
      color: `hsl(140 18% ${22 + (i % 5) * 4}%)`,
    });
  faces.push({ points: bb.map(project), color: "#b4e9cf" });
  faces.sort(
    (a, b) =>
      a.points.reduce((n, p) => n + p.z, 0) / a.points.length -
      b.points.reduce((n, p) => n + p.z, 0) / b.points.length,
  );
  for (const face of faces) {
    ctx.fillStyle = face.color;
    ctx.strokeStyle = "#719c8d";
    ctx.beginPath();
    face.points.forEach((p, i) =>
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  line(
    b,
    add(
      b,
      axis.map((n) => n * 1.4),
    ),
    "#bde6b1",
  );
}
function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  last = 0;
  $("#pause").disabled = true;
  $("#play").disabled = !selected || $("#reduced-motion").checked;
}
function display(t) {
  seconds = selected ? Math.max(0, Math.min(selected.duration, t)) : 0;
  pose = selected ? sampleMotion(selected, seconds) : mission?.from || pose;
  const fraction = selected?.duration ? seconds / selected.duration : 0;
  $("#scrub").value = Math.round(fraction * 1000);
  $("#progress-label").textContent =
    `${Math.round(fraction * 100)}% / ${seconds.toFixed(1)} s`;
  draw();
}
function plot() {
  const c = mission.config,
    x = (n) => 40 + ((n - c.azMin) / (c.azMax - c.azMin)) * 510,
    y = (n) => 135 - ((n - c.altMin) / (c.altMax - c.altMin)) * 110;
  return `<svg class="axis-plot" viewBox="0 0 580 160" role="img" aria-label="Route in continuous azimuth and elevation space. Red rectangles are exclusion zones."><line x1="40" y1="135" x2="550" y2="135"/><line x1="40" y1="25" x2="40" y2="135"/>${mission.zones.map((z) => `<rect x="${x(z.azMin)}" y="${y(z.altMax)}" width="${x(z.azMax) - x(z.azMin)}" height="${y(z.altMin) - y(z.altMax)}"/>`).join("")}${selected ? `<polyline points="${[selected.segments[0].from, ...selected.segments.map((s) => s.to)].map((p) => `${x(p.az)},${y(p.alt)}`).join(" ")}"/>` : ""}<text x="40" y="154">${c.azMin}° AZ</text><text x="490" y="154">${c.azMax}° AZ</text><text x="3" y="25">${c.altMax}°</text><text x="3" y="135">${c.altMin}°</text></svg>`;
}
function renderResults() {
  $("#status").textContent = mission.reason;
  $("#result").innerHTML =
    `${selected ? `<p><strong>${selected.strategy}</strong> → ${selected.to.az.toFixed(1)}° continuous azimuth / ${selected.to.alt.toFixed(1)}° elevation<br/>${selected.duration.toFixed(2)} simulated seconds · smooth start and stop</p>` : ""}${plot()}<div class="table-wrap"><table><caption>Candidate plans. Duration respects configured peak angular rates.</caption><thead><tr><th>Strategy</th><th>Target az.</th><th>Seconds</th><th>Check</th></tr></thead><tbody>${mission.candidates.map((p, i) => `<tr><td>${p.strategy}</td><td>${p.to.az.toFixed(1)}°</td><td>${p.duration.toFixed(2)}</td><td>${p.blocked ? "Blocked: " + p.blocked : `<button data-candidate="${i}" ${p === selected ? 'aria-pressed="true"' : 'aria-pressed="false"'}>Preview this path</button>`}</td></tr>`).join("")}</tbody></table></div>${selected ? `<button id="export">Export simulated mission JSON ↓</button>` : ""}<p class="help">The planner checks straight path segments against axis bounds and angle-space boxes. It compares direct, elevation-first and azimuth-first paths across equivalent turns; it is not an exhaustive path finder.</p>`;
  $("#play").disabled = !selected || $("#reduced-motion").checked;
}
form.elements.utc.value = new Date().toISOString().slice(0, 16);
$("#reduced-motion").checked =
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
form.addEventListener("submit", (e) => {
  e.preventDefault();
  stop();
  try {
    const values = Object.fromEntries(new FormData(form)),
      n = (k) => Number(values[k]);
    mission = buildMotion(
      { az: n("fromAz"), alt: n("fromAlt") },
      { az: n("toAz"), alt: n("toAlt") },
      Object.fromEntries(
        ["azMin", "azMax", "altMin", "altMax", "azRate", "altRate"].map((k) => [
          k,
          n(k),
        ]),
      ),
      form.elements.zoneEnabled.checked
        ? [
            {
              name: "Configured box",
              azMin: n("zoneAzMin"),
              azMax: n("zoneAzMax"),
              altMin: n("zoneAltMin"),
              altMax: n("zoneAltMax"),
            },
          ]
        : [],
    );
    selected = mission.selected;
    renderResults();
    display(0);
  } catch (error) {
    mission = null;
    selected = null;
    $("#result").innerHTML = "";
    $("#status").textContent = error.message;
    $("#play").disabled = true;
  }
});
form.addEventListener("input", () => {
  stop();
  mission = null;
  selected = null;
  $("#result").innerHTML = "";
  $("#status").textContent =
    "Settings changed. Plan again to check the new route.";
  $("#play").disabled = true;
});
$("#convert").addEventListener("click", () => {
  try {
    const v = form.elements,
      p = skyToHorizontal(
        Number(v.ra.value),
        Number(v.dec.value),
        Number(v.latitude.value),
        Number(v.longitude.value),
        v.utc.value + "Z",
      );
    v.toAz.value = p.az.toFixed(5);
    v.toAlt.value = p.alt.toFixed(5);
    form.dispatchEvent(new Event("input"));
    $("#status").textContent =
      `Converted approximate sky direction: ${p.az.toFixed(2)}° azimuth / ${p.alt.toFixed(2)}° elevation. Plan to check limits.`;
  } catch (e) {
    $("#status").textContent = e.message;
  }
});
$("#result").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.candidate !== undefined) {
    stop();
    selected = mission.candidates[Number(b.dataset.candidate)];
    if (selected.blocked) {
      selected = null;
      return;
    }
    renderResults();
    display(0);
  } else if (b.id === "export") {
    const blob = new Blob(
        [
          JSON.stringify(
            {
              schema: 1,
              simulation_only: true,
              ...mission,
              selected,
              samples: Array.from({ length: 101 }, (_, i) => ({
                seconds: (i / 100) * selected.duration,
                ...sampleMotion(selected, (i / 100) * selected.duration),
              })),
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "simulated-mission.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
$("#play").addEventListener("click", () => {
  if (!selected || $("#reduced-motion").checked) return;
  if (seconds >= selected.duration) display(0);
  $("#play").disabled = true;
  $("#pause").disabled = false;
  const frame = (now) => {
    if (!last) last = now;
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    display(seconds + delta);
    if (seconds < selected.duration) raf = requestAnimationFrame(frame);
    else stop();
  };
  raf = requestAnimationFrame(frame);
});
$("#pause").addEventListener("click", stop);
$("#reset").addEventListener("click", () => {
  stop();
  display(0);
});
$("#scrub").addEventListener("input", () => {
  stop();
  if (selected) display((Number($("#scrub").value) / 1000) * selected.duration);
});
$("#reduced-motion").addEventListener("change", stop);
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, yaw };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (drag) {
    yaw = drag.yaw + (e.clientX - drag.x) * 0.008;
    draw();
  }
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
  canvas.addEventListener(type, () => (drag = null));
canvas.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) {
    e.preventDefault();
    yaw = e.key === "Home" ? 0.7 : yaw + (e.key === "ArrowLeft" ? -0.15 : 0.15);
    draw();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
});
window.addEventListener("pagehide", stop);
draw();
