// src/components/Chart/indicatorLayer.js
import { calculateIndicatorSeries } from "@/indicators/calculators";
import { runUserScriptIndicator } from "@/indicators/userScriptRuntime";

function isPanePlacement(placement) {
  const p = String(placement || "").toLowerCase();
  return p === "pane" || p === "separate";
}

function isZig(inst) {
  const tid = String(inst?.typeId || "").toLowerCase();
  return tid === "zigzag" || tid.includes("zig");
}

function isUserScript(inst) {
  const tid = String(inst?.typeId || "");
  return tid.startsWith("script:");
}

function shouldRenderAsOverlay(inst) {
  if (isZig(inst)) return true;
  return !isPanePlacement(inst?.placement);
}

// ✅ normal: remove pontos inválidos
function normalizeLineData(data) {
  const arr = Array.isArray(data) ? data : [];
  if (!arr.length) return [];

  const out = [];
  for (const p of arr) {
    const t = Number(p?.time);
    const v = Number(p?.value);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    out.push({ time: t, value: v });
  }
  return out;
}

// ✅ preserva "whitespace" ({time} sem value) para quebrar segmentos
function normalizeLineDataWithWhitespace(data) {
  const arr = Array.isArray(data) ? data : [];
  if (!arr.length) return [];

  const out = [];
  for (const p of arr) {
    const t = Number(p?.time);
    if (!Number.isFinite(t)) continue;

    if ("value" in (p || {})) {
      const v = Number(p?.value);
      if (!Number.isFinite(v)) out.push({ time: t });
      else out.push({ time: t, value: v });
    } else {
      out.push({ time: t });
    }
  }
  return out;
}

// ✅ Supertrend: uma única série com direção (dir)
function normalizeSupertrendLine(data) {
  const d = data && typeof data === "object" ? data : {};
  const arr = Array.isArray(d.line) ? d.line : [];
  if (!arr.length) return { host: [], full: [] };

  const host = [];
  const full = [];

  for (const p of arr) {
    const t = Number(p?.time);
    const v = Number(p?.value);
    const dir = Number(p?.dir);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;

    const dd = dir === 1 ? 1 : 0;
    host.push({ time: t, value: v });
    full.push({ time: t, value: v, dir: dd });
  }

  return { host, full };
}

