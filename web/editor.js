"use strict";
const $ = (id) => document.getElementById(id);
const colors = [
  "background",
  "surface",
  "surfaceAlt",
  "text",
  "muted",
  "border",
  "accent",
  "positive",
  "negative",
  "warning",
];
const labels = {
  background: "Background",
  surface: "Cards",
  surfaceAlt: "Table stripe",
  text: "Primary text",
  muted: "Secondary text",
  border: "Borders",
  accent: "Brand accent",
  positive: "Positive",
  negative: "Negative",
  warning: "Highlights",
  end: "Gradient end",
};
let theme,
  revision = 0,
  csrf = "",
  dirty = false,
  busy = false,
  kind = "rank",
  appliedRevision = -1,
  timer,
  sequence = 0,
  previewUrl,
  controller;
function notice(message, error = false) {
  $("notice").textContent = message;
  $("notice").classList.toggle("error", error);
}
async function api(path, data) {
  const r = await fetch(path, {
    method: data ? "POST" : "GET",
    headers: data
      ? { "Content-Type": "application/json", "X-CSRF-Token": csrf }
      : {},
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (!r.ok) {
    const e = await r.json();
    throw new Error(e.error || "Please try again.");
  }
  return r.json();
}
function colorRow(key, target) {
  const row = document.createElement("div");
  row.className = "color-row";
  const label = document.createElement("label");
  label.htmlFor = "color-" + key;
  label.textContent = labels[key];
  const input = document.createElement("input");
  input.type = "color";
  input.id = "color-" + key;
  const hex = document.createElement("input");
  hex.className = "hex";
  hex.id = "hex-" + key;
  hex.type = "text";
  hex.maxLength = 7;
  hex.pattern = "#[0-9a-fA-F]{6}";
  hex.setAttribute("aria-label", labels[key] + " hex color");
  const update = (value) => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    input.value = value;
    hex.value = value;
    if (key === "end") theme.background.end = value;
    else theme.colors[key] = value;
    changed();
  };
  input.addEventListener("input", () => update(input.value));
  hex.addEventListener("change", () => {
    if (/^#[0-9a-f]{6}$/i.test(hex.value)) update(hex.value);
    else {
      hex.value = input.value;
      notice("Use a color such as #392c36.", true);
    }
  });
  row.append(label, input, hex);
  $(target).append(row);
}
for (const key of ["background", "surface", "surfaceAlt", "end"])
  colorRow(key, "background-colors");
for (const key of ["border", "accent"]) colorRow(key, "detail-colors");
for (const key of ["text", "muted", "positive", "negative", "warning"])
  colorRow(key, "text-colors");
function fill() {
  $("name").value = theme.name;
  $("brand").value = theme.brand;
  $("base").value = theme.base;
  $("radius").value = theme.radius;
  $("design").value = theme.background.style;
  $("angle").value = theme.background.angle;
  $("radius-value").textContent = theme.radius + "px";
  $("angle-value").textContent = theme.background.angle + "°";
  for (const k of [...colors, "end"]) {
    const v = k === "end" ? theme.background.end : theme.colors[k];
    $("color-" + k).value = v;
    $("hex-" + k).value = v;
  }
}
function changed() {
  dirty = true;
  $("apply").disabled = true;
  notice("Unsaved changes");
  $("radius-value").textContent = theme.radius + "px";
  $("angle-value").textContent = theme.background.angle + "°";
  clearTimeout(timer);
  timer = setTimeout(preview, 1200);
}
for (const key of ["name", "brand"])
  $(key).addEventListener("input", () => {
    theme[key] = $(key).value;
    changed();
  });
$("radius").addEventListener("input", () => {
  theme.radius = Number($("radius").value);
  changed();
});
$("angle").addEventListener("input", () => {
  theme.background.angle = Number($("angle").value);
  changed();
});
$("design").addEventListener("change", () => {
  theme.background.style = $("design").value;
  changed();
});
const palettes = {
  rose: {
    background: "#2c212b",
    surface: "#392c36",
    surfaceAlt: "#463743",
    text: "#f4ecec",
    muted: "#c5b4c2",
    border: "#65515f",
    accent: "#ddabc2",
    positive: "#b6d0bb",
    negative: "#f0b3b8",
    warning: "#e5c4a0",
  },
  slate: {
    background: "#1e2227",
    surface: "#292e34",
    surfaceAlt: "#32383f",
    text: "#f1f0eb",
    muted: "#b4b8bc",
    border: "#454b52",
    accent: "#d1bfa3",
    positive: "#acd1b4",
    negative: "#ecb0ae",
    warning: "#e1c18b",
  },
};
$("base").addEventListener("change", () => {
  theme.base = $("base").value;
  theme.colors = { ...palettes[theme.base] };
  theme.background.end = theme.base === "rose" ? "#201d2a" : "#171b21";
  fill();
  changed();
});
document.querySelectorAll("[data-kind]").forEach((b) =>
  b.addEventListener("click", () => {
    kind = b.dataset.kind;
    document
      .querySelectorAll("[data-kind]")
      .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    clearTimeout(timer);
    preview();
  }),
);
async function preview() {
  if (!theme) return;
  const n = ++sequence;
  controller?.abort();
  controller = new AbortController();
  $("preview").classList.add("busy");
  try {
    const r = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({ theme, kind }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const e = await r.json();
      throw new Error(e.error || "Preview unavailable.");
    }
    const blob = await r.blob();
    if (n !== sequence) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    $("preview").src = previewUrl;
    $("preview").hidden = false;
    $("preview-placeholder").hidden = true;
  } catch (e) {
    if (e.name !== "AbortError" && n === sequence) notice(e.message, true);
  } finally {
    if (n === sequence) $("preview").classList.remove("busy");
  }
}
function lock(value) {
  busy = value;
  $("save").disabled = value;
  $("apply").disabled =
    value || dirty || !revision || appliedRevision === revision;
}
$("theme-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !theme) return;
  clearTimeout(timer);
  lock(true);
  const saved = JSON.stringify(theme);
  try {
    const r = await api("/api/save", { revision, theme });
    revision = r.revision;
    dirty = JSON.stringify(theme) !== saved;
    notice(
      dirty
        ? "Draft saved. New changes remain unsaved."
        : "Draft saved. Ready to apply.",
    );
    await preview();
  } catch (e) {
    notice(e.message, true);
  } finally {
    lock(false);
  }
});
$("apply").addEventListener("click", async () => {
  if (busy || dirty || !revision) return;
  lock(true);
  try {
    await api("/api/apply", { revision });
    appliedRevision = revision;
    notice("Applied as this server’s default theme.");
  } catch (e) {
    notice(e.message, true);
  } finally {
    lock(false);
  }
});
window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
async function start() {
  $("theme-form").inert = true;
  try {
    const r = await api("/api/theme");
    theme = r.theme;
    revision = r.revision;
    csrf = r.csrf;
    fill();
    $("expiry").textContent =
      "until " +
      new Date(r.expiresAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    $("theme-form").inert = false;
    lock(false);
    notice(
      revision ? "Draft loaded." : "Choose your colors and save your draft.",
    );
    await preview();
  } catch (e) {
    notice(e.message, true);
  }
}
start();
