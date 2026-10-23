import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { readFile } from "node:fs/promises";
test("the real mission form plans, scrubs and invalidates an edited route", async () => {
  const window = new Window({ url: "https://example.test" });
  window.document.write(
    await readFile(new URL("../web/index.html", import.meta.url), "utf8"),
  );
  window.HTMLCanvasElement.prototype.getContext = () => null;
  const globals = {
    window,
    document: window.document,
    FormData: window.FormData,
    Event: window.Event,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  };
  const old = new Map(
    Object.keys(globals).map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  for (const [k, v] of Object.entries(globals))
    Object.defineProperty(globalThis, k, {
      value: v,
      writable: true,
      configurable: true,
    });
  try {
    await import("../web/app.js");
    const form = window.document.querySelector("form");
    form.dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
    assert.match(
      window.document.querySelector("#result").textContent,
      /Candidate plans/,
    );
    assert.equal(window.document.querySelector("#play").disabled, false);
    const scrub = window.document.querySelector("#scrub");
    scrub.value = "1000";
    scrub.dispatchEvent(new window.Event("input"));
    assert.match(
      window.document.querySelector("#readout").textContent,
      /45.0°/,
    );
    form.elements.toAlt.value = "-20";
    form.dispatchEvent(new window.Event("input"));
    assert.equal(window.document.querySelector("#play").disabled, true);
    form.dispatchEvent(new window.Event("submit", { cancelable: true }));
    assert.match(
      window.document.querySelector("#status").textContent,
      /No equivalent/,
    );
  } finally {
    for (const [k, d] of old) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
    await window.happyDOM.abort();
  }
});