// --------------------------
// ✅ Style/Visibility helpers
// --------------------------
function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function normalizeHexColor(v, fallback = "#ffffff") {
  const s = typeof v === "string" ? v.trim() : "";
  if (/^#([0-9a-fA-F]{6})$/.test(s)) return s;
  if (/^#([0-9a-fA-F]{3})$/.test(s)) {
    const r = s[1],
      g = s[2],
      b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function hexToRgb(hex) {
  const h = normalizeHexColor(hex);
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return { r, g, b };
}

function rgbaFromHex(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  const aa = clamp(a, 0, 1);
  return `rgba(${r},${g},${b},${aa})`;
}

function lineStyleToLwc(style) {
  const s = String(style || "").toLowerCase();
  if (s === "dotted") return 1;
  if (s === "dashed") return 2;
  return 0;
}

function getCommonSeriesOptions(inst) {
  const st = inst?.settings || {};
  const color = rgbaFromHex(st.styleLineColor ?? "#ffffff", st.styleLineOpacity ?? 0.85);
  const lineWidth = clamp(st.styleLineWidth ?? 1, 1, 6);
  const lineStyle = lineStyleToLwc(st.styleLineStyle ?? "solid");

  const showLabels = !!st.visibilityPriceScaleLabels;
  const showStatus = !!st.visibilityStatusValues;

  return {
    color,
    lineWidth,
    lineStyle,
    priceLineVisible: showLabels,
    lastValueVisible: showLabels,
    crosshairMarkerVisible: showStatus,
  };
}

function applyOptionsSafe(series, opts) {
  if (!series?.applyOptions) return;
  try {
    series.applyOptions(opts);
  } catch {}
}

// --------------------------
// ✅ per-part visibility
// --------------------------
function getPartVisibility(inst, partKey) {
  const st = inst?.settings || {};
  const base = !!inst?.visible;
  if (!base) return false;

  if (partKey === "middle") return st.visibilityMiddle !== false;
  if (partKey === "upper") return st.visibilityUpper !== false;
  if (partKey === "lower") return st.visibilityLower !== false;
  if (partKey === "up") return st.visibilityUp !== false;
  if (partKey === "down") return st.visibilityDown !== false;

  if (st.visibilityParts && typeof st.visibilityParts === "object") {
    if (partKey in st.visibilityParts) return st.visibilityParts[partKey] !== false;
  }

  const k = String(partKey || "");
  if (k) {
    const cap = k.charAt(0).toUpperCase() + k.slice(1);
    const dyn = st[`visibility${cap}`];
    if (typeof dyn === "boolean") return dyn !== false;
  }

  return base;
}

// --------------------------
// ✅ PSAR helpers
// --------------------------
function mapPsarSettingsForCalculator(inst) {
  const st = inst?.settings || {};
  const next = { ...st };

  if (next.step == null) {
    if (next.increment != null) next.step = next.increment;
    else if (next.start != null) next.step = next.start;
  }

  return next;
}

function getPsarDotColor(inst) {
  const st = inst?.settings || {};
  const hex = normalizeHexColor(st.psarDotColor ?? st.styleLineColor ?? "#3b82f6", "#3b82f6");
  const opacity = clamp(st.psarDotOpacity ?? st.styleLineOpacity ?? 1, 0, 1);
  return rgbaFromHex(hex, opacity);
}

function getPsarDotSize(inst) {
  const st = inst?.settings || {};
  return clamp(st.psarDotSize ?? 3, 2, 6);
}

function getPsarRadiusCssFromSize(size) {
  const s = clamp(size, 2, 6);
  return 0.9 + (s - 2) * 0.28;
}

class PsarDotsPrimitive {
  constructor({ chart, series }) {
    this._chart = chart;
    this._series = series;
    this._data = [];
    this._color = "rgba(59,130,246,1)";
    this._radiusCss = 1.15;
  }

  setStyle({ color, radiusCss }) {
    if (typeof color === "string" && color) this._color = color;
    if (Number.isFinite(Number(radiusCss))) this._radiusCss = Number(radiusCss);
  }

  setData(data) {
    this._data = Array.isArray(data) ? data : [];
  }

  paneViews() {
    const self = this;
    return [
      {
        renderer() {
          return {
            draw(target) {
              const chart = self._chart;
              const series = self._series;
              if (!chart || !series) return;

              const ts = chart.timeScale?.();
              if (!ts?.timeToCoordinate || !series.priceToCoordinate) return;

              const pts = self._data;
              if (!pts || !pts.length) return;

              if (typeof target?.useBitmapCoordinateSpace !== "function") return;

              target.useBitmapCoordinateSpace((scope) => {
                const ctx = scope.context;
                if (!ctx) return;

                const hRatio = Number(scope.horizontalPixelRatio) || 1;
                const vRatio = Number(scope.verticalPixelRatio) || 1;
                const r = Math.max(1, self._radiusCss * Math.max(hRatio, vRatio));

                ctx.save();
                ctx.fillStyle = self._color;

                for (let i = 0; i < pts.length; i++) {
                  const p = pts[i];
                  const t = Number(p?.time);
                  const v = Number(p?.value);
                  if (!Number.isFinite(t) || !Number.isFinite(v)) continue;

                  const x = ts.timeToCoordinate(t);
                  const y = series.priceToCoordinate(v);
                  if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

                  const bx = x * hRatio;
                  const by = y * vRatio;

                  ctx.beginPath();
                  ctx.arc(bx, by, r, 0, Math.PI * 2);
                  ctx.fill();
                }

                ctx.restore();
              });
            },
          };
        },
      },
    ];
  }
}

function buildPsarMarkers(data, color, size) {
  const arr = Array.isArray(data) ? data : [];
  if (!arr.length) return [];
  const out = [];
  const markerSize = clamp(size ?? 3, 1, 6);

  for (const p of arr) {
    const t = Number(p?.time);
    const v = Number(p?.value);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    out.push({
      time: t,
      position: "inBar",
      shape: "circle",
      color,
      size: markerSize,
    });
  }
  return out;
}

// --------------------------
// ✅ ZIGZAG primitive (mantido)
// --------------------------
function getZigUpColor(inst) {
  const st = inst?.settings || {};
  const hex = normalizeHexColor(st.zigzagUpColor ?? st.upColor ?? "#FF7700", "#FF7700");
  const opacity = clamp(st.zigzagUpOpacity ?? 1, 0, 1);
  return rgbaFromHex(hex, opacity);
}

function getZigDownColor(inst) {
  const st = inst?.settings || {};
  const hex = normalizeHexColor(st.zigzagDownColor ?? st.downColor ?? "#57A1D0", "#57A1D0");
  const opacity = clamp(st.zigzagDownOpacity ?? 1, 0, 1);
  return rgbaFromHex(hex, opacity);
}

function getZigWidth(inst) {
  const st = inst?.settings || {};
  return clamp(st.zigzagWidth ?? st.styleLineWidth ?? 1, 1, 6);
}

class ZigZagSegmentsPrimitive {
  constructor({ chart, series }) {
    this._chart = chart;
    this._series = series;

    this._data = [];
    this._upColor = "rgba(255,119,0,1)";
    this._downColor = "rgba(87,161,208,1)";
    this._widthCss = 1;
    this._visible = true;
  }

  setVisible(v) {
    this._visible = !!v;
  }

  setStyle({ upColor, downColor, widthCss }) {
    if (typeof upColor === "string" && upColor) this._upColor = upColor;
    if (typeof downColor === "string" && downColor) this._downColor = downColor;
    if (Number.isFinite(Number(widthCss))) this._widthCss = Number(widthCss);
  }

  setData(data) {
    this._data = Array.isArray(data) ? data : [];
  }

  paneViews() {
    const self = this;
    return [
      {
        renderer() {
          return {
            draw(target) {
              if (!self._visible) return;

              const chart = self._chart;
              const series = self._series;
              if (!chart || !series) return;

              const ts = chart.timeScale?.();
              if (!ts?.timeToCoordinate || !series.priceToCoordinate) return;

              const pts = self._data;
              if (!pts || pts.length < 2) return;

              if (typeof target?.useBitmapCoordinateSpace !== "function") return;

              target.useBitmapCoordinateSpace((scope) => {
                const ctx = scope.context;
                if (!ctx) return;

                const hRatio = Number(scope.horizontalPixelRatio) || 1;
                const vRatio = Number(scope.verticalPixelRatio) || 1;
                const w = Math.max(1, self._widthCss * Math.max(hRatio, vRatio));

                ctx.save();
                ctx.lineWidth = w;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";

                for (let i = 0; i < pts.length - 1; i++) {
                  const a = pts[i];
                  const b = pts[i + 1];

                  const ta = Number(a?.time);
                  const va = Number(a?.value);
                  const tb = Number(b?.time);
                  const vb = Number(b?.value);

                  if (!Number.isFinite(ta) || !Number.isFinite(tb) || !Number.isFinite(va) || !Number.isFinite(vb))
                    continue;

                  const xa = ts.timeToCoordinate(ta);
                  const ya = series.priceToCoordinate(va);
                  const xb = ts.timeToCoordinate(tb);
                  const yb = series.priceToCoordinate(vb);

                  if (!Number.isFinite(xa) || !Number.isFinite(ya) || !Number.isFinite(xb) || !Number.isFinite(yb))
                    continue;

                  const bax = xa * hRatio;
                  const bay = ya * vRatio;
                  const bbx = xb * hRatio;
                  const bby = yb * vRatio;

                  const up = vb >= va;
                  ctx.strokeStyle = up ? self._upColor : self._downColor;

                  ctx.beginPath();
                  ctx.moveTo(bax, bay);
                  ctx.lineTo(bbx, bby);
                  ctx.stroke();
                }

                ctx.restore();
              });
            },
          };
        },
      },
    ];
  }
}

// --------------------------
// ✅ SuperTrend primitive (mantido)
// --------------------------
class SuperTrendSegmentsPrimitive {
  constructor({ chart, series }) {
    this._chart = chart;
    this._series = series;

    this._data = []; // [{time,value,dir}]
    this._upColor = "rgba(0,193,118,0.55)";
    this._downColor = "rgba(255,77,79,0.55)";
    this._widthCss = 1;
    this._visible = true;
  }

  setVisible(v) {
    this._visible = !!v;
  }

  setStyle({ upColor, downColor, widthCss }) {
    if (typeof upColor === "string" && upColor) this._upColor = upColor;
    if (typeof downColor === "string" && downColor) this._downColor = downColor;
    if (Number.isFinite(Number(widthCss))) this._widthCss = Number(widthCss);
  }

  setData(data) {
    this._data = Array.isArray(data) ? data : [];
  }

  paneViews() {
    const self = this;
    return [
      {
        renderer() {
          return {
            draw(target) {
              if (!self._visible) return;

              const chart = self._chart;
              const series = self._series;
              if (!chart || !series) return;

              const ts = chart.timeScale?.();
              if (!ts?.timeToCoordinate || !series.priceToCoordinate) return;

              const pts = self._data;
              if (!pts || pts.length < 2) return;

              if (typeof target?.useBitmapCoordinateSpace !== "function") return;

              target.useBitmapCoordinateSpace((scope) => {
                const ctx = scope.context;
                if (!ctx) return;

                const hRatio = Number(scope.horizontalPixelRatio) || 1;
                const vRatio = Number(scope.verticalPixelRatio) || 1;
                const w = Math.max(1, self._widthCss * Math.max(hRatio, vRatio));

                ctx.save();
                ctx.lineWidth = w;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";

                for (let i = 0; i < pts.length - 1; i++) {
                  const a = pts[i];
                  const b = pts[i + 1];

                  const ta = Number(a?.time);
                  const va = Number(a?.value);
                  const tb = Number(b?.time);
                  const vb = Number(b?.value);

                  if (!Number.isFinite(ta) || !Number.isFinite(tb) || !Number.isFinite(va) || !Number.isFinite(vb))
                    continue;

                  const xa = ts.timeToCoordinate(ta);
                  const ya = series.priceToCoordinate(va);
                  const xb = ts.timeToCoordinate(tb);
                  const yb = series.priceToCoordinate(vb);

                  if (!Number.isFinite(xa) || !Number.isFinite(ya) || !Number.isFinite(xb) || !Number.isFinite(yb))
                    continue;

                  const bax = xa * hRatio;
                  const bay = ya * vRatio;
                  const bbx = xb * hRatio;
                  const bby = yb * vRatio;

                  const dir = Number(b?.dir) === 1 ? 1 : 0;
                  ctx.strokeStyle = dir === 1 ? self._upColor : self._downColor;

                  ctx.beginPath();
                  ctx.moveTo(bax, bay);
                  ctx.lineTo(bbx, bby);
                  ctx.stroke();
                }

                ctx.restore();
              });
            },
          };
        },
      },
    ];
  }
}

// --------------------------
// ✅ FRACTAL primitive — setas pequenas, cores trocadas e apontando para FORA
// --------------------------
function getFractalTopColor(inst) {
  const st = inst?.settings || {};
  return normalizeHexColor(st.fractalTopColor ?? st.fractalUpColor ?? "#22c55e", "#22c55e");
}

function getFractalBottomColor(inst) {
  const st = inst?.settings || {};
  return normalizeHexColor(st.fractalBottomColor ?? st.fractalDownColor ?? "#ef4444", "#ef4444");
}

function getFractalSize(inst) {
  const st = inst?.settings || {};
  return clamp(st.fractalSize ?? 2, 1, 4);
}

class FractalArrowsPrimitive {
  constructor({ chart, series }) {
    this._chart = chart;
    this._series = series;

    this._top = [];
    this._bottom = [];
    this._topColor = "#22c55e";
    this._bottomColor = "#ef4444";
    this._size = 2;
    this._visible = true;
  }

  setVisible(v) {
    this._visible = !!v;
  }

  setStyle({ topColor, bottomColor, size }) {
    if (typeof topColor === "string" && topColor) this._topColor = topColor;
    if (typeof bottomColor === "string" && bottomColor) this._bottomColor = bottomColor;
    if (Number.isFinite(Number(size))) this._size = clamp(size, 1, 4);
  }

  setData({ top, bottom }) {
    this._top = Array.isArray(top) ? top : [];
    this._bottom = Array.isArray(bottom) ? bottom : [];
  }

  paneViews() {
    const self = this;
    return [
      {
        renderer() {
          return {
            draw(target) {
              if (!self._visible) return;

              const chart = self._chart;
              const series = self._series;
              if (!chart || !series) return;

              const ts = chart.timeScale?.();
              if (!ts?.timeToCoordinate || !series.priceToCoordinate) return;

              if (typeof target?.useBitmapCoordinateSpace !== "function") return;

              target.useBitmapCoordinateSpace((scope) => {
                const ctx = scope.context;
                if (!ctx) return;

                const hRatio = Number(scope.horizontalPixelRatio) || 1;
                const vRatio = Number(scope.verticalPixelRatio) || 1;

                const base = Math.max(4.2, self._size * 1.9);
                const w = base * hRatio;
                const h = base * vRatio;

                const drawTriangleUp = (x, y, color) => {
                  ctx.fillStyle = color;
                  ctx.beginPath();
                  ctx.moveTo(x, y - h);
                  ctx.lineTo(x - w * 0.65, y + h * 0.35);
                  ctx.lineTo(x + w * 0.65, y + h * 0.35);
                  ctx.closePath();
                  ctx.fill();
                };

                const drawTriangleDown = (x, y, color) => {
                  ctx.fillStyle = color;
                  ctx.beginPath();
                  ctx.moveTo(x, y + h);
                  ctx.lineTo(x - w * 0.65, y - h * 0.35);
                  ctx.lineTo(x + w * 0.65, y - h * 0.35);
                  ctx.closePath();
                  ctx.fill();
                };

                ctx.save();

                for (let i = 0; i < self._top.length; i++) {
                  const p = self._top[i];
                  const t = Number(p?.time);
                  const v = Number(p?.value);
                  if (!Number.isFinite(t) || !Number.isFinite(v)) continue;

                  const x = ts.timeToCoordinate(t);
                  const y = series.priceToCoordinate(v);
                  if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

                  const bx = x * hRatio;
                  const by = y * vRatio - h * 1.15;
                  drawTriangleUp(bx, by, self._topColor);
                }

                for (let i = 0; i < self._bottom.length; i++) {
                  const p = self._bottom[i];
                  const t = Number(p?.time);
                  const v = Number(p?.value);
                  if (!Number.isFinite(t) || !Number.isFinite(v)) continue;

                  const x = ts.timeToCoordinate(t);
                  const y = series.priceToCoordinate(v);
                  if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

                  const bx = x * hRatio;
                  const by = y * vRatio + h * 1.15;
                  drawTriangleDown(bx, by, self._bottomColor);
                }

                ctx.restore();
              });
            },
          };
        },
      },
    ];
  }
}

function buildFractalMarkers(fractalData, inst) {
  const d = fractalData && typeof fractalData === "object" ? fractalData : {};
  const highs = Array.isArray(d.up) ? d.up : [];
  const lows = Array.isArray(d.down) ? d.down : [];

  const topColor = getFractalTopColor(inst);
  const bottomColor = getFractalBottomColor(inst);
  const size = getFractalSize(inst);

  const out = [];

  for (const p of highs) {
    const t = Number(p?.time);
    if (!Number.isFinite(t)) continue;
    out.push({ time: t, position: "aboveBar", shape: "arrowUp", color: topColor, size });
  }

  for (const p of lows) {
    const t = Number(p?.time);
    if (!Number.isFinite(t)) continue;
    out.push({ time: t, position: "belowBar", shape: "arrowDown", color: bottomColor, size });
  }

  return out;
}

export default class IndicatorLayer {
  constructor({ chart }) {
    this.chart = chart;
    this.map = new Map();
  }

  _overlaySeriesBaseOptions() {
    return {
      priceScaleId: "right",
    };
  }

  _rememberEntry(instanceId, entry) {
    if (!instanceId || !entry) return;
    this.map.set(instanceId, entry);
  }

  _rebuildAllInstances() {
    const snapshot = [];

    for (const [instanceId, entry] of this.map.entries()) {
      if (!entry?.inst) continue;
      snapshot.push({
        instanceId,
        inst: entry.inst,
        forcedKind: entry.forcedKind || null,
      });
    }

    for (const [instanceId] of this.map.entries()) {
      this._removeInstance(instanceId);
    }
    this.map.clear();

    for (const item of snapshot) {
      this._addInstance(item.inst, item.forcedKind || null);
    }
  }

  dispose() {
    for (const [instanceId] of this.map) {
      this._removeInstance(instanceId);
    }
    this.map.clear();
  }

  clearAllData() {
    // ✅ FIX CRÍTICO:
    // Em troca de par, overlays antigos ficavam vivos no chart e apenas tinham os dados limpos.
    // Isso pode deixar a right price scale em estado inconsistente no LWC quando há séries host/primitive.
    // Aqui fazemos rebuild real das séries overlay para rebinding limpo da scale.
    this._rebuildAllInstances();
  }

  syncInstances(instances) {
    const list = Array.isArray(instances) ? instances : [];

    const overlay = list.filter((i) => shouldRenderAsOverlay(i));
    const nextIds = new Set(overlay.map((i) => i?.instanceId).filter(Boolean));

    for (const [id] of this.map) {
      if (!nextIds.has(id)) this._removeInstance(id);
    }

    for (const inst of overlay) {
      if (!inst?.instanceId) continue;

      if (!this.map.has(inst.instanceId)) {
        this._addInstance(inst);
      } else {
        const entry = this.map.get(inst.instanceId);
        if (entry) entry.inst = inst;
        this._applyVisibility(inst);
        this._applyStyle(inst);
      }
    }
  }

  applyData(candles, instances) {
    const arr = Array.isArray(candles) ? candles : [];
    if (!arr.length) return;

    const list = Array.isArray(instances) ? instances : [];
    const overlay = list.filter((i) => shouldRenderAsOverlay(i));

    for (const instRaw of overlay) {
      if (!instRaw?.instanceId) continue;

      if (!this.map.has(instRaw.instanceId)) this._addInstance(instRaw);

      let entry = this.map.get(instRaw.instanceId);
      if (!entry) continue;

      entry.inst = instRaw;

      if (isUserScript(instRaw)) {
        const code = String(instRaw?.settings?.scriptCode || "");
        const res = runUserScriptIndicator({
          code,
          candles: arr,
          settings: instRaw.settings || {},
          meta: { typeId: instRaw.typeId, name: instRaw.name },
        });

        if (!res || res.kind === "none") continue;

        const wantKind =
          res.kind === "bands" || res.kind === "channel"
            ? "triple"
            : res.kind === "supertrend"
            ? "double"
            : res.kind === "markers"
            ? "markers"
            : "line";

        if (entry.kind !== wantKind) {
          this._removeInstance(instRaw.instanceId);
          this._addInstance(instRaw, wantKind);
          entry = this.map.get(instRaw.instanceId);
          if (!entry) continue;
          entry.inst = instRaw;
        }

        if (res.kind === "line") {
          entry.series?.setData?.(normalizeLineData(res.data));
        } else if (res.kind === "bands" || res.kind === "channel") {
          const d = res.data || {};
          entry.seriesMiddle?.setData?.(normalizeLineData(d.middle));
          entry.seriesUpper?.setData?.(normalizeLineData(d.upper));
          entry.seriesLower?.setData?.(normalizeLineData(d.lower));
        } else if (res.kind === "supertrend") {
          const d = res.data || {};
          entry.seriesUp?.setData?.(normalizeLineDataWithWhitespace(d.up));
          entry.seriesDown?.setData?.(normalizeLineDataWithWhitespace(d.down));
        } else if (res.kind === "markers") {
          try {
            entry.series?.setMarkers?.(Array.isArray(res.data) ? res.data : []);
          } catch {}
        }

        continue;
      }

      const typeId = String(instRaw.typeId || "").toLowerCase();
      const inst =
        typeId === "psar"
          ? { ...instRaw, settings: mapPsarSettingsForCalculator(instRaw) }
          : instRaw;

      const res = calculateIndicatorSeries(inst, arr);
      if (!res || res.kind === "none") continue;

      if (res.kind === "line") {
        if (typeId === "zigzag") {
          const pts = normalizeLineData(res.data);
          try {
            entry.series?.setData?.(pts);
          } catch {}
          if (entry.zigzagPrimitive) entry.zigzagPrimitive.setData(pts);
        } else {
          entry.series?.setData?.(normalizeLineData(res.data));
        }
      } else if (res.kind === "bands") {
        const d = res.data || {};
        entry.seriesMiddle?.setData?.(normalizeLineData(d.middle));
        entry.seriesUpper?.setData?.(normalizeLineData(d.upper));
        entry.seriesLower?.setData?.(normalizeLineData(d.lower));
      } else if (res.kind === "channel") {
        const d = res.data || {};
        entry.seriesMiddle?.setData?.(normalizeLineData(d.middle));
        entry.seriesUpper?.setData?.(normalizeLineData(d.upper));
        entry.seriesLower?.setData?.(normalizeLineData(d.lower));
      } else if (res.kind === "supertrend") {
        if (typeId === "supertrend" && entry.kind === "supertrend") {
          const { host, full } = normalizeSupertrendLine(res.data);
          entry.series?.setData?.(host);
          if (entry.supertrendPrimitive) entry.supertrendPrimitive.setData(full);
        } else {
          const d = res.data || {};
          entry.seriesUp?.setData?.(normalizeLineDataWithWhitespace(d.up));
          entry.seriesDown?.setData?.(normalizeLineDataWithWhitespace(d.down));
        }
      } else if (res.kind === "psar") {
        const psarLine = normalizeLineData(res.data);
        entry.series?.setData?.(psarLine);

        const st = instRaw?.settings || {};
        const traceEnabled = st.psarTraceEnabled !== false;

        const color = getPsarDotColor(instRaw);
        const size = getPsarDotSize(instRaw);
        const radiusCss = getPsarRadiusCssFromSize(size);

        if (!traceEnabled) {
          if (entry.psarPrimitive) entry.psarPrimitive.setData([]);
          try {
            entry.series?.setMarkers?.([]);
          } catch {}
          continue;
        }

        if (entry.psarPrimitive) {
          entry.psarPrimitive.setStyle({ color, radiusCss });
          entry.psarPrimitive.setData(psarLine);
        } else {
          try {
            entry.series?.setMarkers?.(buildPsarMarkers(psarLine, color, size));
          } catch {}
        }
      } else if (res.kind === "fractal") {
        const d = res.data && typeof res.data === "object" ? res.data : {};
        const highs = Array.isArray(d.up) ? d.up : [];
        const lows = Array.isArray(d.down) ? d.down : [];

        const host = [];
        for (let i = 0; i < arr.length; i++) {
          const t = Number(arr[i]?.time);
          const v = Number(arr[i]?.close);
          if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
          host.push({ time: t, value: v });
        }
        try {
          entry.series?.setData?.(host);
        } catch {}

        if (entry.fractalPrimitive) {
          entry.fractalPrimitive.setData({ top: highs, bottom: lows });
        }

        try {
          entry.series?.setMarkers?.(buildFractalMarkers(res.data, instRaw));
        } catch {}
      } else if (res.kind === "multi") {
        const d = res.data && typeof res.data === "object" ? res.data : {};
        const parts = d.parts && typeof d.parts === "object" ? d.parts : {};
        const seriesByKey = entry.seriesByKey && typeof entry.seriesByKey === "object" ? entry.seriesByKey : {};

        for (const k of Object.keys(seriesByKey)) {
          const s = seriesByKey[k];
          const arrPart = parts[k];
          if (!Array.isArray(arrPart)) {
            try {
              s?.setData?.([]);
            } catch {}
            continue;
          }
          s?.setData?.(normalizeLineData(arrPart));
        }
      }
    }
  }

  _addInstance(inst, forcedKind = null) {
    const chart = this.chart;
    if (!chart) return;
    if (!shouldRenderAsOverlay(inst)) return;

    const typeId = String(inst.typeId || "").toLowerCase();

    const baseCommon = {
      ...this._overlaySeriesBaseOptions(),
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    };

    if (isUserScript(inst)) {
      const common = getCommonSeriesOptions(inst);
      const kind = forcedKind || "line";

      if (kind === "triple") {
        const seriesMiddle = chart.addLineSeries({ ...baseCommon, ...common });
        const seriesUpper = chart.addLineSeries({ ...baseCommon, ...common });
        const seriesLower = chart.addLineSeries({ ...baseCommon, ...common });
        this._rememberEntry(inst.instanceId, {
          inst,
          forcedKind: kind,
          kind: "triple",
          seriesMiddle,
          seriesUpper,
          seriesLower,
        });
        this._applyVisibility(inst);
        this._applyStyle(inst);
        return;
      }

      if (kind === "double") {
        const seriesUp = chart.addLineSeries({ ...baseCommon, ...common });
        const seriesDown = chart.addLineSeries({ ...baseCommon, ...common });
        this._rememberEntry(inst.instanceId, {
          inst,
          forcedKind: kind,
          kind: "double",
          seriesUp,
          seriesDown,
        });
        this._applyVisibility(inst);
        this._applyStyle(inst);
        return;
      }

      const series = chart.addLineSeries({ ...baseCommon, ...common });
      this._rememberEntry(inst.instanceId, {
        inst,
        forcedKind: kind,
        kind: kind === "markers" ? "markers" : "line",
        series,
      });
      this._applyVisibility(inst);
      this._applyStyle(inst);
      return;
    }

    if (typeId === "fractal") {
      const series = chart.addLineSeries({
        ...baseCommon,
        color: rgbaFromHex("#ffffff", 0),
        lineWidth: 1,
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      let fractalPrimitive = null;
      if (typeof series?.attachPrimitive === "function") {
        try {
          fractalPrimitive = new FractalArrowsPrimitive({ chart, series });
          series.attachPrimitive(fractalPrimitive);
        } catch {
          fractalPrimitive = null;
        }
      }

      this._rememberEntry(inst.instanceId, {
        inst,
        forcedKind: null,
        kind: "fractal",
        series,
        fractalPrimitive,
      });
      this._applyVisibility(inst);
      this._applyStyle(inst);
      return;
    }

    if (typeId === "bollinger" || typeId === "donchian" || typeId === "keltner" || typeId === "envelopes") {
      const mid = getCommonSeriesOptions(inst);
      const upper = {
        ...mid,
        color: rgbaFromHex(inst?.settings?.styleUpperColor ?? "#ffffff", inst?.settings?.styleUpperOpacity ?? 0.35),
      };
      const lower = {
        ...mid,
        color: rgbaFromHex(inst?.settings?.styleLowerColor ?? "#ffffff", inst?.settings?.styleLowerOpacity ?? 0.35),
      };

      const seriesMiddle = chart.addLineSeries({ ...baseCommon, ...mid });
      const seriesUpper = chart.addLineSeries({ ...baseCommon, ...upper });
      const seriesLower = chart.addLineSeries({ ...baseCommon, ...lower });

      this._rememberEntry(inst.instanceId, {
        inst,
        forcedKind: null,
        kind: "triple",
        seriesMiddle,
        seriesUpper,
        seriesLower,
      });
      this._applyVisibility(inst);
      return;
    }

    if (typeId === "supertrend") {
      const series = chart.addLineSeries({
        ...baseCommon,
        color: rgbaFromHex("#ffffff", 0),
        lineWidth: 1,
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      let supertrendPrimitive = null;
      if (typeof series?.attachPrimitive === "function") {
        try {
          supertrendPrimitive = new SuperTrendSegmentsPrimitive({ chart, series });
          series.attachPrimitive(supertrendPrimitive);
        } catch {
          supertrendPrimitive = null;
        }
      }

      this._rememberEntry(inst.instanceId, {
        inst,
        forcedKind: null,
        kind: "supertrend",
        series,
        supertrendPrimitive,
      });
      this._applyVisibility(inst);
      this._applyStyle(inst);
      return;
    }

    if (typeId === "psar") {
      const hostColor = rgbaFromHex(inst?.settings?.styleLineColor ?? "#3b82f6", 0);

      const series = chart.addLineSeries({
        ...baseCommon,
        color: hostColor,
        lineWidth: 1,
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      let psarPrimitive = null;
      if (typeof series?.attachPrimitive === "function") {
        try {
          psarPrimitive = new PsarDotsPrimitive({ chart, series });
          series.attachPrimitive(psarPrimitive);
        } catch {
          psarPrimitive = null;
        }
      }

      this._rememberEntry(inst.instanceId, {
        inst,
        forcedKind: null,
        kind: "psar",
        series,
        psarPrimitive,
      });
      this._applyVisibility(inst);
      return;
    }

    if (typeId === "zigzag") {
      const series = chart.addLineSeries({
        ...baseCommon,
        color: getZigUpColor(inst),
        lineWidth: getZigWidth(inst),
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      let zigzagPrimitive = null;
      if (typeof series?.attachPrimitive === "function") {
        try {
          zigzagPrimitive = new ZigZagSegmentsPrimitive({ chart, series });
          series.attachPrimitive(zigzagPrimitive);
        } catch {
          zigzagPrimitive = null;
        }
      }

      this._rememberEntry(inst.instanceId, {
        inst,
        forcedKind: null,
        kind: "zigzag",
        series,
        zigzagPrimitive,
        zigzagHasPrimitive: !!zigzagPrimitive,
      });

      this._applyVisibility(inst);
      this._applyStyle(inst);
      return;
    }

    if (typeId === "pivots" || typeId === "autosr") {
      const common = getCommonSeriesOptions(inst);
      const st = inst?.settings || {};

      const keys =
        typeId === "pivots"
          ? ["P", "R1", "R2", "R3", "S1", "S2", "S3"]
          : Array.from({ length: 12 }, (_, i) => `L${i + 1}`);

      const seriesByKey = {};

      for (const k of keys) {
        const colorKey = `style${k}Color`;
        const opKey = `style${k}Opacity`;

        const color = rgbaFromHex(
          st[colorKey] ?? st.styleLineColor ?? "#ffffff",
          st[opKey] ?? st.styleLineOpacity ?? 0.35
        );

        const s = chart.addLineSeries({
          ...baseCommon,
          ...common,
          color,
        });

        seriesByKey[k] = s;
      }

      this._rememberEntry(inst.instanceId, {
        inst,
        forcedKind: null,
        kind: "multi",
        seriesByKey,
      });
      this._applyVisibility(inst);
      this._applyStyle(inst);
      return;
    }

    const common = getCommonSeriesOptions(inst);
    const series = chart.addLineSeries({ ...baseCommon, ...common });
    this._rememberEntry(inst.instanceId, {
      inst,
      forcedKind: null,
      kind: "line",
      series,
    });
    this._applyVisibility(inst);
  }

  _removeInstance(instanceId) {
    const chart = this.chart;
    const entry = this.map.get(instanceId);
    if (!entry || !chart) return;

    const removeSeries = (s) => {
      if (!s) return;
      try {
        chart.removeSeries(s);
      } catch {}
    };

    if (entry.psarPrimitive && entry.series && typeof entry.series?.detachPrimitive === "function") {
      try {
        entry.series.detachPrimitive(entry.psarPrimitive);
      } catch {}
    }

    if (entry.zigzagPrimitive && entry.series && typeof entry.series?.detachPrimitive === "function") {
      try {
        entry.series.detachPrimitive(entry.zigzagPrimitive);
      } catch {}
    }

    if (entry.supertrendPrimitive && entry.series && typeof entry.series?.detachPrimitive === "function") {
      try {
        entry.series.detachPrimitive(entry.supertrendPrimitive);
      } catch {}
    }

    if (entry.fractalPrimitive && entry.series && typeof entry.series?.detachPrimitive === "function") {
      try {
        entry.series.detachPrimitive(entry.fractalPrimitive);
      } catch {}
    }

    if (entry.seriesByKey && typeof entry.seriesByKey === "object") {
      for (const k of Object.keys(entry.seriesByKey)) {
        removeSeries(entry.seriesByKey[k]);
      }
    }

    removeSeries(entry.series);
    removeSeries(entry.seriesMiddle);
    removeSeries(entry.seriesUpper);
    removeSeries(entry.seriesLower);
    removeSeries(entry.seriesUp);
    removeSeries(entry.seriesDown);

    this.map.delete(instanceId);
  }

  _applyVisibility(inst) {
    const entry = this.map.get(inst.instanceId);
    if (!entry) return;

    const apply = (s, vis) => {
      if (!s?.applyOptions) return;
      try {
        s.applyOptions({ visible: !!vis });
      } catch {}
    };

    if (entry.kind === "line" || entry.kind === "markers") {
      apply(entry.series, !!inst.visible);
      return;
    }

    if (entry.kind === "fractal") {
      apply(entry.series, !!inst.visible);
      if (entry.fractalPrimitive?.setVisible) entry.fractalPrimitive.setVisible(!!inst.visible);
      return;
    }

    if (entry.kind === "supertrend") {
      apply(entry.series, !!inst.visible);
      if (entry.supertrendPrimitive?.setVisible) entry.supertrendPrimitive.setVisible(!!inst.visible);
      return;
    }

    if (entry.kind === "triple") {
      apply(entry.seriesMiddle, getPartVisibility(inst, "middle"));
      apply(entry.seriesUpper, getPartVisibility(inst, "upper"));
      apply(entry.seriesLower, getPartVisibility(inst, "lower"));
      return;
    }

    if (entry.kind === "double") {
      apply(entry.seriesUp, getPartVisibility(inst, "up"));
      apply(entry.seriesDown, getPartVisibility(inst, "down"));
      return;
    }

    if (entry.kind === "psar") {
      apply(entry.series, !!inst.visible);
      return;
    }

    if (entry.kind === "zigzag") {
      apply(entry.series, !!inst.visible);
      if (entry.zigzagPrimitive?.setVisible) entry.zigzagPrimitive.setVisible(!!inst.visible);
      return;
    }

    if (entry.kind === "multi") {
      const seriesByKey = entry.seriesByKey && typeof entry.seriesByKey === "object" ? entry.seriesByKey : {};
      for (const k of Object.keys(seriesByKey)) {
        apply(seriesByKey[k], getPartVisibility(inst, k));
      }
      return;
    }
  }

  _applyStyle(inst) {
    const entry = this.map.get(inst.instanceId);
    if (!entry) return;

    const typeId = String(inst.typeId || "").toLowerCase();
    const common = getCommonSeriesOptions(inst);

    if (entry.kind === "line" || entry.kind === "markers") {
      applyOptionsSafe(entry.series, common);
      return;
    }

    if (entry.kind === "fractal") {
      applyOptionsSafe(entry.series, {
        color: rgbaFromHex("#ffffff", 0),
        lineWidth: 1,
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      if (entry.fractalPrimitive) {
        entry.fractalPrimitive.setStyle({
          topColor: getFractalTopColor(inst),
          bottomColor: getFractalBottomColor(inst),
          size: getFractalSize(inst),
        });
      }
      return;
    }

    if (entry.kind === "supertrend") {
      const st = inst?.settings || {};
      const upColor = rgbaFromHex(st.styleUpColor ?? "#00c176", st.styleUpOpacity ?? 0.55);
      const downColor = rgbaFromHex(st.styleDownColor ?? "#ff4d4f", st.styleDownOpacity ?? 0.55);
      const widthCss = clamp(st.styleLineWidth ?? 1, 1, 6);

      applyOptionsSafe(entry.series, {
        color: rgbaFromHex("#ffffff", 0),
        lineWidth: 1,
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      if (entry.supertrendPrimitive) {
        entry.supertrendPrimitive.setStyle({ upColor, downColor, widthCss });
      }
      return;
    }

    if (entry.kind === "triple") {
      const st = inst?.settings || {};
      const upper = { ...common, color: rgbaFromHex(st.styleUpperColor ?? "#ffffff", st.styleUpperOpacity ?? 0.35) };
      const lower = { ...common, color: rgbaFromHex(st.styleLowerColor ?? "#ffffff", st.styleLowerOpacity ?? 0.35) };

      applyOptionsSafe(entry.seriesMiddle, common);
      applyOptionsSafe(entry.seriesUpper, upper);
      applyOptionsSafe(entry.seriesLower, lower);
      return;
    }

    if (entry.kind === "double" && typeId === "supertrend") {
      const st = inst?.settings || {};
      const up = { ...common, color: rgbaFromHex(st.styleUpColor ?? "#00c176", st.styleUpOpacity ?? 0.55) };
      const down = { ...common, color: rgbaFromHex(st.styleDownColor ?? "#ff4d4f", st.styleDownOpacity ?? 0.55) };

      applyOptionsSafe(entry.seriesUp, up);
      applyOptionsSafe(entry.seriesDown, down);
      return;
    }

    if (entry.kind === "psar") {
      applyOptionsSafe(entry.series, {
        color: rgbaFromHex(inst?.settings?.styleLineColor ?? "#3b82f6", 0),
        lineWidth: 1,
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      return;
    }

    if (entry.kind === "zigzag") {
      const upColor = getZigUpColor(inst);
      const downColor = getZigDownColor(inst);
      const widthCss = getZigWidth(inst);

      const hasPrim = !!entry.zigzagPrimitive;

      applyOptionsSafe(entry.series, {
        color: hasPrim ? rgbaFromHex("#ffffff", 0) : upColor,
        lineWidth: widthCss,
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      if (entry.zigzagPrimitive) {
        entry.zigzagPrimitive.setStyle({ upColor, downColor, widthCss });
      }
      return;
    }

    if (entry.kind === "multi") {
      const st = inst?.settings || {};
      const seriesByKey = entry.seriesByKey && typeof entry.seriesByKey === "object" ? entry.seriesByKey : {};

      for (const k of Object.keys(seriesByKey)) {
        const s = seriesByKey[k];

        const colorKey = `style${k}Color`;
        const opKey = `style${k}Opacity`;

        const color = rgbaFromHex(
          st[colorKey] ?? st.styleLineColor ?? "#ffffff",
          st[opKey] ?? st.styleLineOpacity ?? 0.35
        );

        applyOptionsSafe(s, { ...common, color });
      }
      return;
    }
  }
}