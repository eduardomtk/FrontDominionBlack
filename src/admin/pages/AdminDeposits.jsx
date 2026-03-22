// src/admin/pages/AdminDeposits.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/services/supabaseClient";

function toNumberSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatBRL(n) {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isoDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function copyText(text) {
  const s = String(text || "");
  if (!s) return Promise.resolve(false);

  return (async () => {
    try {
      await navigator.clipboard.writeText(s);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = s;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  })();
}

function normalizeStatus(s) {
  const v = String(s || "").toUpperCase().trim();
  if (!v) return "—";

  if (v === "CONFIRMED" || v === "RECEIVED") return v;
  if (v === "PENDING") return "PENDING";
  if (v === "REFUNDED") return "REFUNDED";
  if (v === "DELETED" || v === "CANCELED" || v === "CANCELLED") return "CANCELED";

  return v;
}

function statusPill(raw) {
  const v = normalizeStatus(raw);

  const isOk = v === "CONFIRMED" || v === "RECEIVED";
  const isPending = v === "PENDING";
  const isBad = v === "CANCELED" || v === "REFUNDED";

  const bg = isOk ? "#142b18" : isBad ? "#2b1414" : isPending ? "#141c2b" : "#0f141a";
  const color = isOk ? "#b7f7c0" : isBad ? "#ffb4b4" : isPending ? "#bcd6ff" : "#cbd5e1";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        border: "1px solid #2b2f36",
        background: bg,
        color,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: 0.2,
      }}
      title={String(raw || "")}
    >
      {v}
    </span>
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
    fontWeight: 800,
  };
}

const inputStyle = {
  height: 34,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid #2b2f36",
  background: "#0f141a",
  color: "#fff",
  outline: "none",
};

const boxStyle = {
  marginTop: 14,
  borderRadius: 12,
  border: "1px solid #2b2f36",
  background: "#0b1016",
  padding: 12,
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.60)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 9999,
};

const modalStyle = {
  width: "min(980px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  borderRadius: 14,
  border: "1px solid #2b2f36",
  background: "#0b1016",
  padding: 16,
  color: "#e5e7eb",
};

