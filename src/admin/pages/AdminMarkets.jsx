import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/services/supabaseClient";
import { adminUpsertMarkets } from "../services/markets.api";

const DEFAULT_SYMBOLS = [
  "EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD",
  "EURJPY","GBPJPY","AUDJPY","CADJPY","CADCHF","CHFJPY",
  "EURAUD","EURGBP","EURNZD","AUDCAD","AUDCHF","AUDNZD",
  "EURCAD","EURCHF","GBPCAD","GBPCHF","GBPAUD",
  "NZDCAD","NZDCHF",
  "BTCUSD","ETHUSD","ADAUSD","SOLUSD","XRPUSD","BNBUSD","LTCUSD",
  "XAUUSD","XAGUSD",
];

const WEEK_DAYS = [
  { id: 0, key: "sun", short: "D", label: "Domingo", bit: 1 },
  { id: 1, key: "mon", short: "S", label: "Segunda", bit: 2 },
  { id: 2, key: "tue", short: "T", label: "Terça", bit: 4 },
  { id: 3, key: "wed", short: "Q", label: "Quarta", bit: 8 },
  { id: 4, key: "thu", short: "Q", label: "Quinta", bit: 16 },
  { id: 5, key: "fri", short: "S", label: "Sexta", bit: 32 },
  { id: 6, key: "sat", short: "S", label: "Sábado", bit: 64 },
];

function normalizeSymbol(v) {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
}
function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(n, a, b) {
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}
function defaultDisplayName(symbol) {
  const s = normalizeSymbol(symbol);
  if (s.length === 6) return `${s.slice(0, 3)}/${s.slice(3)}`;
  return s;
}
function normalizeTimeHHMMSS(v) {
  const s = String(v || "").trim();
  if (!s) return null;

  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;

  return null;
}
function toHHMM(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (s.length >= 5) return s.slice(0, 5);
  return "";
}

// bitmask helpers (legado)
function hasDay(mask, bit) {
  return (Number(mask) & Number(bit)) !== 0;
}
function toggleDay(mask, bit) {
  const m = Number(mask) || 0;
  return hasDay(m, bit) ? (m & ~bit) : (m | bit);
}
function buildMaskFromWeekly(weekly) {
  let mask = 0;
  for (const d of WEEK_DAYS) {
    if (weekly?.[d.id]?.enabled) mask |= d.bit;
  }
  return mask;
}

// ========= weekly_schedule helpers =========

function makeEmptyDay(enabled = false, open = null, close = null) {
  return {
    enabled: Boolean(enabled),
    open_time: normalizeTimeHHMMSS(open),
    close_time: normalizeTimeHHMMSS(close),
  };
}

function sanitizeDaySchedule(v) {
  return {
    enabled: Boolean(v?.enabled),
    open_time: normalizeTimeHHMMSS(v?.open_time),
    close_time: normalizeTimeHHMMSS(v?.close_time),
  };
}

function buildWeeklyScheduleFromLegacy(base) {
  const open = normalizeTimeHHMMSS(base?.open_time);
  const close = normalizeTimeHHMMSS(base?.close_time);
  const mask = Number.isFinite(Number(base?.open_days)) ? Number(base?.open_days) : 127;

  const out = {};
  for (const d of WEEK_DAYS) {
    out[d.id] = makeEmptyDay(hasDay(mask, d.bit), open, close);
  }
  return out;
}

function sanitizeWeeklySchedule(v, fallbackBase) {
  const fallback = buildWeeklyScheduleFromLegacy(fallbackBase);

  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return fallback;
  }

  const out = {};
  for (const d of WEEK_DAYS) {
    const raw = v[d.id] ?? v[String(d.id)] ?? null;
    if (!raw || typeof raw !== "object") {
      out[d.id] = fallback[d.id];
      continue;
    }

    const day = sanitizeDaySchedule(raw);

    if (day.enabled) {
      if (!day.open_time) day.open_time = fallback[d.id]?.open_time ?? "09:00:00";
      if (!day.close_time) day.close_time = fallback[d.id]?.close_time ?? "18:00:00";
    }

    out[d.id] = day;
  }

  return out;
}

function buildLegacyFromWeekly(weekly) {
  let firstOpen = null;
  let firstClose = null;

  for (const d of WEEK_DAYS) {
    const row = weekly?.[d.id];
    if (row?.enabled) {
      firstOpen = row.open_time || "09:00:00";
      firstClose = row.close_time || "18:00:00";
      break;
    }
  }

  return {
    open_days: buildMaskFromWeekly(weekly),
    open_time: firstOpen,
    close_time: firstClose,
  };
}

