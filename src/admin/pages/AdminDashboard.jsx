import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAdminUsers, fetchAdminTradeHistoryAggREAL } from "../services/admin.api";
import { supabase } from "@/services/supabaseClient";
import "./admin-dashboard.css";

/** =========================
 * Helpers
 * ========================= */
function formatCurrencyBRL(value) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatInt(value) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR");
}

function coerceNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (Array.isArray(v)) {
    if (!v.length) return null;
    return coerceNumber(v[0]);
  }
  if (v && typeof v === "object") {
    const cand = v.value ?? v.total ?? v.amount ?? v.sum ?? v.result;
    return coerceNumber(cand);
  }
  return null;
}

function normalizeUsersPayload(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.users)) return data.users;
  return [];
}

function getUserCreatedAt(u) {
  const p = u?.profile || u?.profiles || u?.profile_data || u?.profileRow || u?.profile_row || null;

  const cand =
    u?.created_at ||
    u?.createdAt ||
    u?.created ||
    u?.inserted_at ||
    u?.insertedAt ||
    p?.created_at ||
    p?.createdAt ||
    p?.created ||
    p?.inserted_at ||
    p?.insertedAt ||
    null;

  if (!cand) return null;
  const d = new Date(cand);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function countNewUsersLastDays(users, days) {
  const now = Date.now();
  const windowMs = days * 24 * 60 * 60 * 1000;
  let count = 0;

  for (const u of users) {
    const d = getUserCreatedAt(u);
    if (!d) continue;
    const age = now - d.getTime();
    if (age >= 0 && age <= windowMs) count += 1;
  }

  return count;
}

// ✅ SOMA SOMENTE REAL (nada de DEMO)
function sumWalletsRealOnly(users) {
  let total = 0;
  for (const u of users) {
    const w = u?.wallets || {};
    const real = coerceNumber(w?.REAL) ?? 0;
    total += Number(real);
  }
  return total;
}

function isoFromDaysBack(days) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { from: start.toISOString(), to: now.toISOString() };
}