export default function AdminDeposits() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  // filtros
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [onlyProblems, setOnlyProblems] = useState(false);

  // período
  const [range, setRange] = useState("7d"); // today | 7d | 30d | custom
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDay(d);
  });
  const [toDate, setToDate] = useState(() => isoDay(new Date()));

  const rtRef = useRef(null);
  const loadRef = useRef(false);
  const debounceRef = useRef(null);

  function calcRangeISO() {
    const now = new Date();
    const start = new Date(now);

    if (range === "today") {
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString(), to: now.toISOString() };
    }

    if (range === "7d") {
      start.setDate(start.getDate() - 7);
      return { from: start.toISOString(), to: now.toISOString() };
    }

    if (range === "30d") {
      start.setDate(start.getDate() - 30);
      return { from: start.toISOString(), to: now.toISOString() };
    }

    // custom
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${toDate}T23:59:59.999Z`);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  const load = async () => {
    setError("");
    setLoading(true);
    loadRef.current = true;

    try {
      const { from, to } = calcRangeISO();

      let query = supabase
        .from("deposits")
        .select("id,user_id,amount,provider,provider_payment_id,status,credited,created_at,confirmed_at,credited_at")
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false })
        .limit(500);

      if (status && status !== "ALL") {
        query = query.eq("status", status);
      }

      const { data, error: err } = await query;
      if (err) throw err;

      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || "Erro ao carregar depósitos");
      setRows([]);
    } finally {
      setLoading(false);
      loadRef.current = false;
    }
  };

  const loadSilent = async () => {
    if (loadRef.current) return;
    try {
      await load();
    } catch {
      // load já trata
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, fromDate, toDate, status]);

  // realtime deposits
  useEffect(() => {
    if (rtRef.current) {
      supabase.removeChannel(rtRef.current);
      rtRef.current = null;
    }

    const ch = supabase
      .channel("admin:deposits:rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "deposits" }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          loadSilent();
        }, 450);
      })
      .subscribe();

    rtRef.current = ch;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      if (rtRef.current) {
        supabase.removeChannel(rtRef.current);
        rtRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, fromDate, toDate, status]);

  const filtered = useMemo(() => {
    const term = String(q || "").trim().toLowerCase();
    let list = rows;

    if (term) {
      list = list.filter((r) => {
        const id = String(r?.id || "").toLowerCase();
        const userId = String(r?.user_id || "").toLowerCase();
        const payId = String(r?.provider_payment_id || "").toLowerCase();
        const prov = String(r?.provider || "").toLowerCase();
        const st = String(r?.status || "").toLowerCase();
        return id.includes(term) || userId.includes(term) || payId.includes(term) || prov.includes(term) || st.includes(term);
      });
    }

    if (onlyProblems) {
      list = list.filter((r) => {
        const st = String(r?.status || "").toUpperCase();
        const credited = Boolean(r?.credited);
        const isPaid = st === "CONFIRMED" || st === "RECEIVED";
        return isPaid && !credited;
      });
    }

    return list;
  }, [rows, q, onlyProblems]);

  const kpis = useMemo(() => {
    let confirmedSum = 0;
    let pendingSum = 0;
    let canceledSum = 0;
    let refundedSum = 0;

    let confirmedCount = 0;
    let pendingCount = 0;
    let canceledCount = 0;
    let refundedCount = 0;

    let creditedCount = 0;
    let problemCount = 0;

    let confirmTimeTotalSec = 0;
    let confirmTimeN = 0;

    let creditTimeTotalSec = 0;
    let creditTimeN = 0;

    for (const r of rows || []) {
      const st = String(r?.status || "").toUpperCase();
      const amt = toNumberSafe(r?.amount) ?? 0;

      const isConfirmed = st === "CONFIRMED" || st === "RECEIVED";
      const isPending = st === "PENDING";
      const isRefunded = st === "REFUNDED";
      const isCanceled = st === "CANCELED" || st === "CANCELLED" || st === "DELETED";

      if (isConfirmed) {
        confirmedSum += amt;
        confirmedCount += 1;
      } else if (isPending) {
        pendingSum += amt;
        pendingCount += 1;
      } else if (isRefunded) {
        refundedSum += amt;
        refundedCount += 1;
      } else if (isCanceled) {
        canceledSum += amt;
        canceledCount += 1;
      }

      if (Boolean(r?.credited)) creditedCount += 1;
      if (isConfirmed && !Boolean(r?.credited)) problemCount += 1;

      if (r?.created_at && r?.confirmed_at) {
        const a = new Date(r.created_at).getTime();
        const b = new Date(r.confirmed_at).getTime();
        if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
          confirmTimeTotalSec += (b - a) / 1000;
          confirmTimeN += 1;
        }
      }

      if (r?.confirmed_at && r?.credited_at) {
        const a = new Date(r.confirmed_at).getTime();
        const b = new Date(r.credited_at).getTime();
        if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
          creditTimeTotalSec += (b - a) / 1000;
          creditTimeN += 1;
        }
      }
    }

    const ticketAvg = confirmedCount ? confirmedSum / confirmedCount : 0;
    const avgConfirmSec = confirmTimeN ? confirmTimeTotalSec / confirmTimeN : null;
    const avgCreditSec = creditTimeN ? creditTimeTotalSec / creditTimeN : null;

    return {
      confirmedSum,
      pendingSum,
      canceledSum,
      refundedSum,
      confirmedCount,
      pendingCount,
      canceledCount,
      refundedCount,
      creditedCount,
      problemCount,
      ticketAvg,
      avgConfirmSec,
      avgCreditSec,
    };
  }, [rows]);

  const series = useMemo(() => {
    const map = new Map();
    for (const r of rows || []) {
      const st = String(r?.status || "").toUpperCase();
      if (!(st === "CONFIRMED" || st === "RECEIVED")) continue;
      const day = r?.created_at ? isoDay(r.created_at) : null;
      if (!day) continue;
      const amt = toNumberSafe(r?.amount) ?? 0;
      map.set(day, (map.get(day) ?? 0) + amt);
    }

    const days = Array.from(map.keys()).sort().slice(-14);
    const items = days.map((d) => ({ day: d, sum: map.get(d) ?? 0 }));
    const max = items.reduce((m, it) => Math.max(m, it.sum), 0);

    return { items, max };
  }, [rows]);

  // detalhe
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const [events, setEvents] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // ✅ ledger do depósito
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerRow, setLedgerRow] = useState(null);

  // ✅ reprocessar
  const [reprocessBusy, setReprocessBusy] = useState(false);
  const [reprocessMsg, setReprocessMsg] = useState("");

  const detailRtRef = useRef(null);

  const loadLedgerForDeposit = async (depositId) => {
    if (!depositId) {
      setLedgerRow(null);
      return;
    }

    setLedgerLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("wallet_ledger")
        .select("id,user_id,account_type,delta,kind,deposit_id,created_at")
        .eq("deposit_id", depositId)
        .limit(1);

      if (err) throw err;
      const row = Array.isArray(data) && data.length ? data[0] : null;
      setLedgerRow(row);
    } catch (e) {
      console.warn("[AdminDeposits] load wallet_ledger error:", e?.message || e);
      setLedgerRow(null);
    } finally {
      setLedgerLoading(false);
    }
  };

  const openDetail = async (row) => {
    setDetail(row);
    setEvents([]);
    setDetailOpen(true);

    setDetailLoading(true);
    setLedgerRow(null);
    setReprocessMsg("");

    // ledger inicial
    await loadLedgerForDeposit(row?.id || null);

    try {
      const pid = row?.provider_payment_id ? String(row.provider_payment_id) : "";
      if (!pid) {
        setEvents([]);
        return;
      }

      const { data, error: err } = await supabase
        .from("webhook_logs")
        .select("id,provider,event,payment_id,status,raw,created_at")
        .eq("provider", "asaas")
        .eq("payment_id", pid)
        .order("created_at", { ascending: true })
        .limit(200);

      if (err) throw err;
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("[AdminDeposits] load webhook logs error:", e?.message || e);
      setEvents([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetail(null);
    setEvents([]);
    setDetailLoading(false);

    setLedgerRow(null);
    setLedgerLoading(false);

    setReprocessBusy(false);
    setReprocessMsg("");

    if (detailRtRef.current) {
      supabase.removeChannel(detailRtRef.current);
      detailRtRef.current = null;
    }
  };

  // realtime detalhe (deposits + webhook_logs daquele payment_id + wallet_ledger daquele deposit)
  useEffect(() => {
    if (!detailOpen || !detail?.id) return;

    if (detailRtRef.current) {
      supabase.removeChannel(detailRtRef.current);
      detailRtRef.current = null;
    }

    const pid = detail?.provider_payment_id ? String(detail.provider_payment_id) : "";
    const depId = String(detail.id);

    const ch = supabase
      .channel(`admin:deposit:detail:${detail.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deposits", filter: `id=eq.${detail.id}` },
        (payload) => {
          const next = payload?.new ?? null;
          if (next) setDetail((prev) => (prev ? { ...prev, ...next } : next));
        }
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "webhook_logs" }, (payload) => {
        const row = payload?.new ?? null;
        if (!row) return;
        if (pid && String(row.payment_id || "") !== pid) return;
        setEvents((prev) =>
          [...prev, row].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        );
      })
      // ✅ ledger realtime: quando inserir o lançamento do depósito, atualiza na hora
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_ledger" }, (payload) => {
        const row = payload?.new ?? null;
        if (!row) return;
        if (String(row.deposit_id || "") !== depId) return;
        setLedgerRow(row);
      })
      .subscribe();

    detailRtRef.current = ch;

    return () => {
      if (detailRtRef.current) {
        supabase.removeChannel(detailRtRef.current);
        detailRtRef.current = null;
      }
    };
  }, [detailOpen, detail?.id, detail?.provider_payment_id]);

  const statusOptions = useMemo(() => {
    return [
      { value: "ALL", label: "Todos" },
      { value: "PENDING", label: "PENDING" },
      { value: "CONFIRMED", label: "CONFIRMED" },
      { value: "RECEIVED", label: "RECEIVED" },
      { value: "CANCELED", label: "CANCELED" },
      { value: "REFUNDED", label: "REFUNDED" },
      { value: "DELETED", label: "DELETED" },
    ];
  }, []);

  function timeFmt(sec) {
    if (sec == null) return "—";
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m <= 0) return `${r}s`;
    return `${m}m ${String(r).padStart(2, "0")}s`;
  }

  const canReprocess = useMemo(() => {
    const st = String(detail?.status || "").toUpperCase();
    const isPaid = st === "CONFIRMED" || st === "RECEIVED";
    return Boolean(detail?.id && isPaid);
  }, [detail?.id, detail?.status]);

  const doReprocessCredit = async () => {
    if (!detail?.id) return;
    if (reprocessBusy) return;

    setReprocessMsg("");
    setReprocessBusy(true);

    try {
      const { data, error: err } = await supabase.rpc("apply_deposit_credit_admin", {
        p_deposit_id: detail.id,
      });

      if (err) throw err;

      const ok = data?.ok === true;
      const already = data?.already_credited === true;

      if (ok && already) setReprocessMsg("Reprocessamento: OK (já estava creditado).");
      else if (ok) setReprocessMsg("Reprocessamento: OK (crédito aplicado).");
      else setReprocessMsg(`Reprocessamento: falhou (${data?.error || "erro"}).`);

      // refresh pós RPC (detalhe + ledger)
      await loadLedgerForDeposit(detail.id);
      await loadSilent();
    } catch (e) {
      setReprocessMsg(`Reprocessamento: erro (${String(e?.message || e)}).`);
    } finally {
      setReprocessBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0 }}>Depósitos</h1>

          <button onClick={load} style={btnStyle("#151a21")} disabled={loading} title="Forçar atualização">
            Atualizar
          </button>

          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={onlyProblems}
              onChange={(e) => setOnlyProblems(Boolean(e.target.checked))}
              disabled={loading}
            />
            <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 800 }}>
              Somente problemas (pago e não creditado)
            </span>
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 460 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por user_id, payment_id, status..."
            style={{ ...inputStyle, width: "100%" }}
          />
          <div style={{ color: "#9aa4b2", fontSize: 12, whiteSpace: "nowrap" }}>
            Total: <b style={{ color: "#e5e7eb" }}>{filtered.length}</b>
          </div>
        </div>
      </div>

      <p style={{ color: "#9aa4b2", marginTop: 8 }}>
        Realtime em <b>deposits</b> + timeline via <b>webhook_logs</b>.
      </p>

      {/* filtros */}
      <div style={{ ...boxStyle, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900 }}>Período</span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            style={{ ...inputStyle, height: 34, padding: "0 8px" }}
          >
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {range === "custom" ? (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900 }}>De</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900 }}>Até</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={inputStyle} />
            </div>
          </>
        ) : null}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900 }}>Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ ...inputStyle, height: 34, padding: "0 8px" }}
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
        <KpiCard title="Confirmados" value={`R$ ${formatBRL(kpis.confirmedSum)}`} subtitle={`${kpis.confirmedCount} depósitos`} />
        <KpiCard title="Pendentes" value={`R$ ${formatBRL(kpis.pendingSum)}`} subtitle={`${kpis.pendingCount} depósitos`} />
        <KpiCard title="Cancelados" value={`R$ ${formatBRL(kpis.canceledSum)}`} subtitle={`${kpis.canceledCount} depósitos`} />
        <KpiCard title="Estornados" value={`R$ ${formatBRL(kpis.refundedSum)}`} subtitle={`${kpis.refundedCount} depósitos`} />
        <KpiCard title="Ticket médio (confirmados)" value={`R$ ${formatBRL(kpis.ticketAvg)}`} subtitle="média no período" />
        <KpiCard title="Tempo médio" value={`${timeFmt(kpis.avgConfirmSec)}`} subtitle="criado → confirmado" />
        <KpiCard title="Tempo médio" value={`${timeFmt(kpis.avgCreditSec)}`} subtitle="confirmado → creditado" />
        <KpiCard title="Problemas" value={`${kpis.problemCount}`} subtitle="pago e não creditado" danger={kpis.problemCount > 0} />
      </div>

      {/* gráfico simples */}
      <div style={{ ...boxStyle, marginTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Confirmados por dia (últimos 14 dias do período)</div>
        {series.items.length === 0 ? (
          <div style={{ color: "#9aa4b2", fontSize: 12 }}>Sem dados confirmados no período.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {series.items.map((it) => {
              const pct = series.max > 0 ? clamp((it.sum / series.max) * 100, 0, 100) : 0;
              return (
                <div key={it.day} style={{ display: "grid", gridTemplateColumns: "100px 1fr 140px", gap: 10, alignItems: "center" }}>
                  <div style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 800 }}>{it.day}</div>
                  <div style={{ height: 10, borderRadius: 999, border: "1px solid #20242c", background: "#0f141a", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: "rgba(59,130,246,0.85)" }} />
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, fontWeight: 900 }}>R$ {formatBRL(it.sum)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* tabela */}
      {error ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #442", background: "#221", color: "#ffd6d6" }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <p style={{ marginTop: 16 }}>Carregando...</p>
      ) : (
        <div style={{ marginTop: 12, borderRadius: 12, border: "1px solid #2b2f36", overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "170px 1fr 0.8fr 0.9fr 0.8fr 0.9fr 0.7fr",
              padding: "12px 14px",
              background: "#0f141a",
              color: "#cbd5e1",
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            <div>Data</div>
            <div>Usuário / IDs</div>
            <div>Valor</div>
            <div>Status</div>
            <div>Creditado</div>
            <div>Provider</div>
            <div>Ações</div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: 14, color: "#9aa4b2" }}>Nenhum depósito encontrado.</div>
          ) : (
            filtered.map((r) => {
              const id = String(r?.id || "");
              const uid = String(r?.user_id || "");
              const pid = String(r?.provider_payment_id || "");
              const amt = toNumberSafe(r?.amount) ?? 0;

              const created = r?.created_at ? new Date(r.created_at) : null;
              const createdLabel = created ? created.toLocaleString("pt-BR") : "—";

              const credited = Boolean(r?.credited);
              const stU = String(r?.status || "").toUpperCase();
              const isProblem = (stU === "CONFIRMED" || stU === "RECEIVED") && !credited;

              return (
                <div
                  key={id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "170px 1fr 0.8fr 0.9fr 0.8fr 0.9fr 0.7fr",
                    padding: "12px 14px",
                    borderTop: "1px solid #20242c",
                    background: isProblem ? "rgba(255, 107, 107, 0.06)" : "#0b1016",
                    color: "#e5e7eb",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 800 }}>{createdLabel}</div>

                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontWeight: 900, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ color: "#e5e7eb" }}>{uid ? `${uid.slice(0, 8)}…` : "—"}</span>
                      <button style={btnStyle("#1a202a")} onClick={() => copyText(uid)} title="Copiar user_id">
                        Copiar user_id
                      </button>
                    </div>
                    <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span>payment_id: {pid ? `${pid.slice(0, 12)}…` : "—"}</span>
                      <button style={btnStyle("#151a21")} onClick={() => copyText(pid)} title="Copiar payment_id">
                        Copiar
                      </button>
                    </div>
                  </div>

                  <div style={{ fontWeight: 900 }}>R$ {formatBRL(amt)}</div>
                  <div>{statusPill(r?.status)}</div>

                  <div>
                    {credited ? <span style={{ fontWeight: 900, color: "#b7f7c0" }}>SIM</span> : <span style={{ fontWeight: 900, color: "#ffb4b4" }}>NÃO</span>}
                    <div style={{ color: "#9aa4b2", fontSize: 11 }}>
                      {r?.credited_at ? new Date(r.credited_at).toLocaleString("pt-BR") : "—"}
                    </div>
                  </div>

                  <div style={{ color: "#cbd5e1", fontWeight: 800 }}>{String(r?.provider || "—")}</div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => openDetail(r)} style={btnStyle("#1a202a")}>
                      Detalhes
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODAL DETALHE */}
      {detailOpen && detail ? (
        <div onClick={closeDetail} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Detalhe do Depósito</div>
                <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4 }}>
                  id: {String(detail?.id || "").slice(0, 8)}… • user_id: {String(detail?.user_id || "").slice(0, 8)}… • provider:{" "}
                  {String(detail?.provider || "—")}
                </div>
              </div>

              <button onClick={closeDetail} style={{ ...btnStyle("#0f141a"), width: 40 }} title="Fechar">
                ✕
              </button>
            </div>

            <div style={{ marginTop: 14, borderTop: "1px solid #20242c", paddingTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Info label="Status">{statusPill(detail?.status)}</Info>
                <Info label="Valor">R$ {formatBRL(detail?.amount)}</Info>
                <Info label="Credited">{Boolean(detail?.credited) ? "true" : "false"}</Info>

                <Info label="provider_payment_id">
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 900 }}>{String(detail?.provider_payment_id || "—")}</span>
                    <button style={btnStyle("#1a202a")} onClick={() => copyText(detail?.provider_payment_id)}>
                      Copiar
                    </button>
                  </div>
                </Info>

                <Info label="Criado em">{detail?.created_at ? new Date(detail.created_at).toLocaleString("pt-BR") : "—"}</Info>
                <Info label="Confirmado em">{detail?.confirmed_at ? new Date(detail.confirmed_at).toLocaleString("pt-BR") : "—"}</Info>
                <Info label="Creditado em">{detail?.credited_at ? new Date(detail.credited_at).toLocaleString("pt-BR") : "—"}</Info>
              </div>

              {/* ✅ AÇÕES DO ADMIN (idempotente) */}
              <div style={{ ...boxStyle, marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>Ações</div>

                <button
                  type="button"
                  style={btnStyle("#1a202a")}
                  onClick={doReprocessCredit}
                  disabled={!canReprocess || reprocessBusy}
                  title={!canReprocess ? "Somente depósitos pagos (CONFIRMED/RECEIVED)" : "Executa a RPC idempotente"}
                >
                  {reprocessBusy ? "Reprocessando..." : "Reprocessar crédito"}
                </button>

                {reprocessMsg ? (
                  <div style={{ color: reprocessMsg.includes("erro") || reprocessMsg.includes("falhou") ? "#ffb4b4" : "#b7f7c0", fontSize: 12, fontWeight: 900 }}>
                    {reprocessMsg}
                  </div>
                ) : null}
              </div>

              {/* ✅ LEDGER (prova do crédito) */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Ledger (wallet_ledger)</div>

                {ledgerLoading ? (
                  <div style={{ color: "#9aa4b2" }}>Carregando ledger...</div>
                ) : !ledgerRow ? (
                  <div style={{ color: "#ffb4b4", fontWeight: 900 }}>
                    Nenhum lançamento encontrado para este depósito (deposit_id).
                    <div style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 800, marginTop: 4 }}>
                      Se o depósito estiver pago, use <b>Reprocessar crédito</b>.
                    </div>
                  </div>
                ) : (
                  <div style={{ borderRadius: 12, border: "1px solid #20242c", overflow: "hidden" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "170px 1fr 0.6fr 0.6fr 0.8fr",
                        padding: "10px 12px",
                        background: "#0f141a",
                        color: "#cbd5e1",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      <div>Data</div>
                      <div>user_id</div>
                      <div>Conta</div>
                      <div>Kind</div>
                      <div>Delta</div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "170px 1fr 0.6fr 0.6fr 0.8fr",
                        padding: "10px 12px",
                        borderTop: "1px solid #20242c",
                        background: "#0b1016",
                        color: "#e5e7eb",
                        alignItems: "center",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ color: "#cbd5e1", fontWeight: 800 }}>
                        {ledgerRow?.created_at ? new Date(ledgerRow.created_at).toLocaleString("pt-BR") : "—"}
                      </div>

                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 900 }}>{String(ledgerRow?.user_id || "").slice(0, 8)}…</span>
                        <button style={btnStyle("#151a21")} onClick={() => copyText(ledgerRow?.user_id)}>
                          Copiar
                        </button>
                      </div>

                      <div style={{ fontWeight: 900 }}>{String(ledgerRow?.account_type || "—")}</div>
                      <div style={{ fontWeight: 900 }}>{String(ledgerRow?.kind || "—")}</div>
                      <div style={{ fontWeight: 900 }}>R$ {formatBRL(ledgerRow?.delta)}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Timeline (webhook_logs)</div>

                {detailLoading ? (
                  <div style={{ color: "#9aa4b2" }}>Carregando timeline...</div>
                ) : events.length === 0 ? (
                  <div style={{ color: "#9aa4b2" }}>Sem eventos registrados para este payment_id.</div>
                ) : (
                  <div style={{ borderRadius: 12, border: "1px solid #20242c", overflow: "hidden" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "170px 1fr 0.8fr 0.7fr",
                        padding: "10px 12px",
                        background: "#0f141a",
                        color: "#cbd5e1",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      <div>Data</div>
                      <div>Evento</div>
                      <div>Status</div>
                      <div>Raw</div>
                    </div>

                    {events.map((ev) => {
                      const t = ev?.created_at ? new Date(ev.created_at).toLocaleString("pt-BR") : "—";
                      const e = String(ev?.event || "—");
                      const st = String(ev?.status || "—");

                      return (
                        <div
                          key={String(ev?.id)}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "170px 1fr 0.8fr 0.7fr",
                            padding: "10px 12px",
                            borderTop: "1px solid #20242c",
                            background: "#0b1016",
                            color: "#e5e7eb",
                            alignItems: "center",
                            fontSize: 12,
                          }}
                        >
                          <div style={{ color: "#cbd5e1", fontWeight: 800 }}>{t}</div>
                          <div style={{ fontWeight: 900 }}>{e}</div>
                          <div style={{ color: "#9aa4b2", fontWeight: 900 }}>{st}</div>
                          <div>
                            <button
                              style={btnStyle("#151a21")}
                              onClick={() => copyText(JSON.stringify(ev?.raw ?? {}, null, 2))}
                              title="Copiar JSON raw"
                            >
                              Copiar JSON
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 14, color: "#9aa4b2", fontSize: 12 }}>
                Nota: “Reprocessar crédito” chama a RPC <b>apply_deposit_credit_admin</b> (idempotente). Se o webhook repetir, não duplica saldo.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({ title, value, subtitle, danger = false }) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid #2b2f36",
        background: danger ? "rgba(255, 107, 107, 0.08)" : "#0b1016",
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6, color: "#e5e7eb" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#9aa4b2", marginTop: 4 }}>{subtitle}</div>
    </div>
  );
}

function Info({ label, children }) {
  return (
    <div style={{ border: "1px solid #20242c", borderRadius: 12, padding: 12, background: "#0f141a" }}>
      <div style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900, marginBottom: 6 }}>{label}</div>
      <div style={{ color: "#e5e7eb" }}>{children}</div>
    </div>
  );
}