function makeForexPreset() {
  const out = {};
  for (const d of WEEK_DAYS) {
    if (d.id >= 1 && d.id <= 5) {
      out[d.id] = makeEmptyDay(true, "00:00:00", "17:00:00");
    } else {
      out[d.id] = makeEmptyDay(false, null, null);
    }
  }
  return out;
}

function makeCryptoPreset() {
  return {
    0: makeEmptyDay(true,  "00:00:00", "21:00:00"), // domingo
    1: makeEmptyDay(true,  "17:00:00", "21:00:00"), // segunda
    2: makeEmptyDay(true,  "17:00:00", "21:00:00"), // terça
    3: makeEmptyDay(true,  "17:00:00", "21:00:00"), // quarta
    4: makeEmptyDay(true,  "17:00:00", "21:00:00"), // quinta
    5: makeEmptyDay(true,  "17:00:00", "23:59:00"), // sexta
    6: makeEmptyDay(true,  "00:00:00", "23:59:00"), // sábado
  };
}

function isCryptoSymbol(symbol) {
  const s = normalizeSymbol(symbol);
  return /^(BTC|ETH|ADA|SOL|XRP|BNB|LTC|DOGE|TRX|DOT|AVAX|MATIC)/.test(s);
}

function mkRow(base) {
  const symbol = normalizeSymbol(base?.symbol);
  const weeklySchedule = sanitizeWeeklySchedule(base?.weekly_schedule, base);
  const hasCustomWeekly = Boolean(base?.use_weekly_schedule) || Boolean(base?.weekly_schedule);

  return {
    id: base?.id ?? null,
    symbol,
    display_name: String(base?.display_name || defaultDisplayName(symbol) || symbol || "").trim(),
    enabled: base?.enabled ?? true,
    payout: clamp(toNum(base?.payout, 0.92), 0, 1),
    session_mode: base?.session_mode === "manual" ? "manual" : "auto",
    manual_open: Boolean(base?.manual_open ?? true),

    // ✅ agenda legado
    schedule_enabled: Boolean(base?.schedule_enabled ?? false),
    open_time: base?.open_time ?? null,
    close_time: base?.close_time ?? null,
    open_days: Number.isFinite(Number(base?.open_days)) ? Number(base?.open_days) : 127,
    tz: String(base?.tz || "America/Sao_Paulo"),

    // ✅ nova agenda por dia
    use_weekly_schedule: hasCustomWeekly,
    weekly_schedule: weeklySchedule,

    min_amount: base?.min_amount ?? null,
    max_amount: base?.max_amount ?? null,
    updated_at: base?.updated_at ?? null,
  };
}

function buildDefaultRows() {
  return DEFAULT_SYMBOLS.map((sym) =>
    mkRow({
      symbol: sym,
      display_name: defaultDisplayName(sym),
      payout: 0.92,
      enabled: true,
      session_mode: "auto",
      manual_open: true,
      schedule_enabled: false,
      open_time: null,
      close_time: null,
      open_days: 127,
      tz: "America/Sao_Paulo",
      use_weekly_schedule: false,
      weekly_schedule: buildWeeklyScheduleFromLegacy({
        open_time: null,
        close_time: null,
        open_days: 127,
      }),
    })
  ).sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
}

