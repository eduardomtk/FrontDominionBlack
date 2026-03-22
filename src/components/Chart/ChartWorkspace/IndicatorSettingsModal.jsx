// src/components/Chart/IndicatorsPanel/IndicatorSettingsModal.jsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./IndicatorSettingsModal.module.css";
import { getIndicatorDefinition } from "@/indicators/indicatorRegistry";
import SoundManager from "@/sound/SoundManager.js";
// ✅ i18n - DOIS namespaces: modal UI + indicadores
import { useTranslation } from "react-i18next";

const TAB_VALUES = "values";
const TAB_STYLE = "style";
const TAB_VISIBILITY = "visibility";
const DEFAULTS_KEY = "chart.indicator.defaults.v1";

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function safeStr(v) {
  return typeof v === "string" ? v : "";
}

function normalizeHexColor(v, fallback = "#ffffff") {
  const s = safeStr(v).trim();
  if (/^#([0-9a-fA-F]{6})$/.test(s)) return s;
  if (/^#([0-9a-fA-F]{3})$/.test(s)) {
    const r = s[1], g = s[2], b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function loadSavedDefaults(typeId) {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const key = String(typeId || "").toLowerCase();
    return obj?.[key] && typeof obj[key] === "object" ? obj[key] : null;
  } catch {
    return null;
  }
}

function saveDefaults(typeId, settingsObj) {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    const key = String(typeId || "").toLowerCase();
    obj[key] = settingsObj && typeof settingsObj === "object" ? settingsObj : {};
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

function buildFactoryDefaults(typeId, instance) {
  const base = { ...(instance?.settings || {}) };
  if (base.styleLineColor == null) base.styleLineColor = "#ffffff";
  if (base.styleLineOpacity == null) base.styleLineOpacity = 0.85;
  if (base.styleLineWidth == null) base.styleLineWidth = 1;
  if (base.styleLineStyle == null) base.styleLineStyle = "solid";
  if (base.visibilityPriceScaleLabels == null) base.visibilityPriceScaleLabels = false;
  if (base.visibilityStatusValues == null) base.visibilityStatusValues = false;
  if (base.stylePaneBgEnabled == null) base.stylePaneBgEnabled = true;
  if (base.stylePaneBgColor == null) base.stylePaneBgColor = "#16a34a";
  if (base.stylePaneBgOpacity == null) base.stylePaneBgOpacity = 0.10;

  const isTriple = typeId === "bollinger" || typeId === "donchian" || typeId === "keltner" || typeId === "envelopes";
  if (isTriple) {
    if (base.styleUpperColor == null) base.styleUpperColor = "#ffffff";
    if (base.styleUpperOpacity == null) base.styleUpperOpacity = 0.35;
    if (base.styleLowerColor == null) base.styleLowerColor = "#ffffff";
    if (base.styleLowerOpacity == null) base.styleLowerOpacity = 0.35;
    if (base.visibilityMiddle == null) base.visibilityMiddle = true;
    if (base.visibilityUpper == null) base.visibilityUpper = true;
    if (base.visibilityLower == null) base.visibilityLower = true;
  }

  if (typeId === "supertrend") {
    if (base.styleUpColor == null) base.styleUpColor = "#00c176";
    if (base.styleUpOpacity == null) base.styleUpOpacity = 0.55;
    if (base.styleDownColor == null) base.styleDownColor = "#ff4d4f";
    if (base.styleDownOpacity == null) base.styleDownOpacity = 0.55;
    if (base.visibilityUp == null) base.visibilityUp = true;
    if (base.visibilityDown == null) base.visibilityDown = true;
  }

  if (typeId === "psar") {
    base.styleLineColor = "#3b82f6";
    base.styleLineOpacity = 1;
    if (base.psarDotColor == null) base.psarDotColor = "#3b82f6";
    if (base.psarDotOpacity == null) base.psarDotOpacity = 1;
    if (base.psarDotSize == null) base.psarDotSize = 3;
    if (base.psarTraceEnabled == null) base.psarTraceEnabled = true;
    if (base.psarPrecision == null) base.psarPrecision = "default";
    base.styleLineWidth = 1;
    base.styleLineStyle = "solid";
  }

  if (typeId === "stochastic") {
    if (base.styleKColor == null) base.styleKColor = "#00c176";
    if (base.styleKOpacity == null) base.styleKOpacity = 0.85;
    if (base.styleDColor == null) base.styleDColor = "#ffffff";
    if (base.styleDOpacity == null) base.styleDOpacity = 0.70;
    if (base.visibilityK == null) base.visibilityK = true;
    if (base.visibilityD == null) base.visibilityD = true;
  }

  if (typeId === "macd") {
    if (base.styleMacdColor == null) base.styleMacdColor = "#ffffff";
    if (base.styleMacdOpacity == null) base.styleMacdOpacity = 0.85;
    if (base.styleSignalColor == null) base.styleSignalColor = "#9ca3af";
    if (base.styleSignalOpacity == null) base.styleSignalOpacity = 0.55;
    if (base.styleHistUpColor == null) base.styleHistUpColor = "#00c176";
    if (base.styleHistDownColor == null) base.styleHistDownColor = "#ff4d4f";
    if (base.styleHistOpacity == null) base.styleHistOpacity = 0.55;
    if (base.visibilityMacd == null) base.visibilityMacd = true;
    if (base.visibilitySignal == null) base.visibilitySignal = true;
    if (base.visibilityHist == null) base.visibilityHist = true;
  }

  if (typeId === "rsi") {
    if (base.styleLevelsOpacity == null) base.styleLevelsOpacity = 0.55;
    if (base.styleKColor == null) base.styleKColor = "#00c176";
    if (base.styleKOpacity == null) base.styleKOpacity = 0.85;
    if (base.styleDColor == null) base.styleDColor = "#ffffff";
    if (base.styleDOpacity == null) base.styleDOpacity = 0.7;
  }

  return base;
}

function buildDefaultDraft(instance) {
  const typeId = safeStr(instance?.typeId).toLowerCase();
  const def = getIndicatorDefinition(typeId);
  const factory = buildFactoryDefaults(typeId, { ...instance, settings: {} });
  const saved = loadSavedDefaults(typeId) || {};
  const current = instance?.settings && typeof instance.settings === "object" ? instance.settings : {};
  const draft = { ...factory, ...saved, ...current };

  draft.styleLineColor = normalizeHexColor(draft.styleLineColor, "#ffffff");
  draft.stylePaneBgColor = normalizeHexColor(draft.stylePaneBgColor, "#111827");
  draft.styleLineOpacity = clamp(draft.styleLineOpacity, 0, 1);
  draft.stylePaneBgOpacity = clamp(draft.stylePaneBgOpacity, 0, 1);
  draft.styleUpperColor = normalizeHexColor(draft.styleUpperColor, "#ffffff");
  draft.styleLowerColor = normalizeHexColor(draft.styleLowerColor, "#ffffff");
  draft.styleUpColor = normalizeHexColor(draft.styleUpColor, "#00c176");
  draft.styleDownColor = normalizeHexColor(draft.styleDownColor, "#ff4d4f");
  draft.styleKColor = normalizeHexColor(draft.styleKColor, "#00c176");
  draft.styleDColor = normalizeHexColor(draft.styleDColor, "#ffffff");
  draft.styleMacdColor = normalizeHexColor(draft.styleMacdColor, "#ffffff");
  draft.styleSignalColor = normalizeHexColor(draft.styleSignalColor, "#9ca3af");
  draft.styleHistUpColor = normalizeHexColor(draft.styleHistUpColor, "#00c176");
  draft.styleHistDownColor = normalizeHexColor(draft.styleHistDownColor, "#ff4d4f");

  if (typeId === "psar") {
    draft.psarDotColor = normalizeHexColor(draft.psarDotColor ?? "#3b82f6", "#3b82f6");
    draft.psarDotOpacity = clamp(draft.psarDotOpacity ?? 1, 0, 1);
    draft.psarDotSize = clamp(draft.psarDotSize ?? 3, 2, 5);
    draft.psarTraceEnabled = draft.psarTraceEnabled !== false;
    draft.psarPrecision = safeStr(draft.psarPrecision || "default") || "default";
    draft.styleLineWidth = 1;
  }

  return { draft, def };
}

const PALETTE = [
  "#ffffff", "#d1d5db", "#9ca3af", "#6b7280", "#374151", "#111827",
  "#00c176", "#22c55e", "#16a34a", "#059669", "#10b981", "#34d399",
  "#ff4d4f", "#ef4444", "#dc2626", "#f97316", "#fb923c", "#f59e0b",
  "#3b82f6", "#60a5fa", "#2563eb", "#1d4ed8", "#0ea5e9", "#38bdf8",
  "#a855f7", "#9333ea", "#7c3aed", "#ec4899", "#f472b6", "#fb7185",
  "#06b6d4", "#14b8a6", "#84cc16", "#eab308", "#fde047", "#a3e635",
];

function getPopoverPosition(anchorEl, popoverEl) {
  const margin = 10;
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  const ar = anchorEl.getBoundingClientRect();
  const pr = popoverEl.getBoundingClientRect();
  let left = ar.right - pr.width;
  let top = ar.bottom + 8;
  left = Math.max(margin, Math.min(left, vw - pr.width - margin));
  if (top + pr.height + margin > vh) {
    const topAbove = ar.top - pr.height - 8;
    if (topAbove >= margin) top = topAbove;
    else top = Math.max(margin, vh - pr.height - margin);
  }
  return { left, top };
}

function Popover({ open, anchorEl, onClose, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const a = anchorEl;
      const p = ref.current;
      if (p && p.contains(e.target)) return;
      if (a && a.contains(e.target)) return;
      SoundManager.uiClick();
      onClose?.();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, anchorEl, onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const a = anchorEl;
    const p = ref.current;
    if (!a || !p) return;
    const update = () => {
      const next = getPopoverPosition(a, p);
      setPos(next);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorEl]);

  if (!open) return null;
  const node = (
    <div ref={ref} className={styles.popover} style={{ left: `${pos.left}px`, top: `${pos.top}px` }}>
      {children}
    </div>
  );
  return createPortal(node, document.body);
}

function ColorPickerOnBroker({ opacity, width, lineStyle, showWidthStyle = true, onChange, onClose }) {
  const { t } = useTranslation("indicatorSettingsModal");
  const [localOpacity, setLocalOpacity] = useState(clamp(opacity, 0, 1));

  useEffect(() => setLocalOpacity(clamp(opacity, 0, 1)), [opacity]);

  const setOpacityPct = (pct) => {
    const p = clamp(pct, 0, 100);
    const o = p / 100;
    setLocalOpacity(o);
    onChange?.({ opacity: o });
  };

  return (
    <div className={styles.picker}>
      <div className={styles.paletteGrid}>
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={styles.colorCell}
            onClick={() => {
              SoundManager.uiClick();
              onChange?.({ color: c });
            }}
            title={c}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className={styles.pickerDivider} />
      <div className={styles.pickerRow}>
        <div className={styles.pickerLabel}>{t("picker.opacity")}</div>
        <div className={styles.sliderWrap}>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(localOpacity * 100)}
            onChange={(e) => setOpacityPct(Number(e.target.value))}
            onMouseUp={() => SoundManager.uiClick()}
            onTouchEnd={() => SoundManager.uiClick()}
          />
          <div className={styles.pct}>{Math.round(localOpacity * 100)}%</div>
        </div>
      </div>
      {showWidthStyle && (
        <>
          <div className={styles.pickerRow}>
            <div className={styles.pickerLabel}>{t("picker.width")}</div>
            <div className={styles.widthButtons}>
              {[1, 2, 3, 4].map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`${styles.widthBtn} ${Number(width) === w ? styles.widthBtnActive : ""}`}
                  onClick={() => {
                    SoundManager.uiClick();
                    onChange?.({ width: clamp(w, 1, 6) });
                  }}
                  title={`${w}`}
                >
                  <span className={styles.widthLine} style={{ height: w }} />
                </button>
              ))}
            </div>
          </div>
          <div className={styles.pickerRow}>
            <div className={styles.pickerLabel}>{t("picker.style")}</div>
            <div className={styles.styleButtons}>
              {[
                { v: "solid", label: t("picker.solid") },
                { v: "dashed", label: t("picker.dashed") },
                { v: "dotted", label: t("picker.dotted") },
              ].map((it) => (
                <button
                  key={it.v}
                  type="button"
                  className={`${styles.styleBtn} ${lineStyle === it.v ? styles.styleBtnActive : ""}`}
                  onClick={() => {
                    if (lineStyle !== it.v) SoundManager.uiClick();
                    onChange?.({ lineStyle: it.v });
                  }}
                  title={it.v}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className={styles.pickerFooter}>
        <button
          type="button"
          className={styles.pickerClose}
          onClick={() => {
            SoundManager.uiClick();
            onClose?.();
          }}
        >
          {t("actions.close")}
        </button>
      </div>
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>{label}</div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

function NumberField({ value, onChange, min, max, step }) {
  return (
    <input
      className={styles.input}
      type="number"
      value={Number.isFinite(Number(value)) ? value : ""}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function SelectField({ value, onChange, options }) {
  return (
    <select
      className={styles.select}
      value={value ?? ""}
      onChange={(e) => {
        SoundManager.uiClick();
        onChange(e.target.value);
      }}
    >
      {(options || []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function CheckboxField({ checked, onChange, label }) {
  return (
    <label className={styles.checkbox}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => {
          SoundManager.uiClick();
          onChange(e.target.checked);
        }}
      />
      <span>{label}</span>
    </label>
  );
}

export default function IndicatorSettingsModal({ instance, onClose, onCancel, onApply, onLiveChange }) {
  const { t: tModal } = useTranslation("indicatorSettingsModal");
  const { t: tInd, i18n } = useTranslation("indicators");

  const ref = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const pickerAnchorRef = useRef(null);
  const bgAnchorRef = useRef(null);
  const [{ draft, def }, setState] = useState(() => buildDefaultDraft(instance));
  const [tab, setTab] = useState(TAB_VALUES);
  const [defaultsMenuOpen, setDefaultsMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null);
  const [pickerAnchorEl, setPickerAnchorEl] = useState(null);

  const typeId = useMemo(() => safeStr(instance?.typeId).toLowerCase(), [instance?.typeId]);
  const isPsar = typeId === "psar";
  const initialSettingsRef = useRef({});
  const suppressLiveRef = useRef(false);
  const latestDraftRef = useRef(draft);

  const title = useMemo(() => {
    const n = safeStr(instance?.name).trim();
    if (n) return n;
    const translatedName = tInd(`indicators.${typeId}.name`);
    if (translatedName && translatedName !== `indicators.${typeId}.name`) return translatedName;
    return safeStr(def?.name).trim() || "Indicador";
  }, [instance?.name, def?.name, typeId, tInd]);

  useEffect(() => {
    initialSettingsRef.current =
      instance?.settings && typeof instance.settings === "object" ? { ...instance.settings } : {};
    suppressLiveRef.current = true;
    const built = buildDefaultDraft(instance);
    latestDraftRef.current = built.draft;
    setState(built);
    setTab(TAB_VALUES);
    setPickerOpen(false);
    setPickerTarget(null);
    setPickerAnchorEl(null);
    setDefaultsMenuOpen(false);
    const t = setTimeout(() => {
      suppressLiveRef.current = false;
    }, 0);
    return () => clearTimeout(t);
  }, [instance?.instanceId]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const r = el.getBoundingClientRect();
    const left = Math.max(12, Math.round((vw - r.width) / 2));
    const top = Math.max(12, Math.round((vh - r.height) / 2));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [instance?.instanceId]);

  useEffect(() => {
    const onMove = (e) => {
      const st = dragRef.current;
      if (!st.active) return;
      const clientX = e.touches?.[0]?.clientX ?? e.clientX;
      const clientY = e.touches?.[0]?.clientY ?? e.clientY;
      const dx = clientX - st.startX;
      const dy = clientY - st.startY;
      const el = ref.current;
      if (!el) return;
      el.style.left = `${st.startLeft + dx}px`;
      el.style.top = `${st.startTop + dy}px`;
    };
    const onUp = () => {
      dragRef.current.active = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  const startDrag = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    dragRef.current = {
      active: true,
      startX: clientX,
      startY: clientY,
      startLeft: r.left,
      startTop: r.top,
    };
    e.preventDefault?.();
  };

  const setDraft = (patch) => {
    const base = latestDraftRef.current && typeof latestDraftRef.current === "object" ? latestDraftRef.current : {};
    const nextDraft = { ...base, ...(patch || {}) };
    latestDraftRef.current = nextDraft;
    setState((prev) => ({ ...prev, draft: nextDraft }));
    if (!suppressLiveRef.current && typeof onLiveChange === "function") {
      try {
        onLiveChange({ ...nextDraft });
      } catch {}
    }
  };

  const openPickerFor = (anchorRef, target) => {
    SoundManager.uiClick();
    const el = anchorRef?.current || null;
    setPickerAnchorEl(el);
    setPickerTarget(target);
    setPickerOpen(true);
    setDefaultsMenuOpen(false);
  };

  const closePicker = () => {
    SoundManager.uiClick();
    setPickerOpen(false);
    setPickerTarget(null);
    setPickerAnchorEl(null);
  };

  // ✅ HELPER: Traduzir labels de parâmetros
  const translateParamLabel = (paramKey, fallback) => {
    const translated = tInd(`indicators.params.${paramKey}`);
    return translated !== `indicators.params.${paramKey}` ? translated : fallback;
  };

  // ✅ HELPER: Traduzir opções de source
  const translateSourceOption = (value, fallback) => {
    const translated = tInd(`indicators.source.${value}`);
    return translated !== `indicators.source.${value}` ? translated : fallback;
  };

  const renderValuesTab = () => {
    if (isPsar) {
      const params = Array.isArray(def?.params) ? def.params : [];
      const getP = (key) => params.find((p) => p.key === key) || null;
      const pStart = getP("start");
      const pInc = getP("increment");
      const pMax = getP("max");
      const precisionOptions = [
        { value: "default", label: tInd("indicators.precision.default") || tModal("psar.precision_default") || "Padrão" },
        { value: "0", label: "0" },
        { value: "1", label: "0,1" },
        { value: "2", label: "0,01" },
        { value: "3", label: "0,001" },
        { value: "4", label: "0,0001" },
      ];
      return (
        <div className={styles.section}>
          <FieldRow label={translateParamLabel("start", pStart?.label || "Início")}>
            <NumberField
              value={draft.start}
              min={pStart?.min}
              max={pStart?.max}
              step={pStart?.step}
              onChange={(v) => setDraft({ start: v === "" ? "" : Number(v) })}
            />
          </FieldRow>
          <FieldRow label={translateParamLabel("increment", pInc?.label || "Incremento")}>
            <NumberField
              value={draft.increment}
              min={pInc?.min}
              max={pInc?.max}
              step={pInc?.step}
              onChange={(v) => setDraft({ increment: v === "" ? "" : Number(v) })}
            />
          </FieldRow>
          <FieldRow label={translateParamLabel("max", pMax?.label || "Máx")}>
            <NumberField
              value={draft.max}
              min={pMax?.min}
              max={pMax?.max}
              step={pMax?.step}
              onChange={(v) => setDraft({ max: v === "" ? "" : Number(v) })}
            />
          </FieldRow>
          <FieldRow label={translateParamLabel("precision", tModal("psar.precision") || "Precisão")}>
            <SelectField
              value={safeStr(draft.psarPrecision || "default") || "default"}
              options={precisionOptions}
              onChange={(v) => setDraft({ psarPrecision: v })}
            />
          </FieldRow>
        </div>
      );
    }

    const params = Array.isArray(def?.params) ? def.params : [];
    if (!params.length) return <div className={styles.empty}>{tModal("labels.no_params")}</div>;

    return (
      <div className={styles.section}>
        {params.map((p) => {
          const key = p.key;
          // ✅ Label traduzido do parâmetro
          const label = translateParamLabel(key, p.label || key);

          if (p.type === "number") {
            return (
              <FieldRow key={key} label={label}>
                <NumberField
                  value={draft[key]}
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  onChange={(v) => setDraft({ [key]: v === "" ? "" : Number(v) })}
                />
              </FieldRow>
            );
          }

          if (p.type === "select") {
            return (
              <FieldRow key={key} label={label}>
                <SelectField
                  value={draft[key] ?? p.default ?? ""}
                  options={(p.options || []).map((opt) => ({
                    ...opt,
                    // ✅ Label da opção traduzido
                    label: key === "source" ? translateSourceOption(opt.value, opt.label) : opt.label,
                  }))}
                  onChange={(v) => setDraft({ [key]: v })}
                />
              </FieldRow>
            );
          }

          if (p.type === "boolean") {
            return (
              <div key={key} className={styles.rowFull}>
                <CheckboxField checked={!!draft[key]} label={label} onChange={(v) => setDraft({ [key]: v })} />
              </div>
            );
          }

          return null;
        })}
      </div>
    );
  };

  const renderStyleTab = () => {
    if (isPsar) {
      const dotColor = normalizeHexColor(draft.psarDotColor, "#3b82f6");
      const dotOpacity = clamp(draft.psarDotOpacity ?? 1, 0, 1);
      const traceEnabled = draft.psarTraceEnabled !== false;

      return (
        <div className={styles.section}>
          <div className={styles.block}>
            <div className={styles.blockTitle}>{tModal("labels.trace")}</div>
            <div className={styles.rowFull}>
              <CheckboxField
                checked={traceEnabled}
                label={tModal("labels.trace")}
                onChange={(v) => setDraft({ psarTraceEnabled: v })}
              />
            </div>
            <div className={styles.compactRow}>
              <div className={styles.compactLabel}>{tModal("labels.color")}</div>
              <div className={styles.compactRight}>
                <button
                  type="button"
                  className={styles.swatchBtn}
                  disabled={!traceEnabled}
                  onClick={() =>
                    openPickerFor(pickerAnchorRef, {
                      colorKey: "psarDotColor",
                      opacityKey: "psarDotOpacity",
                      widthKey: null,
                      styleKey: null,
                      showWidthStyle: false,
                    })
                  }
                  ref={pickerAnchorRef}
                  title={tModal("labels.color")}
                >
                  <span className={styles.swatch} style={{ background: dotColor, opacity: traceEnabled ? 1 : 0.5 }} />
                  <span className={styles.swatchCode}>{dotColor}</span>
                </button>
              </div>
            </div>
            <Popover open={pickerOpen} anchorEl={pickerAnchorEl} onClose={closePicker}>
              <ColorPickerOnBroker
                opacity={dotOpacity}
                width={1}
                lineStyle={"solid"}
                showWidthStyle={false}
                onChange={(chg) => {
                  if (!pickerTarget) return;
                  const next = {};
                  if (chg.color && pickerTarget.colorKey)
                    next[pickerTarget.colorKey] = normalizeHexColor(chg.color, "#3b82f6");
                  if (typeof chg.opacity === "number" && pickerTarget.opacityKey)
                    next[pickerTarget.opacityKey] = clamp(chg.opacity, 0, 1);
                  setDraft(next);
                }}
                onClose={closePicker}
              />
            </Popover>
          </div>
        </div>
      );
    }

    const isTriple = typeId === "bollinger" || typeId === "donchian" || typeId === "keltner" || typeId === "envelopes";
    const isSuperTrend = typeId === "supertrend";
    const isStoch = typeId === "stochastic";
    const isMacd = typeId === "macd";
    const showPaneBg = [
      "rsi",
      "macd",
      "adx",
      "atr",
      "cci",
      "williamsr",
      "momentum",
      "roc",
      "volume",
      "stochastic",
    ].includes(typeId);

    const lineColor = normalizeHexColor(draft.styleLineColor, "#ffffff");
    const lineOpacity = clamp(draft.styleLineOpacity, 0, 1);
    const lineWidth = clamp(draft.styleLineWidth, 1, 6);
    const lineStyle = safeStr(draft.styleLineStyle || "solid");
    const bgEnabled = !!draft.stylePaneBgEnabled;
    const bgColor = normalizeHexColor(draft.stylePaneBgColor, "#111827");
    const bgOpacity = clamp(draft.stylePaneBgOpacity, 0, 1);

    const renderColorRow = (label, anchorRef, keys, previewHex, disabled = false, showWidthStyle = false) => {
      return (
        <div className={styles.compactRow}>
          <div className={styles.compactLabel}>{label}</div>
          <div className={styles.compactRight}>
            <button
              type="button"
              className={styles.swatchBtn}
              disabled={disabled}
              onClick={() => openPickerFor(anchorRef, { ...keys, showWidthStyle })}
              ref={anchorRef}
              title={tModal("labels.color")}
            >
              <span className={styles.swatch} style={{ background: previewHex, opacity: disabled ? 0.5 : 1 }} />
              <span className={styles.swatchCode}>{previewHex}</span>
            </button>
          </div>
        </div>
      );
    };

    return (
      <div className={styles.section}>
        {!isTriple && !isSuperTrend && !isStoch && !isMacd && (
          <div className={styles.block}>
            <div className={styles.blockTitle}>{tModal("labels.trace")}</div>
            {renderColorRow(
              tModal("labels.color"),
              pickerAnchorRef,
              {
                colorKey: "styleLineColor",
                opacityKey: "styleLineOpacity",
                widthKey: "styleLineWidth",
                styleKey: "styleLineStyle",
              },
              lineColor,
              false,
              true
            )}
            <Popover open={pickerOpen} anchorEl={pickerAnchorEl} onClose={closePicker}>
              <ColorPickerOnBroker
                opacity={
                  pickerTarget?.opacityKey ? clamp(draft[pickerTarget.opacityKey], 0, 1) : lineOpacity
                }
                width={pickerTarget?.widthKey ? clamp(draft[pickerTarget.widthKey], 1, 6) : lineWidth}
                lineStyle={pickerTarget?.styleKey ? safeStr(draft[pickerTarget.styleKey] || "solid") : lineStyle}
                showWidthStyle={pickerTarget?.showWidthStyle !== false}
                onChange={(chg) => {
                  if (!pickerTarget) return;
                  const next = {};
                  if (chg.color && pickerTarget.colorKey) next[pickerTarget.colorKey] = normalizeHexColor(chg.color);
                  if (typeof chg.opacity === "number" && pickerTarget.opacityKey)
                    next[pickerTarget.opacityKey] = clamp(chg.opacity, 0, 1);
                  if (typeof chg.width === "number" && pickerTarget.widthKey)
                    next[pickerTarget.widthKey] = clamp(chg.width, 1, 6);
                  if (chg.lineStyle && pickerTarget.styleKey) next[pickerTarget.styleKey] = chg.lineStyle;
                  setDraft(next);
                }}
                onClose={closePicker}
              />
            </Popover>
          </div>
        )}

        {isTriple && (
          <div className={styles.block}>
            <div className={styles.blockTitle}>{tModal("triple.lines")}</div>
            <div className={styles.rowFull}>
              <CheckboxField
                checked={draft.visibilityUpper !== false}
                label={tModal("triple.upper")}
                onChange={(v) => setDraft({ visibilityUpper: v })}
              />
            </div>
            {renderColorRow(
              tModal("triple.color_upper"),
              pickerAnchorRef,
              { colorKey: "styleUpperColor", opacityKey: "styleUpperOpacity", widthKey: null, styleKey: null },
              normalizeHexColor(draft.styleUpperColor, "#ffffff"),
              draft.visibilityUpper === false,
              false
            )}
            <div className={styles.rowFull}>
              <CheckboxField
                checked={draft.visibilityMiddle !== false}
                label={tModal("triple.middle")}
                onChange={(v) => setDraft({ visibilityMiddle: v })}
              />
            </div>
            {renderColorRow(
              tModal("triple.color_middle"),
              bgAnchorRef,
              {
                colorKey: "styleLineColor",
                opacityKey: "styleLineOpacity",
                widthKey: "styleLineWidth",
                styleKey: "styleLineStyle",
              },
              lineColor,
              draft.visibilityMiddle === false,
              true
            )}
            <div className={styles.rowFull}>
              <CheckboxField
                checked={draft.visibilityLower !== false}
                label={tModal("triple.lower")}
                onChange={(v) => setDraft({ visibilityLower: v })}
              />
            </div>
            {renderColorRow(
              tModal("triple.color_lower"),
              pickerAnchorRef,
              { colorKey: "styleLowerColor", opacityKey: "styleLowerOpacity", widthKey: null, styleKey: null },
              normalizeHexColor(draft.styleLowerColor, "#ffffff"),
              draft.visibilityLower === false,
              false
            )}
            <Popover open={pickerOpen} anchorEl={pickerAnchorEl} onClose={closePicker}>
              <ColorPickerOnBroker
                opacity={
                  pickerTarget?.opacityKey ? clamp(draft[pickerTarget.opacityKey], 0, 1) : lineOpacity
                }
                width={pickerTarget?.widthKey ? clamp(draft[pickerTarget.widthKey], 1, 6) : lineWidth}
                lineStyle={pickerTarget?.styleKey ? safeStr(draft[pickerTarget.styleKey] || "solid") : lineStyle}
                showWidthStyle={pickerTarget?.showWidthStyle !== false}
                onChange={(chg) => {
                  if (!pickerTarget) return;
                  const next = {};
                  if (chg.color && pickerTarget.colorKey) next[pickerTarget.colorKey] = normalizeHexColor(chg.color);
                  if (typeof chg.opacity === "number" && pickerTarget.opacityKey)
                    next[pickerTarget.opacityKey] = clamp(chg.opacity, 0, 1);
                  if (typeof chg.width === "number" && pickerTarget.widthKey)
                    next[pickerTarget.widthKey] = clamp(chg.width, 1, 6);
                  if (chg.lineStyle && pickerTarget.styleKey) next[pickerTarget.styleKey] = chg.lineStyle;
                  setDraft(next);
                }}
                onClose={closePicker}
              />
            </Popover>
          </div>
        )}

        {isSuperTrend && (
          <div className={styles.block}>
            <div className={styles.blockTitle}>{tModal("labels.trace")}</div>
            <div className={styles.rowFull}>
              <CheckboxField
                checked={draft.visibilityUp !== false}
                label={tModal("supertrend.up")}
                onChange={(v) => setDraft({ visibilityUp: v })}
              />
            </div>
            <div className={styles.rowFull}>
              <CheckboxField
                checked={draft.visibilityDown !== false}
                label={tModal("supertrend.down")}
                onChange={(v) => setDraft({ visibilityDown: v })}
              />
            </div>
            {renderColorRow(
              tModal("supertrend.color_up"),
              pickerAnchorRef,
              {
                colorKey: "styleUpColor",
                opacityKey: "styleUpOpacity",
                widthKey: "styleLineWidth",
                styleKey: "styleLineStyle",
              },
              normalizeHexColor(draft.styleUpColor, "#00c176"),
              draft.visibilityUp === false,
              true
            )}
            {renderColorRow(
              tModal("supertrend.color_down"),
              bgAnchorRef,
              {
                colorKey: "styleDownColor",
                opacityKey: "styleDownOpacity",
                widthKey: "styleLineWidth",
                styleKey: "styleLineStyle",
              },
              normalizeHexColor(draft.styleDownColor, "#ff4d4f"),
              draft.visibilityDown === false,
              true
            )}
            <Popover open={pickerOpen} anchorEl={pickerAnchorEl} onClose={closePicker}>
              <ColorPickerOnBroker
                opacity={
                  pickerTarget?.opacityKey ? clamp(draft[pickerTarget.opacityKey], 0, 1) : lineOpacity
                }
                width={pickerTarget?.widthKey ? clamp(draft[pickerTarget.widthKey], 1, 6) : lineWidth}
                lineStyle={pickerTarget?.styleKey ? safeStr(draft[pickerTarget.styleKey] || "solid") : lineStyle}
                showWidthStyle={pickerTarget?.showWidthStyle !== false}
                onChange={(chg) => {
                  if (!pickerTarget) return;
                  const next = {};
                  if (chg.color && pickerTarget.colorKey) next[pickerTarget.colorKey] = normalizeHexColor(chg.color);
                  if (typeof chg.opacity === "number" && pickerTarget.opacityKey)
                    next[pickerTarget.opacityKey] = clamp(chg.opacity, 0, 1);
                  if (typeof chg.width === "number" && pickerTarget.widthKey)
                    next[pickerTarget.widthKey] = clamp(chg.width, 1, 6);
                  if (chg.lineStyle && pickerTarget.styleKey) next[pickerTarget.styleKey] = chg.lineStyle;
                  setDraft(next);
                }}
                onClose={closePicker}
              />
            </Popover>
          </div>
        )}

        {isStoch && (
          <div className={styles.block}>
            <div className={styles.blockTitle}>{tModal("labels.trace")}</div>
            <div className={styles.rowFull}>
              <CheckboxField
                checked={draft.visibilityK !== false}
                label={tModal("stoch.k")}
                onChange={(v) => setDraft({ visibilityK: v })}
              />
            </div>
            {renderColorRow(
              tModal("stoch.color_k"),
              pickerAnchorRef,
              { colorKey: "styleKColor", opacityKey: "styleKOpacity", widthKey: null, styleKey: null },
              normalizeHexColor(draft.styleKColor, "#00c176"),
              draft.visibilityK === false,
              false
            )}
            <div className={styles.rowFull}>
              <CheckboxField
                checked={draft.visibilityD !== false}
                label={tModal("stoch.d")}
                onChange={(v) => setDraft({ visibilityD: v })}
              />
            </div>
            {renderColorRow(
              tModal("stoch.color_d"),
              bgAnchorRef,
              { colorKey: "styleDColor", opacityKey: "styleDOpacity", widthKey: null, styleKey: null },
              normalizeHexColor(draft.styleDColor, "#ffffff"),
              draft.visibilityD === false,
              false
            )}
            <Popover open={pickerOpen} anchorEl={pickerAnchorEl} onClose={closePicker}>
              <ColorPickerOnBroker
                opacity={pickerTarget?.opacityKey ? clamp(draft[pickerTarget.opacityKey], 0, 1) : 0.85}
                width={1}
                lineStyle={"solid"}
                showWidthStyle={false}
                onChange={(chg) => {
                  if (!pickerTarget) return;
                  const next = {};
                  if (chg.color && pickerTarget.colorKey) next[pickerTarget.colorKey] = normalizeHexColor(chg.color);
                  if (typeof chg.opacity === "number" && pickerTarget.opacityKey)
                    next[pickerTarget.opacityKey] = clamp(chg.opacity, 0, 1);
                  setDraft(next);
                }}
                onClose={closePicker}
              />
            </Popover>
          </div>
        )}

        {isMacd && (
          <div className={styles.block}>
            <div className={styles.blockTitle}>{tModal("labels.trace")}</div>
            <div className={styles.rowFull}>
              <CheckboxField
                checked={draft.visibilityMacd !== false}
                label={tModal("macd.macd")}
                onChange={(v) => setDraft({ visibilityMacd: v })}
              />
            </div>
            {renderColorRow(
              tModal("macd.color_macd"),
              pickerAnchorRef,
              { colorKey: "styleMacdColor", opacityKey: "styleMacdOpacity", widthKey: null, styleKey: null },
              normalizeHexColor(draft.styleMacdColor, "#ffffff"),
              draft.visibilityMacd === false,
              false
            )}
            <div className={styles.rowFull}>
              <CheckboxField
                checked={draft.visibilitySignal !== false}
                label={tModal("macd.signal")}
                onChange={(v) => setDraft({ visibilitySignal: v })}
              />
            </div>
            {renderColorRow(
              tModal("macd.color_signal"),
              bgAnchorRef,
              { colorKey: "styleSignalColor", opacityKey: "styleSignalOpacity", widthKey: null, styleKey: null },
              normalizeHexColor(draft.styleSignalColor, "#9ca3af"),
              draft.visibilitySignal === false,
              false
            )}
            <div className={styles.rowFull}>
              <CheckboxField
                checked={draft.visibilityHist !== false}
                label={tModal("macd.histogram")}
                onChange={(v) => setDraft({ visibilityHist: v })}
              />
            </div>
            {renderColorRow(
              tModal("macd.hist_up"),
              pickerAnchorRef,
              { colorKey: "styleHistUpColor", opacityKey: "styleHistOpacity", widthKey: null, styleKey: null },
              normalizeHexColor(draft.styleHistUpColor, "#00c176"),
              draft.visibilityHist === false,
              false
            )}
            {renderColorRow(
              tModal("macd.hist_down"),
              bgAnchorRef,
              { colorKey: "styleHistDownColor", opacityKey: "styleHistOpacity", widthKey: null, styleKey: null },
              normalizeHexColor(draft.styleHistDownColor, "#ff4d4f"),
              draft.visibilityHist === false,
              false
            )}
            <Popover open={pickerOpen} anchorEl={pickerAnchorEl} onClose={closePicker}>
              <ColorPickerOnBroker
                opacity={pickerTarget?.opacityKey ? clamp(draft[pickerTarget.opacityKey], 0, 1) : 0.55}
                width={1}
                lineStyle={"solid"}
                showWidthStyle={false}
                onChange={(chg) => {
                  if (!pickerTarget) return;
                  const next = {};
                  if (chg.color && pickerTarget.colorKey) next[pickerTarget.colorKey] = normalizeHexColor(chg.color);
                  if (typeof chg.opacity === "number" && pickerTarget.opacityKey)
                    next[pickerTarget.opacityKey] = clamp(chg.opacity, 0, 1);
                  setDraft(next);
                }}
                onClose={closePicker}
              />
            </Popover>
          </div>
        )}

        {showPaneBg && (
          <div className={styles.block}>
            <div className={styles.blockTitle}>{tModal("pane_bg.title")}</div>
            <div className={styles.rowFull}>
              <CheckboxField
                checked={bgEnabled}
                label={tModal("labels.activate")}
                onChange={(v) => setDraft({ stylePaneBgEnabled: v })}
              />
            </div>
            <div className={styles.compactRow}>
              <div className={styles.compactLabel}>{tModal("labels.color")}</div>
              <div className={styles.compactRight}>
                <button
                  type="button"
                  className={styles.swatchBtn}
                  disabled={!bgEnabled}
                  ref={bgAnchorRef}
                  onClick={() =>
                    openPickerFor(bgAnchorRef, {
                      colorKey: "stylePaneBgColor",
                      opacityKey: "stylePaneBgOpacity",
                      widthKey: null,
                      styleKey: null,
                      showWidthStyle: false,
                    })
                  }
                >
                  <span className={styles.swatch} style={{ background: bgColor, opacity: bgEnabled ? 1 : 0.5 }} />
                  <span className={styles.swatchCode}>{bgColor}</span>
                </button>
              </div>
            </div>
            <div className={styles.pickerRowInline}>
              <div className={styles.pickerLabel}>{tModal("picker.opacity")}</div>
              <div className={styles.sliderWrap}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(bgOpacity * 100)}
                  onChange={(e) => setDraft({ stylePaneBgOpacity: clamp(Number(e.target.value) / 100, 0, 1) })}
                  onMouseUp={() => SoundManager.uiClick()}
                  onTouchEnd={() => SoundManager.uiClick()}
                  disabled={!bgEnabled}
                />
                <div className={styles.pct}>{Math.round(bgOpacity * 100)}%</div>
              </div>
            </div>
            <Popover open={pickerOpen} anchorEl={pickerAnchorEl} onClose={closePicker}>
              <ColorPickerOnBroker
                opacity={pickerTarget?.opacityKey ? clamp(draft[pickerTarget.opacityKey], 0, 1) : bgOpacity}
                width={1}
                lineStyle={"solid"}
                showWidthStyle={false}
                onChange={(chg) => {
                  if (!pickerTarget) return;
                  const next = {};
                  if (chg.color && pickerTarget.colorKey) next[pickerTarget.colorKey] = normalizeHexColor(chg.color);
                  if (typeof chg.opacity === "number" && pickerTarget.opacityKey)
                    next[pickerTarget.opacityKey] = clamp(chg.opacity, 0, 1);
                  setDraft(next);
                }}
                onClose={closePicker}
              />
            </Popover>
          </div>
        )}
      </div>
    );
  };

  const renderVisibilityTab = () => {
    return (
      <div className={styles.section}>
        <div className={styles.rowFull}>
          <CheckboxField
            checked={!!draft.visibilityPriceScaleLabels}
            label={tModal("labels.price_scale_labels")}
            onChange={(v) => setDraft({ visibilityPriceScaleLabels: v })}
          />
        </div>
        <div className={styles.rowFull}>
          <CheckboxField
            checked={!!draft.visibilityStatusValues}
            label={tModal("labels.status_values")}
            onChange={(v) => setDraft({ visibilityStatusValues: v })}
          />
        </div>
      </div>
    );
  };

  const onResetFactory = () => {
    SoundManager.uiClick();
    const factory = buildFactoryDefaults(typeId, { ...instance, settings: {} });
    setDraft({ ...factory });
    setDefaultsMenuOpen(false);
  };

  const onSaveAsDefault = () => {
    SoundManager.uiClick();
    const copy = { ...latestDraftRef.current };
    saveDefaults(typeId, copy);
    setDefaultsMenuOpen(false);
  };

  const onOk = () => {
    SoundManager.uiClick();
    onApply?.({ ...latestDraftRef.current });
  };

  const doRollbackAndClose = (fnClose) => {
    const snap = initialSettingsRef.current || {};
    if (typeof onLiveChange === "function") {
      try {
        onLiveChange({ ...snap });
      } catch {}
    }
    fnClose?.();
  };

  const onCancelClick = () => {
    SoundManager.uiClick();
    doRollbackAndClose(onCancel);
  };

  const tabs = useMemo(() => {
    if (isPsar) return [TAB_VALUES, TAB_STYLE];
    return [TAB_VALUES, TAB_STYLE, TAB_VISIBILITY];
  }, [isPsar]);

  useEffect(() => {
    if (!tabs.includes(tab)) setTab(TAB_VALUES);
  }, [tabs, tab]);

  return (
    <div
      className={styles.backdrop}
      onMouseDown={() => {
        SoundManager.uiClick();
        doRollbackAndClose(onClose);
      }}
    >
      <div ref={ref} className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header} onMouseDown={startDrag} onTouchStart={startDrag}>
          <div className={styles.title}>{title}</div>
          <button
            className={styles.x}
            onClick={() => {
              SoundManager.uiClick();
              doRollbackAndClose(onClose);
            }}
            type="button"
          >
            ×
          </button>
        </div>
        <div className={styles.tabs}>
          {tabs.includes(TAB_VALUES) && (
            <button
              type="button"
              className={`${styles.tab} ${tab === TAB_VALUES ? styles.active : ""}`}
              onClick={() => {
                if (tab !== TAB_VALUES) SoundManager.uiClick();
                setTab(TAB_VALUES);
              }}
            >
              {tModal("tabs.values")}
            </button>
          )}
          {tabs.includes(TAB_STYLE) && (
            <button
              type="button"
              className={`${styles.tab} ${tab === TAB_STYLE ? styles.active : ""}`}
              onClick={() => {
                if (tab !== TAB_STYLE) SoundManager.uiClick();
                setTab(TAB_STYLE);
              }}
            >
              {tModal("tabs.style")}
            </button>
          )}
          {tabs.includes(TAB_VISIBILITY) && (
            <button
              type="button"
              className={`${styles.tab} ${tab === TAB_VISIBILITY ? styles.active : ""}`}
              onClick={() => {
                if (tab !== TAB_VISIBILITY) SoundManager.uiClick();
                setTab(TAB_VISIBILITY);
              }}
            >
              {tModal("tabs.visibility")}
            </button>
          )}
        </div>
        <div className={styles.body}>
          {tab === TAB_VALUES && renderValuesTab()}
          {tab === TAB_STYLE && renderStyleTab()}
          {tab === TAB_VISIBILITY && !isPsar && renderVisibilityTab()}
        </div>
        <div className={styles.footer}>
          <div className={styles.defaultsWrap}>
            <button
              className={styles.defaults}
              type="button"
              onClick={() => {
                SoundManager.uiClick();
                setDefaultsMenuOpen((v) => !v);
                closePicker();
              }}
            >
              {tModal("actions.defaults")} ▾
            </button>
            {defaultsMenuOpen && (
              <div className={styles.defaultsMenu}>
                <button type="button" className={styles.defaultsItem} onClick={onResetFactory}>
                  {tModal("actions.reset")}
                </button>
                <button type="button" className={styles.defaultsItem} onClick={onSaveAsDefault}>
                  {tModal("actions.save_default")}
                </button>
              </div>
            )}
          </div>
          <div className={styles.footerRight}>
            <button className={styles.cancel} type="button" onClick={onCancelClick}>
              {tModal("actions.cancel")}
            </button>
            <button className={styles.ok} type="button" onClick={onOk}>
              {tModal("actions.ok")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}