function isoFromDateInputs(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return null;

  // Local time boundaries (inclui o dia todo)
  const from = new Date(`${fromYmd}T00:00:00`);
  const to = new Date(`${toYmd}T23:59:59.999`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (from.getTime() > to.getTime()) return null;

  return { from: from.toISOString(), to: to.toISOString() };
}

/** =========================
 * Chart (mantido, mas sem inventar dados)
 * ========================= */
function PerformanceChart({ points = [], height = 240 }) {
  const { pathLine, pathArea, minV, maxV } = useMemo(() => {
    const safe = Array.isArray(points) ? points : [];
    const values = safe.map((p) => Number(p?.value || 0));
    const minVal = values.length ? Math.min(...values) : 0;
    const maxVal = values.length ? Math.max(...values) : 0;

    const span = Math.max(1, maxVal - minVal);

    const W = 1000;
    const H = 300;
    const padX = 40;
    const padY = 25;

    const innerW = W - padX * 2;
    const innerH = H - padY * 2;

    const getX = (i) => {
      if (safe.length <= 1) return padX;
      return padX + (i * innerW) / (safe.length - 1);
    };

    const getY = (v) => {
      const t = (Number(v) - minVal) / span;
      return padY + (1 - t) * innerH;
    };

    let d = "";
    safe.forEach((p, i) => {
      const x = getX(i);
      const y = getY(p.value);
      d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });

    const firstX = safe.length ? getX(0) : padX;
    const lastX = safe.length ? getX(safe.length - 1) : padX;
    const baseY = padY + innerH;

    const area = safe.length ? `${d} L ${lastX} ${baseY} L ${firstX} ${baseY} Z` : "";

    return { pathLine: d, pathArea: area, minV: minVal, maxV: maxVal };
  }, [points]);

  const viewBox = "0 0 1000 300";

  return (
    <div className="adm-chart">
      <div className="adm-chart-head">
        <div>
          <div className="adm-chart-title">Desempenho da Corretora</div>
          <div className="adm-chart-subtitle">Evolução no período selecionado</div>
        </div>
        <div className="adm-chart-range">
          <span className="adm-chart-range-meta">
            Min: {formatCurrencyBRL(minV)} • Max: {formatCurrencyBRL(maxV)}
          </span>
        </div>
      </div>

      <div className="adm-chart-canvas" style={{ height }}>
        {points.length === 0 ? (
          <div style={{ padding: 14, color: "#9aa4b2", fontSize: 13 }}>
            Sem série configurada no Dashboard ainda (não vou inventar número).
          </div>
        ) : (
          <svg className="adm-chart-svg" viewBox={viewBox} preserveAspectRatio="none" role="img" aria-label="Gráfico de desempenho">
            <g className="adm-chart-grid">
              {Array.from({ length: 6 }).map((_, i) => {
                const y = 25 + (i * (300 - 50)) / 5;
                return <line key={i} x1="40" y1={y} x2="960" y2={y} />;
              })}
            </g>

            {pathArea ? <path className="adm-chart-area" d={pathArea} /> : null}
            {pathLine ? <path className="adm-chart-line" d={pathLine} /> : null}

            <g className="adm-chart-dots">
              {points.map((p, i) => {
                const W = 1000, H = 300, padX = 40, padY = 25;
                const innerW = W - padX * 2;
                const innerH = H - padY * 2;
                const minVal = Number(minV || 0);
                const maxVal = Number(maxV || 0);
                const span = Math.max(1, maxVal - minVal);

                const x = points.length <= 1 ? padX : padX + (i * innerW) / (points.length - 1);
                const t = (Number(p?.value || 0) - minVal) / span;
                const y = padY + (1 - t) * innerH;

                return <circle key={i} cx={x} cy={y} r="6" />;
              })}
            </g>
          </svg>
        )}
      </div>

      <div className="adm-chart-xlabels">
        {(points || []).slice(0, 7).map((p, i) => (
          <span key={i} className="adm-chart-xlabel" title={p?.label || ""}>
            {p?.label || "-"}
          </span>
        ))}
      </div>
    </div>
  );
}

function KpiCard({ title, value, subtitle, icon }) {
  return (
    <div className="adm-kpi-card">
      <div className="adm-kpi-top">
        <div className="adm-kpi-icon" aria-hidden="true">
          {icon}
        </div>
        <div className="adm-kpi-title">{title}</div>
      </div>

      <div className="adm-kpi-value">{value}</div>
      {subtitle ? <div className="adm-kpi-subtitle">{subtitle}</div> : null}
    </div>
  );
}

/** =========================
 * Main
 * ========================= */
export default function AdminDashboard() {
  const [range, setRange] = useState("7d"); // 7d | 14d | 30d | custom
  const [customFrom, setCustomFrom] = useState(""); // YYYY-MM-DD
  const [customTo, setCustomTo] = useState(""); // YYYY-MM-DD

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [users, setUsers] = useState([]);

  // KPIs reais vindos de tabelas (copiado do padrão deposits/withdraws)
  const [totalDepositsConfirmed, setTotalDepositsConfirmed] = useState(0);
  const [withdrawsPending, setWithdrawsPending] = useState(0);
  const [withdrawsApproved, setWithdrawsApproved] = useState(0);

  // ✅ LUCRO REAL DA CORRETORA (MESMA FONTE DO OPERACOES: admin-trade-history-agg)
  const [brokerTotalProfit, setBrokerTotalProfit] = useState(0);
  const [brokerProfitMeta, setBrokerProfitMeta] = useState("");

  const loadingRef = useRef(false);
  const rtRef = useRef({ deposits: null, withdrawals: null, trades: null });
  const debounceRef = useRef(null);

  const rangeDays = useMemo(() => {
    if (range === "30d") return 30;
    if (range === "14d") return 14;
    return 7;
  }, [range]);

  const effectiveIsoRange = useMemo(() => {
    if (range === "custom") {
      const iso = isoFromDateInputs(customFrom, customTo);
      return iso; // pode ser null se inválido
    }
    return isoFromDaysBack(rangeDays);
  }, [range, rangeDays, customFrom, customTo]);

  const rangeLabel = useMemo(() => {
    if (range === "custom") {
      if (!effectiveIsoRange) return "custom (inválido)";
      const { from, to } = effectiveIsoRange;
      const fromD = new Date(from).toLocaleDateString("pt-BR");
      const toD = new Date(to).toLocaleDateString("pt-BR");
      return `${fromD} → ${toD}`;
    }
    return range;
  }, [range, effectiveIsoRange]);

  const loadUsers = async () => {
    const res = await fetchAdminUsers();
    setUsers(normalizeUsersPayload(res));
  };

  // Paginação segura pra somar sem depender de aggregates/rpc
  const sumTablePaginated = async ({ table, selectCols, fromIso, toIso, filterFn, pageSize = 1000, maxPages = 40 }) => {
    let total = 0;
    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error: err } = await supabase
        .from(table)
        .select(selectCols)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (err) throw err;

      const rows = Array.isArray(data) ? data : [];
      for (const r of rows) total += filterFn(r);

      if (rows.length < pageSize) break;
    }
    return total;
  };

  const loadFinanceKpis = async () => {
    const iso = effectiveIsoRange;
    if (!iso) {
      // custom inválido: não consulta (evita lixo)
      setTotalDepositsConfirmed(0);
      setWithdrawsPending(0);
      setWithdrawsApproved(0);
      return;
    }

    const { from, to } = iso;

    // deposits: CONFIRMED / RECEIVED
    const depositsSum = await sumTablePaginated({
      table: "deposits",
      selectCols: "amount,status,created_at",
      fromIso: from,
      toIso: to,
      filterFn: (r) => {
        const st = String(r?.status || "").toUpperCase();
        const ok = st === "CONFIRMED" || st === "RECEIVED";
        const amt = coerceNumber(r?.amount) ?? 0;
        return ok ? Number(amt) : 0;
      },
    });

    // withdrawals: pending = PENDING + REVIEW | efetuados = APPROVED
    const withdrawPendingSum = await sumTablePaginated({
      table: "withdrawals",
      selectCols: "amount_gross,status,created_at",
      fromIso: from,
      toIso: to,
      filterFn: (r) => {
        const st = String(r?.status || "").toUpperCase();
        const isPending = st === "PENDING" || st === "REVIEW";
        const amt = coerceNumber(r?.amount_gross) ?? 0;
        return isPending ? Number(amt) : 0;
      },
    });

    const withdrawApprovedSum = await sumTablePaginated({
      table: "withdrawals",
      selectCols: "amount_gross,status,created_at",
      fromIso: from,
      toIso: to,
      filterFn: (r) => {
        const st = String(r?.status || "").toUpperCase();
        const isApproved = st === "APPROVED";
        const amt = coerceNumber(r?.amount_gross) ?? 0;
        return isApproved ? Number(amt) : 0;
      },
    });

    setTotalDepositsConfirmed(depositsSum);
    setWithdrawsPending(withdrawPendingSum);
    setWithdrawsApproved(withdrawApprovedSum);
  };

  /**
   * ✅ Lucro total da corretora no período
   * Mesma fonte do Operações: admin-trade-history-agg
   * Regra:
   * - Edge retorna net_trader por user
   * - lucro corretora = Σ( -net_trader )
   */
  const loadBrokerProfitKpi = async () => {
    const iso = effectiveIsoRange;
    if (!iso) {
      setBrokerTotalProfit(0);
      setBrokerProfitMeta("range inválido");
      return;
    }

    const { from, to } = iso;

    const agg = await fetchAdminTradeHistoryAggREAL({ from, to });
    const items = Array.isArray(agg?.items) ? agg.items : [];

    let total = 0;
    for (const it of items) {
      const netTrader = Number(it?.net_trader ?? 0);
      total += -netTrader;
    }

    setBrokerTotalProfit(total);

    const fromD = new Date(from).toLocaleDateString("pt-BR");
    const toD = new Date(to).toLocaleDateString("pt-BR");
    setBrokerProfitMeta(`admin-trade-history-agg (REAL) • período ${fromD} → ${toD}`);
  };

  const load = async ({ silent = false } = {}) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    if (!silent) {
      setError("");
      setLoading(true);
    }

    try {
      await Promise.all([loadUsers(), loadFinanceKpis(), loadBrokerProfitKpi()]);
    } catch (e) {
      if (!silent) setError(e?.message || "Erro ao carregar dashboard");
      // silent: não derruba UI
    } finally {
      if (!silent) setLoading(false);
      loadingRef.current = false;
    }
  };

  const loadSilent = async () => load({ silent: true });

  useEffect(() => {
    load({ silent: false });
    const poll = setInterval(() => loadSilent(), 8000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // custom só recarrega quando datas válidas
    if (range === "custom" && !effectiveIsoRange) return;
    loadSilent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, rangeDays, customFrom, customTo]);

  // ✅ Realtime (igual deposits/withdraws), com debounce
  useEffect(() => {
    // cleanup
    if (rtRef.current.deposits) {
      supabase.removeChannel(rtRef.current.deposits);
      rtRef.current.deposits = null;
    }
    if (rtRef.current.withdrawals) {
      supabase.removeChannel(rtRef.current.withdrawals);
      rtRef.current.withdrawals = null;
    }
    if (rtRef.current.trades) {
      supabase.removeChannel(rtRef.current.trades);
      rtRef.current.trades = null;
    }

    const kick = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        loadSilent();
      }, 450);
    };

    const chDeposits = supabase
      .channel("admin:dashboard:deposits:rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "deposits" }, () => kick())
      .subscribe();

    const chWithdrawals = supabase
      .channel("admin:dashboard:withdrawals:rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawals" }, () => kick())
      .subscribe();

    // Mantido (não afeta mais o lucro, mas ajuda a recarregar quando o usuário logado opera)
    const chTrades = supabase
      .channel("admin:dashboard:trade_history:rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_history" }, () => kick())
      .subscribe();

    rtRef.current.deposits = chDeposits;
    rtRef.current.withdrawals = chWithdrawals;
    rtRef.current.trades = chTrades;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;

      if (rtRef.current.deposits) {
        supabase.removeChannel(rtRef.current.deposits);
        rtRef.current.deposits = null;
      }
      if (rtRef.current.withdrawals) {
        supabase.removeChannel(rtRef.current.withdrawals);
        rtRef.current.withdrawals = null;
      }
      if (rtRef.current.trades) {
        supabase.removeChannel(rtRef.current.trades);
        rtRef.current.trades = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays, range, customFrom, customTo]);

  /** =========================
   * KPIs (REAL)
   * ========================= */
  const totalUsers = users.length;
  const newUsersLast7Days = useMemo(() => countNewUsersLastDays(users, 7), [users]);

  // ✅ agora é só REAL
  const totalUsersWalletBalanceRealOnly = useMemo(() => sumWalletsRealOnly(users), [users]);

  const chartPoints = useMemo(() => {
    // Mantido: não inventa série
    return [];
  }, []);

  return (
    <div className="adm-dash">
      <div className="adm-dash-header">
        <div>
          <div className="adm-dash-title">Dashboard</div>
          <div className="adm-dash-subtitle">Visão geral da corretora (somente indicadores e totais)</div>
        </div>

        <div className="adm-dash-actions">
          <div className="adm-range" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button className={range === "7d" ? "adm-range-btn active" : "adm-range-btn"} onClick={() => setRange("7d")} type="button">
              7 dias
            </button>
            <button className={range === "14d" ? "adm-range-btn active" : "adm-range-btn"} onClick={() => setRange("14d")} type="button">
              14 dias
            </button>
            <button className={range === "30d" ? "adm-range-btn active" : "adm-range-btn"} onClick={() => setRange("30d")} type="button">
              30 dias
            </button>

            <button
              className={range === "custom" ? "adm-range-btn active" : "adm-range-btn"}
              onClick={() => setRange("custom")}
              type="button"
              title="Filtrar por data (de/até)"
            >
              Personalizado
            </button>

            {range === "custom" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{
                    height: 34,
                    padding: "0 10px",
                    borderRadius: 10,
                    border: "1px solid #2b2f36",
                    background: "#0f141a",
                    color: "#e5e7eb",
                    outline: "none",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                />
                <span style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 800 }}>até</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={{
                    height: 34,
                    padding: "0 10px",
                    borderRadius: 10,
                    border: "1px solid #2b2f36",
                    background: "#0f141a",
                    color: "#e5e7eb",
                    outline: "none",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <div className="adm-warning">{error}</div> : null}

      <div className="adm-kpi-grid">
        <KpiCard title="Novos usuários" value={loading ? "—" : formatInt(newUsersLast7Days)} subtitle="Últimos 7 dias" icon="👤" />
        <KpiCard title="Usuários totais" value={loading ? "—" : formatInt(totalUsers)} subtitle="Base completa cadastrada" icon="👥" />

        <KpiCard
          title="Lucro total da corretora"
          value={loading ? "—" : formatCurrencyBRL(brokerTotalProfit)}
          subtitle={brokerProfitMeta || `admin-trade-history-agg (REAL) • período ${rangeLabel}`}
          icon="📈"
        />

        <KpiCard
          title="Depósitos totais"
          value={loading ? "—" : formatCurrencyBRL(totalDepositsConfirmed)}
          subtitle={`CONFIRMED/RECEIVED • período ${rangeLabel}`}
          icon="💳"
        />
        <KpiCard
          title="Saques pendentes"
          value={loading ? "—" : formatCurrencyBRL(withdrawsPending)}
          subtitle={`PENDING/REVIEW • período ${rangeLabel}`}
          icon="⏳"
        />
        <KpiCard
          title="Saques efetuados"
          value={loading ? "—" : formatCurrencyBRL(withdrawsApproved)}
          subtitle={`APPROVED (EFETUADO) • período ${rangeLabel}`}
          icon="✅"
        />
        <KpiCard
          title="Saldo total nas carteiras"
          value={loading ? "—" : formatCurrencyBRL(totalUsersWalletBalanceRealOnly)}
          subtitle="Somente REAL (sem DEMO)"
          icon="👛"
        />

        <div className="adm-kpi-card adm-kpi-highlight">
          <div className="adm-kpi-top">
            <div className="adm-kpi-icon" aria-hidden="true">
              ⚡
            </div>
            <div className="adm-kpi-title">Saúde do sistema</div>
          </div>

          <div className="adm-health">
            <div className="adm-health-row">
              <span className="adm-health-label">Atualização</span>
              <span className="adm-health-value">{loading ? "—" : "Realtime + polling (8s)"}</span>
            </div>
            <div className="adm-health-row">
              <span className="adm-health-label">Range</span>
              <span className="adm-health-value">{rangeLabel}</span>
            </div>
            <div className="adm-health-row">
              <span className="adm-health-label">Fonte</span>
              <span className="adm-health-value">
                deposits/withdrawals/admin-trade-history-agg/users • {loading ? "—" : `${formatInt(totalUsers)} users`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <PerformanceChart points={chartPoints} height={240} />
    </div>
  );
}