export default function AdminMarkets() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [query, setQuery] = useState("");

  const [addSymbol, setAddSymbol] = useState("");
  const [addName, setAddName] = useState("");
  const [addPayout, setAddPayout] = useState("92");

  const tableOkRef = useRef(true);

  const load = async () => {
    setError("");
    setInfo("");
    setLoading(true);

    try {
      tableOkRef.current = true;

      const { data, error: e } = await supabase
        .from("market_configs")
        .select("*")
        .order("symbol", { ascending: true });

      if (e) {
        tableOkRef.current = false;
        console.warn("[AdminMarkets] load market_configs error:", e?.message || e);
        setInfo("Configuração local carregada (fallback). Verifique RLS/SELECT para usuários logados.");
        setRows(buildDefaultRows());
        return;
      }

      if (!Array.isArray(data) || data.length === 0) {
        setInfo("Nenhuma config encontrada no Supabase. Usando lista padrão (você pode salvar).");
        setRows(buildDefaultRows());
        return;
      }

      setRows(data.map((r) => mkRow(r)));
    } catch (err) {
      console.warn("[AdminMarkets] load error:", err?.message || err);
      setError(err?.message || "Erro ao carregar mercados");
      setRows(buildDefaultRows());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const a = String(r.symbol || "").toLowerCase();
      const b = String(r.display_name || "").toLowerCase();
      return a.includes(q) || b.includes(q);
    });
  }, [rows, query]);

  const totalEnabled = useMemo(() => rows.filter((r) => r.enabled).length, [rows]);

  const setRow = (symbol, patch) => {
    setRows((prev) =>
      prev.map((r) => (String(r.symbol) === String(symbol) ? { ...r, ...patch } : r))
    );
  };

  const setWeeklyDay = (symbol, dayId, patch) => {
    setRows((prev) =>
      prev.map((r) => {
        if (String(r.symbol) !== String(symbol)) return r;

        const current = sanitizeWeeklySchedule(r.weekly_schedule, r);
        const day = sanitizeDaySchedule({
          ...current?.[dayId],
          ...patch,
        });

        const nextWeekly = {
          ...current,
          [dayId]: day,
        };

        return {
          ...r,
          weekly_schedule: nextWeekly,
        };
      })
    );
  };

  const onToggleEnabled = (symbol) => {
    const r = rows.find((x) => String(x.symbol) === String(symbol));
    if (!r) return;
    setRow(symbol, { enabled: !r.enabled });
  };

  const onChangePayout = (symbol, pct) => {
    const p = clamp(toNum(pct, 0), 0, 100);
    setRow(symbol, { payout: p / 100 });
  };

  const onChangeSessionMode = (symbol, mode) => {
    const m = String(mode) === "manual" ? "manual" : "auto";
    setRow(symbol, { session_mode: m });
  };

  const onToggleManualOpen = (symbol) => {
    const r = rows.find((x) => String(x.symbol) === String(symbol));
    if (!r) return;
    setRow(symbol, { manual_open: !r.manual_open });
  };

  // ========= agenda legado =========

  const onToggleSchedule = (symbol) => {
    const r = rows.find((x) => String(x.symbol) === String(symbol));
    if (!r) return;

    const next = !r.schedule_enabled;
    const patch = { schedule_enabled: next };

    if (next) {
      const open = r.open_time ? r.open_time : "09:00:00";
      const close = r.close_time ? r.close_time : "18:00:00";
      const weekly = sanitizeWeeklySchedule(r.weekly_schedule, {
        ...r,
        open_time: open,
        close_time: close,
        open_days: r.open_days ?? 127,
      });

      setRow(symbol, {
        ...patch,
        open_time: open,
        close_time: close,
        open_days: r.open_days ?? 127,
        weekly_schedule: weekly,
      });
    } else {
      setRow(symbol, patch);
    }
  };

  const onChangeOpenTime = (symbol, hhmm) => {
    const v = String(hhmm || "").trim();
    const nextOpen = v ? `${v}:00` : null;

    setRows((prev) =>
      prev.map((r) => {
        if (String(r.symbol) !== String(symbol)) return r;

        const next = { ...r, open_time: nextOpen };
        if (!r.use_weekly_schedule) {
          next.weekly_schedule = sanitizeWeeklySchedule(
            buildWeeklyScheduleFromLegacy({
              open_time: nextOpen,
              close_time: r.close_time,
              open_days: r.open_days,
            }),
            next
          );
        }
        return next;
      })
    );
  };

  const onChangeCloseTime = (symbol, hhmm) => {
    const v = String(hhmm || "").trim();
    const nextClose = v ? `${v}:00` : null;

    setRows((prev) =>
      prev.map((r) => {
        if (String(r.symbol) !== String(symbol)) return r;

        const next = { ...r, close_time: nextClose };
        if (!r.use_weekly_schedule) {
          next.weekly_schedule = sanitizeWeeklySchedule(
            buildWeeklyScheduleFromLegacy({
              open_time: r.open_time,
              close_time: nextClose,
              open_days: r.open_days,
            }),
            next
          );
        }
        return next;
      })
    );
  };

  const onToggleDay = (symbol, bit) => {
    const r = rows.find((x) => String(x.symbol) === String(symbol));
    if (!r) return;

    const nextMask = toggleDay(r.open_days ?? 0, bit);

    setRows((prev) =>
      prev.map((row) => {
        if (String(row.symbol) !== String(symbol)) return row;

        const next = { ...row, open_days: nextMask };

        if (!row.use_weekly_schedule) {
          next.weekly_schedule = sanitizeWeeklySchedule(
            buildWeeklyScheduleFromLegacy({
              open_time: row.open_time,
              close_time: row.close_time,
              open_days: nextMask,
            }),
            next
          );
        }

        return next;
      })
    );
  };

  const onChangeTz = (symbol, tz) => {
    setRow(symbol, { tz: String(tz || "America/Sao_Paulo") });
  };

  // ========= agenda por dia =========

  const onToggleWeeklySchedule = (symbol) => {
    const r = rows.find((x) => String(x.symbol) === String(symbol));
    if (!r) return;

    const next = !r.use_weekly_schedule;

    if (next) {
      setRow(symbol, {
        use_weekly_schedule: true,
        schedule_enabled: true,
        weekly_schedule: sanitizeWeeklySchedule(r.weekly_schedule, r),
      });
      return;
    }

    const weekly = sanitizeWeeklySchedule(r.weekly_schedule, r);
    const legacy = buildLegacyFromWeekly(weekly);

    setRow(symbol, {
      use_weekly_schedule: false,
      open_time: legacy.open_time,
      close_time: legacy.close_time,
      open_days: legacy.open_days,
    });
  };

  const onToggleWeeklyDayEnabled = (symbol, dayId) => {
    const row = rows.find((x) => String(x.symbol) === String(symbol));
    if (!row) return;

    const weekly = sanitizeWeeklySchedule(row.weekly_schedule, row);
    const current = weekly?.[dayId] || makeEmptyDay(false, "09:00:00", "18:00:00");

    const nextEnabled = !current.enabled;
    setWeeklyDay(symbol, dayId, {
      enabled: nextEnabled,
      open_time: nextEnabled ? (current.open_time || "09:00:00") : current.open_time,
      close_time: nextEnabled ? (current.close_time || "18:00:00") : current.close_time,
    });
  };

  const onChangeWeeklyOpenTime = (symbol, dayId, hhmm) => {
    const v = String(hhmm || "").trim();
    setWeeklyDay(symbol, dayId, { open_time: v ? `${v}:00` : null });
  };

  const onChangeWeeklyCloseTime = (symbol, dayId, hhmm) => {
    const v = String(hhmm || "").trim();
    setWeeklyDay(symbol, dayId, { close_time: v ? `${v}:00` : null });
  };

  const applyWeeklyPresetToRow = (symbol, type) => {
    const preset =
      type === "crypto"
        ? makeCryptoPreset()
        : makeForexPreset();

    const legacy = buildLegacyFromWeekly(preset);

    setRow(symbol, {
      schedule_enabled: true,
      use_weekly_schedule: true,
      weekly_schedule: preset,
      open_days: legacy.open_days,
      open_time: legacy.open_time,
      close_time: legacy.close_time,
    });
  };

  /**
   * ✅ Remoção persistente (sem DELETE no backend):
   * - desativa o par
   * - força MANUAL fechado
   * - desliga schedule
   */
  const onRemove = (symbol) => {
    if (!confirm(`Remover o par ${symbol}? (Isso vai desativar e fechar o par)`)) return;

    setRow(symbol, {
      enabled: false,
      session_mode: "manual",
      manual_open: false,
      schedule_enabled: false,
    });
  };

  const onAdd = () => {
    const sym = normalizeSymbol(addSymbol);
    if (!sym) return alert("Símbolo é obrigatório (ex: EURUSD).");
    if (rows.some((r) => String(r.symbol) === String(sym))) return alert("Esse símbolo já existe.");

    const name = String(addName || defaultDisplayName(sym) || sym).trim();
    const p = clamp(toNum(addPayout, 92), 0, 100);

    const newRow = mkRow({
      symbol: sym,
      display_name: name,
      payout: p / 100,
      enabled: true,
      session_mode: "auto",
      manual_open: true,
      schedule_enabled: false,
      open_time: null,
      close_time: null,
      open_days: 127,
      tz: "America/Sao_Paulo",
      use_weekly_schedule: false,
      weekly_schedule: buildWeeklyScheduleFromLegacy({
        open_time: null,
        close_time: null,
        open_days: 127,
      }),
    });

    setRows((prev) => {
      const next = [...prev, newRow];
      next.sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
      return next;
    });

    setAddSymbol("");
    setAddName("");
    setAddPayout("92");
  };

  const bulkEnableAll = (v) =>
    setRows((prev) => prev.map((r) => ({ ...r, enabled: Boolean(v) })));

  const bulkSetSessionAuto = () =>
    setRows((prev) => prev.map((r) => ({ ...r, session_mode: "auto" })));

  const bulkSetSessionManualClosed = () =>
    setRows((prev) => prev.map((r) => ({ ...r, session_mode: "manual", manual_open: false })));

  const bulkEnableSchedule = (v) =>
    setRows((prev) =>
      prev.map((r) => {
        const next = { ...r, schedule_enabled: Boolean(v) };
        if (v) {
          if (!next.open_time) next.open_time = "09:00:00";
          if (!next.close_time) next.close_time = "18:00:00";
          if (next.open_days === null || next.open_days === undefined) next.open_days = 127;
          if (!next.tz) next.tz = "America/Sao_Paulo";
          next.weekly_schedule = sanitizeWeeklySchedule(next.weekly_schedule, next);
        }
        return next;
      })
    );

  const bulkSetScheduleWindow = (openHHMM, closeHHMM) =>
    setRows((prev) =>
      prev.map((r) => {
        const nextOpen = openHHMM ? `${openHHMM}:00` : "09:00:00";
        const nextClose = closeHHMM ? `${closeHHMM}:00` : "18:00:00";

        const next = {
          ...r,
          schedule_enabled: true,
          open_time: nextOpen,
          close_time: nextClose,
        };

        if (!r.use_weekly_schedule) {
          next.weekly_schedule = sanitizeWeeklySchedule(
            buildWeeklyScheduleFromLegacy({
              open_time: nextOpen,
              close_time: nextClose,
              open_days: r.open_days,
            }),
            next
          );
        }

        return next;
      })
    );

  const bulkApplyForexPreset = () =>
    setRows((prev) =>
      prev.map((r) => {
        if (isCryptoSymbol(r.symbol)) return r;

        const weekly = makeForexPreset();
        const legacy = buildLegacyFromWeekly(weekly);

        return {
          ...r,
          schedule_enabled: true,
          use_weekly_schedule: true,
          weekly_schedule: weekly,
          open_days: legacy.open_days,
          open_time: legacy.open_time,
          close_time: legacy.close_time,
        };
      })
    );

  const bulkApplyCryptoPreset = () =>
    setRows((prev) =>
      prev.map((r) => {
        if (!isCryptoSymbol(r.symbol)) return r;

        const weekly = makeCryptoPreset();
        const legacy = buildLegacyFromWeekly(weekly);

        return {
          ...r,
          schedule_enabled: true,
          use_weekly_schedule: true,
          weekly_schedule: weekly,
          open_days: legacy.open_days,
          open_time: legacy.open_time,
          close_time: legacy.close_time,
        };
      })
    );

  const onSave = async () => {
    setError("");
    setInfo("");

    for (const r of rows) {
      if (!normalizeSymbol(r.symbol)) {
        return setError("Existe linha com símbolo inválido.");
      }

      const p = Number(r.payout);
      if (!Number.isFinite(p) || p < 0 || p > 1) {
        return setError(`Payout inválido em ${r.symbol}.`);
      }

      if (r.schedule_enabled) {
        if (r.use_weekly_schedule) {
          const weekly = sanitizeWeeklySchedule(r.weekly_schedule, r);

          for (const d of WEEK_DAYS) {
            const item = weekly?.[d.id];
            if (item?.enabled) {
              if (!item.open_time || !item.close_time) {
                return setError(`Horário inválido em ${r.symbol} (${d.label}): open/close obrigatório.`);
              }
            }
          }
        } else {
          if (!r.open_time || !r.close_time) {
            return setError(`Horário inválido em ${r.symbol}: open/close obrigatório.`);
          }
          const days = Number(r.open_days);
          if (!Number.isFinite(days) || days < 0 || days > 127) {
            return setError(`Dias inválidos em ${r.symbol}.`);
          }
        }
      }
    }

    setSaving(true);
    try {
      const payload = rows.map((r) => {
        const weekly = sanitizeWeeklySchedule(r.weekly_schedule, r);

        const normalizedLegacy = r.use_weekly_schedule
          ? buildLegacyFromWeekly(weekly)
          : {
              open_time: r.open_time || null,
              close_time: r.close_time || null,
              open_days: Number.isFinite(Number(r.open_days)) ? Number(r.open_days) : 127,
            };

        const base = {
          symbol: normalizeSymbol(r.symbol),
          display_name: String(r.display_name || r.symbol || "").trim(),
          enabled: Boolean(r.enabled),
          payout: clamp(Number(r.payout), 0, 1),
          session_mode: r.session_mode === "manual" ? "manual" : "auto",
          manual_open: Boolean(r.manual_open),

          // ✅ legado preservado
          schedule_enabled: Boolean(r.schedule_enabled),
          open_time: normalizedLegacy.open_time,
          close_time: normalizedLegacy.close_time,
          open_days: normalizedLegacy.open_days,
          tz: String(r.tz || "America/Sao_Paulo"),

          // ✅ novo modo por dia
          use_weekly_schedule: Boolean(r.use_weekly_schedule),
          weekly_schedule: Boolean(r.use_weekly_schedule) ? weekly : null,

          updated_at: new Date().toISOString(),
        };

        const id = r.id ? String(r.id).trim() : "";
        if (id) return { id, ...base };
        return base;
      });

      await adminUpsertMarkets(payload);

      tableOkRef.current = true;
      setInfo("Mercados salvos com sucesso.");
      await load();
    } catch (err) {
      console.warn("[AdminMarkets] save error:", err?.message || err);
      tableOkRef.current = false;
      setError(err?.message || "Erro ao salvar mercados");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Mercados</h1>

        <button onClick={load} disabled={saving} style={btnStyle("#151a21")}>
          Atualizar
        </button>

        <button onClick={onSave} disabled={saving} style={primaryBtnStyle}>
          {saving ? "Salvando..." : "Salvar"}
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por símbolo ou nome..."
            style={{ ...inputStyle, width: 320, height: 36 }}
            disabled={loading}
          />
          <div style={{ color: "#9aa4b2", fontSize: 12 }}>
            Total: <b style={{ color: "#e5e7eb" }}>{rows.length}</b> | Ativos:{" "}
            <b style={{ color: "#e5e7eb" }}>{totalEnabled}</b>
          </div>
        </div>
      </div>

      <p style={{ color: "#9aa4b2", marginTop: 8 }}>
        Config global da corretora: pares, payout, ativo/inativo, sessão (auto/manual) e horários
        (agenda). Agora com suporte a agenda padrão e agenda personalizada por dia.
      </p>

      {info ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #223045",
            background: "#0f1826",
            color: "#cfe3ff",
          }}
        >
          {info}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #442",
            background: "#221",
            color: "#ffd6d6",
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <div
          style={{
            borderRadius: 12,
            border: "1px solid #2b2f36",
            background: "#0b1016",
            padding: 12,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ color: "#cbd5e1", fontWeight: 800, fontSize: 13, marginRight: 6 }}>
            Ações em massa
          </div>

          <button onClick={() => bulkEnableAll(true)} disabled={loading || saving} style={btnStyle("#1f2f1f")}>
            Ativar todos
          </button>
          <button onClick={() => bulkEnableAll(false)} disabled={loading || saving} style={btnStyle("#2b1414")}>
            Desativar todos
          </button>

          <button onClick={bulkSetSessionAuto} disabled={loading || saving} style={btnStyle("#1d2a3a")}>
            Sessão: AUTO (todos)
          </button>
          <button onClick={bulkSetSessionManualClosed} disabled={loading || saving} style={btnStyle("#2a1f33")}>
            Sessão: MANUAL fechado (todos)
          </button>

          <button onClick={() => bulkEnableSchedule(true)} disabled={loading || saving} style={btnStyle("#23304a")}>
            Agenda: ON (todos)
          </button>
          <button onClick={() => bulkEnableSchedule(false)} disabled={loading || saving} style={btnStyle("#1a202a")}>
            Agenda: OFF (todos)
          </button>

          <button onClick={() => bulkSetScheduleWindow("09:00", "18:00")} disabled={loading || saving} style={btnStyle("#1f2a44")}>
            Agenda: 09:00–18:00 (todos)
          </button>

          <button onClick={bulkApplyForexPreset} disabled={loading || saving} style={btnStyle("#16301f")}>
            Preset Forex
          </button>

          <button onClick={bulkApplyCryptoPreset} disabled={loading || saving} style={btnStyle("#2a1740")}>
            Preset Crypto
          </button>

          <div style={{ marginLeft: "auto", color: "#9aa4b2", fontSize: 12 }}>
            Persistência:{" "}
            <b style={{ color: tableOkRef.current ? "#b7f7c0" : "#ffb4b4" }}>
              {tableOkRef.current ? "OK" : "Fallback"}
            </b>
          </div>
        </div>

        <div style={{ borderRadius: 12, border: "1px solid #2b2f36", background: "#0b1016", padding: 12 }}>
          <div style={{ color: "#cbd5e1", fontWeight: 800, fontSize: 13 }}>Adicionar novo par</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 0.7fr 0.5fr", gap: 10, marginTop: 10 }}>
            <div>
              <div style={labelStyle}>Símbolo (ex: EURUSD)</div>
              <input
                value={addSymbol}
                onChange={(e) => setAddSymbol(e.target.value)}
                style={inputStyle}
                placeholder="EURUSD"
                disabled={loading || saving}
              />
            </div>

            <div>
              <div style={labelStyle}>Nome</div>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                style={inputStyle}
                placeholder="EUR/USD"
                disabled={loading || saving}
              />
            </div>

            <div>
              <div style={labelStyle}>Payout (%)</div>
              <input
                value={addPayout}
                onChange={(e) => setAddPayout(e.target.value)}
                style={inputStyle}
                placeholder="92"
                disabled={loading || saving}
              />
            </div>

            <div style={{ display: "flex", alignItems: "end" }}>
              <button onClick={onAdd} disabled={loading || saving} style={btnStyle("#151a21")}>
                Adicionar
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 16 }}>Carregando...</p>
      ) : (
        <div style={{ marginTop: 16, borderRadius: 12, border: "1px solid #2b2f36", overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "0.7fr 1.2fr 0.7fr 0.8fr 1.1fr 2.2fr 0.7fr",
              padding: "12px 14px",
              background: "#0f141a",
              color: "#cbd5e1",
              fontWeight: 700,
              fontSize: 13,
              gap: 10,
            }}
          >
            <div>Par</div>
            <div>Nome</div>
            <div>Payout</div>
            <div>Ativo</div>
            <div>Sessão</div>
            <div>Horários</div>
            <div>Ações</div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: 14, color: "#9aa4b2" }}>Nenhum mercado encontrado.</div>
          ) : (
            filtered.map((r) => {
              const payoutPct = Math.round(Number(r.payout) * 100);
              const weekly = sanitizeWeeklySchedule(r.weekly_schedule, r);

              return (
                <div
                  key={String(r.symbol)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "0.7fr 1.2fr 0.7fr 0.8fr 1.1fr 2.2fr 0.7fr",
                    padding: "12px 14px",
                    borderTop: "1px solid #20242c",
                    background: "#0b1016",
                    color: "#e5e7eb",
                    alignItems: "start",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 900, letterSpacing: 0.4, paddingTop: 6 }}>{r.symbol}</div>

                  <div>
                    <input
                      value={r.display_name}
                      onChange={(e) => setRow(r.symbol, { display_name: e.target.value })}
                      style={{ ...inputStyle, height: 34 }}
                      disabled={saving}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      value={String(payoutPct)}
                      onChange={(e) => onChangePayout(r.symbol, e.target.value)}
                      style={{ ...inputStyle, height: 34 }}
                      disabled={saving}
                    />
                    <span style={{ color: "#9aa4b2", fontSize: 12 }}>%</span>
                  </div>

                  <div>
                    <button
                      onClick={() => onToggleEnabled(r.symbol)}
                      disabled={saving}
                      style={{
                        ...pillStyle,
                        background: r.enabled ? "#142b18" : "#2b1414",
                        color: r.enabled ? "#b7f7c0" : "#ffb4b4",
                      }}
                    >
                      {r.enabled ? "ATIVO" : "INATIVO"}
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 1 }}>
                    <select
                      value={r.session_mode}
                      onChange={(e) => onChangeSessionMode(r.symbol, e.target.value)}
                      style={{ ...inputStyle, height: 34 }}
                      disabled={saving}
                    >
                      <option value="auto">AUTO</option>
                      <option value="manual">MANUAL</option>
                    </select>

                    {r.session_mode === "manual" ? (
                      <button
                        onClick={() => onToggleManualOpen(r.symbol)}
                        disabled={saving}
                        style={{
                          ...pillStyle,
                          background: r.manual_open ? "#142b18" : "#2b1414",
                          color: r.manual_open ? "#b7f7c0" : "#ffb4b4",
                        }}
                      >
                        {r.manual_open ? "ABERTO" : "FECHADO"}
                      </button>
                    ) : (
                      <span style={{ color: "#9aa4b2", fontSize: 12 }}>auto</span>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* topo */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <button
                        onClick={() => onToggleSchedule(r.symbol)}
                        disabled={saving}
                        style={{
                          ...pillStyle,
                          background: r.schedule_enabled ? "#0f1826" : "#1a202a",
                          color: r.schedule_enabled ? "#cfe3ff" : "#9aa4b2",
                        }}
                        title="Ativar/desativar agenda"
                      >
                        Agenda {r.schedule_enabled ? "ON" : "OFF"}
                      </button>

                      <button
                        onClick={() => onToggleWeeklySchedule(r.symbol)}
                        disabled={saving || !r.schedule_enabled}
                        style={{
                          ...pillStyle,
                          background: r.use_weekly_schedule ? "#1a2442" : "#10161f",
                          color: r.use_weekly_schedule ? "#dbe8ff" : "#9aa4b2",
                        }}
                        title="Alternar agenda personalizada por dia"
                      >
                        {r.use_weekly_schedule ? "POR DIA" : "PADRÃO"}
                      </button>

                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#9aa4b2", fontSize: 12 }}>TZ</span>
                        <input
                          value={r.tz}
                          onChange={(e) => onChangeTz(r.symbol, e.target.value)}
                          style={{ ...inputStyle, height: 34, width: 180 }}
                          disabled={saving || !r.schedule_enabled}
                          placeholder="America/Sao_Paulo"
                        />
                      </div>
                    </div>

                    {/* modo padrão legado */}
                    {!r.use_weekly_schedule ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#9aa4b2", fontSize: 12 }}>Abre</span>
                            <input
                              type="time"
                              value={toHHMM(r.open_time)}
                              onChange={(e) => onChangeOpenTime(r.symbol, e.target.value)}
                              style={{ ...inputStyle, height: 34, width: 120 }}
                              disabled={saving || !r.schedule_enabled}
                            />
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#9aa4b2", fontSize: 12 }}>Fecha</span>
                            <input
                              type="time"
                              value={toHHMM(r.close_time)}
                              onChange={(e) => onChangeCloseTime(r.symbol, e.target.value)}
                              style={{ ...inputStyle, height: 34, width: 120 }}
                              disabled={saving || !r.schedule_enabled}
                            />
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#9aa4b2", fontSize: 12 }}>Dias</span>
                            <div style={{ display: "flex", gap: 6 }}>
                              {WEEK_DAYS.map((d) => {
                                const on = hasDay(r.open_days, d.bit);
                                return (
                                  <button
                                    key={d.bit}
                                    onClick={() => onToggleDay(r.symbol, d.bit)}
                                    disabled={saving || !r.schedule_enabled}
                                    style={{
                                      width: 30,
                                      height: 30,
                                      borderRadius: 10,
                                      border: "1px solid #2b2f36",
                                      background: on ? "#142b18" : "#0f141a",
                                      color: on ? "#b7f7c0" : "#9aa4b2",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                      fontSize: 12,
                                    }}
                                    title={d.label}
                                  >
                                    {d.short}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* presets rápidos */}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => applyWeeklyPresetToRow(r.symbol, "forex")}
                            disabled={saving || !r.schedule_enabled}
                            style={btnStyle("#16301f")}
                          >
                            Preset Forex
                          </button>
                          <button
                            onClick={() => applyWeeklyPresetToRow(r.symbol, "crypto")}
                            disabled={saving || !r.schedule_enabled}
                            style={btnStyle("#2a1740")}
                          >
                            Preset Crypto
                          </button>
                        </div>

                        {/* grade por dia */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(7, minmax(125px, 1fr))",
                            gap: 8,
                          }}
                        >
                          {WEEK_DAYS.map((d) => {
                            const day = weekly?.[d.id] || makeEmptyDay(false, null, null);

                            return (
                              <div
                                key={d.id}
                                style={{
                                  border: "1px solid #232a33",
                                  borderRadius: 12,
                                  padding: 10,
                                  background: "#0f141a",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 8,
                                  minHeight: 124,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                  <div style={{ fontSize: 12, fontWeight: 900, color: "#d7dee8" }}>{d.label}</div>
                                  <button
                                    onClick={() => onToggleWeeklyDayEnabled(r.symbol, d.id)}
                                    disabled={saving || !r.schedule_enabled}
                                    style={{
                                      ...pillStyle,
                                      height: 28,
                                      padding: "0 10px",
                                      background: day.enabled ? "#142b18" : "#2b1414",
                                      color: day.enabled ? "#b7f7c0" : "#ffb4b4",
                                      fontSize: 11,
                                    }}
                                  >
                                    {day.enabled ? "ON" : "OFF"}
                                  </button>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ color: "#9aa4b2", fontSize: 11 }}>Abre</span>
                                    <input
                                      type="time"
                                      value={toHHMM(day.open_time)}
                                      onChange={(e) => onChangeWeeklyOpenTime(r.symbol, d.id, e.target.value)}
                                      style={{ ...inputStyle, height: 32 }}
                                      disabled={saving || !r.schedule_enabled || !day.enabled}
                                    />
                                  </div>

                                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ color: "#9aa4b2", fontSize: 11 }}>Fecha</span>
                                    <input
                                      type="time"
                                      value={toHHMM(day.close_time)}
                                      onChange={(e) => onChangeWeeklyCloseTime(r.symbol, d.id, e.target.value)}
                                      style={{ ...inputStyle, height: 32 }}
                                      disabled={saving || !r.schedule_enabled || !day.enabled}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => onRemove(r.symbol)} disabled={saving} style={btnStyle("#2b1414")}>
                      Remover
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function btnStyle(bg) {
  return {
    height: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #2b2f36",
    background: bg,
    color: "#fff",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  };
}

const inputStyle = {
  width: "100%",
  height: 38,
  borderRadius: 10,
  border: "1px solid #2b2f36",
  background: "#0f141a",
  color: "#fff",
  padding: "0 10px",
  outline: "none",
};

const labelStyle = { fontSize: 12, color: "#9aa4b2", marginBottom: 6 };

const primaryBtnStyle = {
  height: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 12,
};

const pillStyle = {
  height: 32,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid #2b2f36",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
};