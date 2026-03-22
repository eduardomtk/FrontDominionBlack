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
  return v || "—";
}

function statusLabel(raw) {
  const v = normalizeStatus(raw);
  if (v === "APPROVED") return "EFETUADO";
  if (v === "PENDING") return "PENDENTE";
  if (v === "REVIEW") return "REVISÃO";
  if (v === "PROCESSING") return "PROCESSANDO";
  if (v === "REJECTED") return "REJEITADO";
  if (v === "CANCELED") return "CANCELADO";
  if (v === "FAILED") return "FALHOU";
  if (v === "REVERSED") return "ESTORNADO";
  if (v === "PAID") return "PAGO";
  return v;
}

function statusPill(raw) {
  const v = normalizeStatus(raw);
  const label = statusLabel(raw);

  const ok = v === "PAID";
  const pend = v === "PENDING" || v === "REVIEW" || v === "APPROVED" || v === "PROCESSING";
  const bad = v === "REJECTED" || v === "CANCELED" || v === "FAILED" || v === "REVERSED";

  const bg = ok ? "#142b18" : bad ? "#2b1414" : pend ? "#141c2b" : "#0f141a";
  const color = ok ? "#b7f7c0" : bad ? "#ffb4b4" : pend ? "#bcd6ff" : "#cbd5e1";

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
      {label}
    </span>
  );
}

function affiliatePill() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 28,
        padding: "0 12px",
        borderRadius: 999,
        border: "1px solid rgba(245, 158, 11, 0.55)",
        background: "rgba(245, 158, 11, 0.14)",
        color: "#fbbf24",
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        boxShadow: "inset 0 0 0 1px rgba(245, 158, 11, 0.08)",
      }}
      title="Saque de afiliado (simulado, sem payout real)"
    >
      AFILIADO
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

function secondsBetween(a, b) {
  const A = a ? new Date(a).getTime() : NaN;
  const B = b ? new Date(b).getTime() : NaN;
  if (!Number.isFinite(A) || !Number.isFinite(B) || B < A) return null;
  return (B - A) / 1000;
}

function timeFmt(sec) {
  if (sec == null) return "—";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

function ageLabel(fromIso) {
  const t = fromIso ? new Date(fromIso).getTime() : NaN;
  if (!Number.isFinite(t)) return "—";
  const now = Date.now();
  const diff = Math.max(0, now - t);
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function maskDest(s) {
  const v = String(s || "").trim();
  if (!v) return "—";
  if (v.length <= 8) return v;
  return `${v.slice(0, 4)}***${v.slice(-3)}`;
}

function resolveProfileName(profile) {
  if (!profile || typeof profile !== "object") return "—";

  const directName = String(profile.name || "").trim();
  if (directName) return directName;

  const firstName = String(profile.first_name || "").trim();
  const lastName = String(profile.last_name || "").trim();
  const joined = `${firstName} ${lastName}`.trim();
  if (joined) return joined;

  const nickname = String(profile.nickname || "").trim();
  if (nickname) return nickname;

  return "—";
}

export default function AdminWithdraws() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [method, setMethod] = useState("ALL");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const [range, setRange] = useState("7d");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDay(d);
  });
  const [toDate, setToDate] = useState(() => isoDay(new Date()));

  const rtRef = useRef(null);
  const loadRef = useRef(false);
  const debounceRef = useRef(null);
  const pollRef = useRef(null);

  const pageRef = useRef(null);

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

    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${toDate}T23:59:59.999Z`);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  const loadInternal = async ({ silent = false } = {}) => {
    if (loadRef.current) return;

    if (!silent) {
      setError("");
      setLoading(true);
    }
    loadRef.current = true;

    try {
      const { from, to } = calcRangeISO();

      let query = supabase
        .from("withdrawals")
        .select(
          "id,user_id,amount_gross,fee_percent,fee_amount,amount_net,account_type,method,destination,destination_masked,status,provider,provider_payout_id,txid,requested_at,approved_at,paid_at,approved_by,paid_by,created_at,updated_at,risk_score,risk_flags,is_affiliate_withdraw,withdrawal_scope,simulated_success"
        )
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false })
        .limit(500);

      if (status && status !== "ALL") query = query.eq("status", status);
      if (method && method !== "ALL") query = query.eq("method", method);

      const { data, error: err } = await query;
      if (err) throw err;

      const baseRows = Array.isArray(data) ? data : [];
      const userIds = Array.from(
        new Set(
          baseRows
            .map((r) => String(r?.user_id || "").trim())
            .filter(Boolean)
        )
      );

      let profileMap = new Map();

      if (userIds.length > 0) {
        const { data: profilesData, error: profilesErr } = await supabase
          .from("profiles")
          .select("id,name,first_name,last_name,nickname")
          .in("id", userIds);

        if (profilesErr) throw profilesErr;

        profileMap = new Map(
          (Array.isArray(profilesData) ? profilesData : []).map((p) => [String(p.id), p])
        );
      }

      const enrichedRows = baseRows.map((row) => {
        const profile = profileMap.get(String(row?.user_id || "")) || null;
        return {
          ...row,
          profile_name: resolveProfileName(profile),
        };
      });

      setRows(enrichedRows);
      if (!silent) setError("");
    } catch (e) {
      if (!silent) {
        setError(e?.message || "Erro ao carregar saques");
        setRows([]);
      }
    } finally {
      if (!silent) setLoading(false);
      loadRef.current = false;
    }
  };

  const load = async () => loadInternal({ silent: false });

  const loadSilent = async () => {
    await loadInternal({ silent: true });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, fromDate, toDate, status, method]);

  useEffect(() => {
    if (rtRef.current) {
      supabase.removeChannel(rtRef.current);
      rtRef.current = null;
    }

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    const ch = supabase
      .channel("admin:withdrawals:rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawals" }, (payload) => {
        try {
          console.log("[AdminWithdraws][RT] withdrawals change:", payload?.eventType, payload?.new?.id || payload?.old?.id);
        } catch {
          //
        }

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          loadSilent();
        }, 450);
      })
      .subscribe((statusValue) => {
        console.log("[AdminWithdraws][RT] subscribe status:", statusValue);
      });

    rtRef.current = ch;

    pollRef.current = setInterval(() => {
      loadSilent();
    }, 6000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (rtRef.current) {
        supabase.removeChannel(rtRef.current);
        rtRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, fromDate, toDate, status, method]);

  const filtered = useMemo(() => {
    const term = String(q || "").trim().toLowerCase();
    let list = rows;

    if (term) {
      list = list.filter((r) => {
        const id = String(r?.id || "").toLowerCase();
        const userId = String(r?.user_id || "").toLowerCase();
        const st = String(r?.status || "").toLowerCase();
        const dest = String(r?.destination || "").toLowerCase();
        const txid = String(r?.txid || "").toLowerCase();
        const prov = String(r?.provider || "").toLowerCase();
        const payout = String(r?.provider_payout_id || "").toLowerCase();
        const scope = String(r?.withdrawal_scope || "").toLowerCase();
        const aff = r?.is_affiliate_withdraw ? "afiliado" : "";
        const profileName = String(r?.profile_name || "").toLowerCase();

        return (
          id.includes(term) ||
          userId.includes(term) ||
          st.includes(term) ||
          dest.includes(term) ||
          txid.includes(term) ||
          prov.includes(term) ||
          payout.includes(term) ||
          scope.includes(term) ||
          aff.includes(term) ||
          profileName.includes(term)
        );
      });
    }

    if (onlyProblems) {
      list = list.filter((r) => {
        const st = String(r?.status || "").toUpperCase();
        if (st === "FAILED") return true;
        if (st === "APPROVED") {
          const base = r?.approved_at || r?.requested_at || r?.created_at;
          const t = base ? new Date(base).getTime() : NaN;
          if (!Number.isFinite(t)) return false;
          return Date.now() - t > 30 * 60 * 1000;
        }
        if (st === "PROCESSING") {
          const base = r?.updated_at || r?.approved_at || r?.created_at;
          const t = base ? new Date(base).getTime() : NaN;
          if (!Number.isFinite(t)) return false;
          return Date.now() - t > 30 * 60 * 1000;
        }
        return false;
      });
    }

    return list;
  }, [rows, q, onlyProblems]);

  const kpis = useMemo(() => {
    const sums = {
      PENDING: 0,
      REVIEW: 0,
      APPROVED: 0,
      PROCESSING: 0,
      PAID: 0,
      REJECTED: 0,
      CANCELED: 0,
      FAILED: 0,
      REVERSED: 0,
    };

    const counts = {
      PENDING: 0,
      REVIEW: 0,
      APPROVED: 0,
      PROCESSING: 0,
      PAID: 0,
      REJECTED: 0,
      CANCELED: 0,
      FAILED: 0,
      REVERSED: 0,
    };

    let avgReqToApprTotal = 0;
    let avgReqToApprN = 0;

    let avgApprToPaidTotal = 0;
    let avgApprToPaidN = 0;

    for (const r of rows || []) {
      const st = normalizeStatus(r?.status);
      const amt = toNumberSafe(r?.amount_gross) ?? 0;

      if (sums[st] != null) {
        sums[st] += amt;
        counts[st] += 1;
      }

      const s1 = secondsBetween(r?.requested_at || r?.created_at, r?.approved_at);
      if (s1 != null) {
        avgReqToApprTotal += s1;
        avgReqToApprN += 1;
      }

      const s2 = secondsBetween(r?.approved_at, r?.paid_at);
      if (s2 != null) {
        avgApprToPaidTotal += s2;
        avgApprToPaidN += 1;
      }
    }

    return {
      sums,
      counts,
      avgReqToApprSec: avgReqToApprN ? avgReqToApprTotal / avgReqToApprN : null,
      avgApprToPaidSec: avgApprToPaidN ? avgApprToPaidTotal / avgApprToPaidN : null,
    };
  }, [rows]);

  const series = useMemo(() => {
    const map = new Map();
    for (const r of rows || []) {
      const st = String(r?.status || "").toUpperCase();
      if (st !== "PAID") continue;
      const day = r?.created_at ? isoDay(r.created_at) : null;
      if (!day) continue;
      const amt = toNumberSafe(r?.amount_gross) ?? 0;
      map.set(day, (map.get(day) ?? 0) + amt);
    }

    const days = Array.from(map.keys()).sort().slice(-14);
    const items = days.map((d) => ({ day: d, sum: map.get(d) ?? 0 }));
    const max = items.reduce((m, it) => Math.max(m, it.sum), 0);

    return { items, max };
  }, [rows]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const [events, setEvents] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const [reason, setReason] = useState("");
  const [providerPayoutId, setProviderPayoutId] = useState("");

  const detailRtRef = useRef(null);

  const loadEventsForWithdraw = async (withdrawId) => {
    if (!withdrawId) {
      setEvents([]);
      return;
    }
    setDetailLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("withdraw_events")
        .select("id,withdraw_id,event_type,actor_type,actor_id,payload,request_id,created_at")
        .eq("withdraw_id", withdrawId)
        .order("created_at", { ascending: true })
        .limit(300);

      if (err) throw err;
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("[AdminWithdraws] load withdraw_events error:", e?.message || e);
      setEvents([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadLedgerForWithdraw = async (withdrawId) => {
    if (!withdrawId) {
      setLedgerRows([]);
      return;
    }
    setLedgerLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("wallet_ledger")
        .select("id,user_id,account_type,delta,kind,withdraw_id,request_id,created_at,meta")
        .eq("withdraw_id", withdrawId)
        .order("created_at", { ascending: true })
        .limit(50);

      if (err) throw err;
      setLedgerRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("[AdminWithdraws] load wallet_ledger error:", e?.message || e);
      setLedgerRows([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  const loadProfileNameForUser = async (userId) => {
    const uid = String(userId || "").trim();
    if (!uid) return "—";

    try {
      const { data, error: err } = await supabase
        .from("profiles")
        .select("id,name,first_name,last_name,nickname")
        .eq("id", uid)
        .maybeSingle();

      if (err) throw err;
      return resolveProfileName(data);
    } catch (e) {
      console.warn("[AdminWithdraws] load profile name error:", e?.message || e);
      return "—";
    }
  };

  const openDetail = async (row) => {
    const profileName =
      row?.profile_name && String(row.profile_name).trim()
        ? row.profile_name
        : await loadProfileNameForUser(row?.user_id);

    setDetail({
      ...row,
      profile_name: profileName,
    });
    setDetailOpen(true);

    setEvents([]);
    setLedgerRows([]);

    setActionBusy(false);
    setActionMsg("");

    setReason("");
    setProviderPayoutId(String(row?.provider_payout_id || ""));

    await Promise.all([loadEventsForWithdraw(row?.id || null), loadLedgerForWithdraw(row?.id || null)]);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetail(null);
    setEvents([]);
    setLedgerRows([]);
    setDetailLoading(false);
    setLedgerLoading(false);

    setActionBusy(false);
    setActionMsg("");

    setReason("");
    setProviderPayoutId("");

    if (detailRtRef.current) {
      supabase.removeChannel(detailRtRef.current);
      detailRtRef.current = null;
    }
  };

  useEffect(() => {
    if (!detailOpen || !detail?.id) return;

    if (detailRtRef.current) {
      supabase.removeChannel(detailRtRef.current);
      detailRtRef.current = null;
    }

    const wid = String(detail.id);

    const ch = supabase
      .channel(`admin:withdraw:detail:${wid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawals", filter: `id=eq.${wid}` }, (payload) => {
        const next = payload?.new ?? null;
        if (next) {
          setDetail((prev) => (prev ? { ...prev, ...next } : next));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "withdraw_events" }, (payload) => {
        const row = payload?.new ?? null;
        if (!row) return;
        if (String(row.withdraw_id || "") !== wid) return;
        setEvents((prev) =>
          [...prev, row].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        );
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_ledger" }, (payload) => {
        const row = payload?.new ?? null;
        if (!row) return;
        if (String(row.withdraw_id || "") !== wid) return;
        setLedgerRows((prev) =>
          [...prev, row].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        );
      })
      .subscribe((statusValue) => {
        console.log("[AdminWithdraws][RT] detail subscribe status:", statusValue);
      });

    detailRtRef.current = ch;

    return () => {
      if (detailRtRef.current) {
        supabase.removeChannel(detailRtRef.current);
        detailRtRef.current = null;
      }
    };
  }, [detailOpen, detail?.id]);

  const statusOptions = useMemo(() => {
    return [
      { value: "ALL", label: "Todos" },
      { value: "PENDING", label: "Pendente" },
      { value: "REVIEW", label: "Em revisão" },
      { value: "APPROVED", label: "Efetuado" },
      { value: "PROCESSING", label: "Processando" },
      { value: "PAID", label: "Pago" },
      { value: "REJECTED", label: "Rejeitado" },
      { value: "CANCELED", label: "Cancelado" },
      { value: "FAILED", label: "Falhou" },
      { value: "REVERSED", label: "Estornado" },
    ];
  }, []);

  const methodOptions = useMemo(() => {
    return [
      { value: "ALL", label: "Todos" },
      { value: "PIX", label: "PIX" },
      { value: "USDT", label: "USDT" },
      { value: "CRYPTO", label: "CRYPTO" },
    ];
  }, []);

  const canAction = useMemo(() => {
    const st = String(detail?.status || "").toUpperCase();
    const isAffiliate = Boolean(detail?.is_affiliate_withdraw);

    return {
      canReview: st === "PENDING",
      canApprove: st === "PENDING" || st === "REVIEW",
      canProcessing: !isAffiliate && st === "APPROVED",
      canReject: st === "PENDING" || st === "REVIEW" || st === "APPROVED",
      canCancel: st === "PENDING" || st === "REVIEW" || st === "APPROVED",
      canFailed: !isAffiliate && (st === "APPROVED" || st === "PROCESSING"),
    };
  }, [detail?.status, detail?.is_affiliate_withdraw]);

  const doAdminAction = async (action) => {
    if (!detail?.id) return;
    if (actionBusy) return;

    setActionMsg("");
    setActionBusy(true);

    const upperAction = String(action || "").trim().toUpperCase();
    const isAffiliate = Boolean(detail?.is_affiliate_withdraw);

    try {
      let adminId = null;
      try {
        const { data } = await supabase.auth.getUser();
        adminId = data?.user?.id || null;
      } catch {
        adminId = null;
      }

      const rid = `ui_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      console.log("[AdminWithdraws][ACTION]", { upperAction, isAffiliate, withdrawId: detail.id });

      let data = null;
      let err = null;

      if (isAffiliate && upperAction === "APPROVE") {
        const rpcPayload = {
          p_withdraw_id: detail.id,
          p_admin_id: adminId,
          p_request_id: rid,
          p_reason: reason ? String(reason).trim() : null,
        };

        console.log("[AdminWithdraws][RPC] admin_affiliate_withdraw_approve ->", rpcPayload);

        const response = await supabase.rpc("admin_affiliate_withdraw_approve", rpcPayload);
        data = response.data;
        err = response.error;
      } else {
        const payload = {
          p_withdraw_id: detail.id,
          p_action: upperAction,
          p_admin_id: adminId,
          p_request_id: rid,
          p_reason: reason ? String(reason).trim() : null,
          p_provider_payout_id: providerPayoutId ? String(providerPayoutId).trim() : null,
          p_txid: null,
        };

        console.log("[AdminWithdraws][RPC] admin_withdraw_transition ->", payload);

        const response = await supabase.rpc("admin_withdraw_transition", payload);
        data = response.data;
        err = response.error;
      }

      console.log("[AdminWithdraws][RPC] response:", { data, err });

      if (err) throw err;

      const ok = data?.ok === true;
      if (!ok) {
        const msg = data?.error ? String(data.error) : "Falha";
        setActionMsg(`Ação: falhou (${upperAction}) • motivo: ${msg}`);
      } else {
        if (isAffiliate && upperAction === "APPROVE") {
          setActionMsg("Ação: OK (APPROVE) • saque afiliado finalizado como sucesso simulado");
        } else {
          setActionMsg(`Ação: OK (${upperAction})`);
        }
      }

      await Promise.all([loadSilent(), loadEventsForWithdraw(detail.id), loadLedgerForWithdraw(detail.id)]);
    } catch (e) {
      const msg = String(e?.message || e);
      setActionMsg(`Ação: erro (${upperAction}) • ${msg}`);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div
      ref={pageRef}
      style={{
        overflowAnchor: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0 }}>Saques</h1>

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
              Somente problemas (travados/FAILED)
            </span>
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 460 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por user_id, nome, withdraw_id, destino, txid, status, afiliado..."
            style={{ ...inputStyle, width: "100%" }}
          />
          <div style={{ color: "#9aa4b2", fontSize: 12, whiteSpace: "nowrap" }}>
            Total: <b style={{ color: "#e5e7eb" }}>{filtered.length}</b>
          </div>
        </div>
      </div>

      <p style={{ color: "#9aa4b2", marginTop: 8 }}>
        Realtime em <b>withdrawals</b> + timeline via <b>withdraw_events</b> + prova via <b>wallet_ledger</b>.
        <span style={{ marginLeft: 8, color: "#cbd5e1", fontWeight: 900 }}>
          (Auto-refresh ativo a cada ~6s como fallback)
        </span>
      </p>

      <div style={{ ...boxStyle, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900 }}>Período</span>
          <select value={range} onChange={(e) => setRange(e.target.value)} style={{ ...inputStyle, height: 34, padding: "0 8px" }}>
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
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle, height: 34, padding: "0 8px" }}>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900 }}>Método</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ ...inputStyle, height: 34, padding: "0 8px" }}>
            {methodOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
        <KpiCard title="Pendente" value={`R$ ${formatBRL(kpis.sums.PENDING)}`} subtitle={`${kpis.counts.PENDING} saques`} />
        <KpiCard title="Em revisão" value={`R$ ${formatBRL(kpis.sums.REVIEW)}`} subtitle={`${kpis.counts.REVIEW} saques`} />
        <KpiCard title="Efetuado" value={`R$ ${formatBRL(kpis.sums.APPROVED)}`} subtitle={`${kpis.counts.APPROVED} saques`} />
        <KpiCard title="Processando" value={`R$ ${formatBRL(kpis.sums.PROCESSING)}`} subtitle={`${kpis.counts.PROCESSING} saques`} />
        <KpiCard title="Pago" value={`R$ ${formatBRL(kpis.sums.PAID)}`} subtitle={`${kpis.counts.PAID} saques`} />
        <KpiCard title="Falhou" value={`R$ ${formatBRL(kpis.sums.FAILED)}`} subtitle={`${kpis.counts.FAILED} saques`} danger={kpis.counts.FAILED > 0} />
        <KpiCard title="Tempo médio" value={`${timeFmt(kpis.avgReqToApprSec)}`} subtitle="solicitado → efetuado" />
        <KpiCard title="Tempo médio" value={`${timeFmt(kpis.avgApprToPaidSec)}`} subtitle="efetuado → pago" />
      </div>

      <div style={{ ...boxStyle, marginTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Pagos por dia (últimos 14 dias do período)</div>
        {series.items.length === 0 ? (
          <div style={{ color: "#9aa4b2", fontSize: 12 }}>Sem saques pagos no período.</div>
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
              gridTemplateColumns: "160px 1.2fr 0.8fr 0.9fr 0.9fr 0.8fr 0.7fr",
              padding: "12px 14px",
              background: "#0f141a",
              color: "#cbd5e1",
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            <div>Data / Idade</div>
            <div>Usuário / Destino</div>
            <div>Valor</div>
            <div>Status</div>
            <div>Método</div>
            <div>Risco</div>
            <div>Ações</div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: 14, color: "#9aa4b2" }}>Nenhum saque encontrado.</div>
          ) : (
            filtered.map((r) => {
              const id = String(r?.id || "");
              const uid = String(r?.user_id || "");

              const created = r?.created_at ? new Date(r.created_at) : null;
              const createdLabel = created ? created.toLocaleString("pt-BR") : "—";
              const age = r?.created_at ? ageLabel(r.created_at) : "—";

              const gross = toNumberSafe(r?.amount_gross) ?? 0;
              const fee = toNumberSafe(r?.fee_amount) ?? 0;
              const net = toNumberSafe(r?.amount_net) ?? Math.max(0, gross - fee);

              const stU = String(r?.status || "").toUpperCase();
              const isAffiliate = Boolean(r?.is_affiliate_withdraw);

              const riskScore = Number.isFinite(Number(r?.risk_score)) ? Number(r.risk_score) : 0;
              const riskFlags = Array.isArray(r?.risk_flags) ? r.risk_flags : [];
              const riskLabel = riskScore >= 70 ? "ALTO" : riskScore >= 35 ? "MÉDIO" : "BAIXO";
              const riskColor = riskScore >= 70 ? "#ffb4b4" : riskScore >= 35 ? "#ffd6a6" : "#b7f7c0";

              const isProblem =
                stU === "FAILED" ||
                (stU === "APPROVED" &&
                  (() => {
                    const base = r?.approved_at || r?.created_at;
                    const t = base ? new Date(base).getTime() : NaN;
                    return Number.isFinite(t) && Date.now() - t > 30 * 60 * 1000;
                  })()) ||
                (stU === "PROCESSING" &&
                  (() => {
                    const base = r?.updated_at || r?.approved_at || r?.created_at;
                    const t = base ? new Date(base).getTime() : NaN;
                    return Number.isFinite(t) && Date.now() - t > 30 * 60 * 1000;
                  })());

              const destMasked = r?.destination_masked ? String(r.destination_masked) : maskDest(r?.destination);

              return (
                <div
                  key={id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "160px 1.2fr 0.8fr 0.9fr 0.9fr 0.8fr 0.7fr",
                    padding: "12px 14px",
                    borderTop: "1px solid #20242c",
                    background: isAffiliate
                      ? "rgba(245, 158, 11, 0.045)"
                      : isProblem
                      ? "rgba(255, 107, 107, 0.06)"
                      : "#0b1016",
                    color: "#e5e7eb",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 800 }}>{createdLabel}</div>
                    <div style={{ fontSize: 11, color: "#9aa4b2", fontWeight: 900, marginTop: 2 }}>idade: {age}</div>
                  </div>

                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontWeight: 900, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ color: "#e5e7eb" }}>{uid ? `${uid.slice(0, 8)}…` : "—"}</span>
                      {isAffiliate ? affiliatePill() : null}
                      <button style={btnStyle("#1a202a")} onClick={() => copyText(uid)} title="Copiar user_id">
                        Copiar user_id
                      </button>
                    </div>

                    <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span>nome: {String(r?.profile_name || "—")}</span>
                    </div>

                    <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span>destino: {destMasked || "—"}</span>
                      {r?.simulated_success ? (
                        <span style={{ color: "#fbbf24", fontWeight: 900 }}>simulado</span>
                      ) : null}
                      <button style={btnStyle("#151a21")} onClick={() => copyText(r?.destination)} title="Copiar destino">
                        Copiar
                      </button>
                    </div>
                  </div>

                  <div style={{ fontWeight: 900 }}>
                    <div>R$ {formatBRL(gross)}</div>
                    <div style={{ fontSize: 11, color: "#9aa4b2", fontWeight: 900, marginTop: 2 }}>
                      taxa: R$ {formatBRL(fee)} • líquido: R$ {formatBRL(net)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {statusPill(r?.status)}
                  </div>

                  <div style={{ color: "#cbd5e1", fontWeight: 900 }}>
                    {String(r?.method || "—")}
                    {isAffiliate ? (
                      <div style={{ color: "#fbbf24", fontSize: 11, fontWeight: 900, marginTop: 4 }}>
                        afiliado
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div style={{ fontWeight: 900, color: riskColor }}>
                      {riskLabel} <span style={{ color: "#9aa4b2" }}>({riskScore})</span>
                    </div>
                    <div style={{ color: "#9aa4b2", fontSize: 11 }}>{riskFlags?.length ? `flags: ${riskFlags.length}` : "flags: 0"}</div>
                  </div>

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

      {detailOpen && detail ? (
        <div onClick={closeDetail} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span>Detalhe do Saque</span>
                  {detail?.is_affiliate_withdraw ? affiliatePill() : null}
                </div>
                <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4 }}>
                  id: {String(detail?.id || "").slice(0, 8)}… • user_id: {String(detail?.user_id || "").slice(0, 8)}… • método:{" "}
                  {String(detail?.method || "—")}
                </div>
              </div>

              <button onClick={closeDetail} style={{ ...btnStyle("#0f141a"), width: 40 }} title="Fechar">
                ✕
              </button>
            </div>

            {detail?.is_affiliate_withdraw ? (
              <div
                style={{
                  marginTop: 14,
                  borderRadius: 12,
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  background: "rgba(245, 158, 11, 0.08)",
                  padding: 12,
                  color: "#fde68a",
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 13 }}>Saque de afiliado detectado</div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#fcd34d" }}>
                  Este saque deve ser aprovado como <b>sucesso simulado</b>, sem envio real para provedor/pagamento externo.
                  O objetivo é apenas gerar histórico de saque bem-sucedido para divulgação do afiliado.
                </div>
              </div>
            ) : null}

            <div style={{ marginTop: 14, borderTop: "1px solid #20242c", paddingTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Info label="Status">{statusPill(detail?.status)}</Info>

                <Info label="Nome do usuário">
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 900 }}>{String(detail?.profile_name || "—")}</span>
                  </div>
                </Info>

                <Info label="Valor (gross / fee / net)">
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontWeight: 900 }}>R$ {formatBRL(detail?.amount_gross)}</div>
                    <div style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 900 }}>
                      taxa: R$ {formatBRL(detail?.fee_amount)} ({Number(detail?.fee_percent ?? 0) * 100}%)
                    </div>
                    <div style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 900 }}>
                      líquido: R$ {formatBRL(detail?.amount_net)}
                    </div>
                  </div>
                </Info>

                <Info label="Destino">
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 900 }}>{String(detail?.destination || "—")}</span>
                    <button style={btnStyle("#1a202a")} onClick={() => copyText(detail?.destination)}>
                      Copiar
                    </button>
                  </div>
                </Info>

                <Info label="Chave PIX (CPF)">
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 900 }}>{String(detail?.destination || "—")}</span>
                    <button style={btnStyle("#1a202a")} onClick={() => copyText(detail?.destination)}>
                      Copiar CPF
                    </button>
                  </div>
                </Info>

                <Info label="provider_payout_id">
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 900 }}>{String(detail?.provider_payout_id || "—")}</span>
                    <button style={btnStyle("#151a21")} onClick={() => copyText(detail?.provider_payout_id)}>
                      Copiar
                    </button>
                  </div>
                </Info>

                <Info label="Escopo">
                  <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
                    <div>
                      tipo: <b>{detail?.is_affiliate_withdraw ? "AFILIADO" : "USUÁRIO"}</b>
                    </div>
                    <div>
                      scope: <b>{String(detail?.withdrawal_scope || "USER")}</b>
                    </div>
                    <div>
                      simulado: <b>{detail?.simulated_success ? "SIM" : "NÃO"}</b>
                    </div>
                  </div>
                </Info>

                <Info label="Datas">
                  <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
                    <div>
                      criado: <b>{detail?.created_at ? new Date(detail.created_at).toLocaleString("pt-BR") : "—"}</b>
                    </div>
                    <div>
                      solicitado: <b>{detail?.requested_at ? new Date(detail.requested_at).toLocaleString("pt-BR") : "—"}</b>
                    </div>
                    <div>
                      efetuado: <b>{detail?.approved_at ? new Date(detail.approved_at).toLocaleString("pt-BR") : "—"}</b>
                    </div>
                    <div>
                      pago: <b>{detail?.paid_at ? new Date(detail.paid_at).toLocaleString("pt-BR") : "—"}</b>
                    </div>
                  </div>
                </Info>
              </div>

              <div style={{ ...boxStyle, marginTop: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Ações (admin)</div>

                {!detail?.is_affiliate_withdraw ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900, marginBottom: 6 }}>
                        provider_payout_id (opcional)
                      </div>
                      <input
                        value={providerPayoutId}
                        onChange={(e) => setProviderPayoutId(e.target.value)}
                        placeholder="ex: payout_123..."
                        style={{ ...inputStyle, width: "100%" }}
                        disabled={actionBusy}
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      borderRadius: 10,
                      border: "1px solid rgba(245, 158, 11, 0.25)",
                      background: "rgba(245, 158, 11, 0.05)",
                      padding: 10,
                      color: "#fbbf24",
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    Fluxo afiliado ativo: ao clicar em <b>Efetuar</b>, o sistema finalizará este saque como <b>PAID</b> sem payout real.
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900, marginBottom: 6 }}>
                    Motivo (obrigatório para REJECT/FAILED; recomendado para REVIEW)
                  </div>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Digite o motivo..."
                    style={{ ...inputStyle, width: "100%" }}
                    disabled={actionBusy}
                  />
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
                  <button
                    type="button"
                    style={btnStyle("#1a202a")}
                    onClick={() => doAdminAction("REVIEW")}
                    disabled={!canAction.canReview || actionBusy}
                    title={!canAction.canReview ? "Somente PENDING" : "Mover para REVIEW"}
                  >
                    {actionBusy ? "..." : "Marcar em revisão"}
                  </button>

                  <button
                    type="button"
                    style={btnStyle(detail?.is_affiliate_withdraw ? "linear-gradient(135deg, #f59e0b, #d97706)" : "#1a202a")}
                    onClick={() => doAdminAction("APPROVE")}
                    disabled={!canAction.canApprove || actionBusy}
                    title={
                      !canAction.canApprove
                        ? "Somente PENDING/REVIEW"
                        : detail?.is_affiliate_withdraw
                        ? "Aprovar como sucesso simulado"
                        : "Aprovar (efetuar)"
                    }
                  >
                    {actionBusy ? "..." : detail?.is_affiliate_withdraw ? "Efetuar (simulado)" : "Efetuar"}
                  </button>

                  <button
                    type="button"
                    style={btnStyle("#151a21")}
                    onClick={() => doAdminAction("PROCESSING")}
                    disabled={!canAction.canProcessing || actionBusy}
                    title={
                      detail?.is_affiliate_withdraw
                        ? "Desabilitado para saques de afiliado"
                        : !canAction.canProcessing
                        ? "Somente APPROVED"
                        : "Iniciar pagamento (PROCESSING)"
                    }
                  >
                    {actionBusy ? "..." : "Iniciar pagamento"}
                  </button>

                  <button
                    type="button"
                    style={btnStyle("#2b1414")}
                    onClick={() => doAdminAction("FAILED")}
                    disabled={!canAction.canFailed || actionBusy}
                    title={!canAction.canFailed ? "Indisponível para este status/tipo" : "Marcar como FAILED"}
                  >
                    {actionBusy ? "..." : "Marcar falhou"}
                  </button>

                  <button
                    type="button"
                    style={btnStyle("#2b1414")}
                    onClick={() => doAdminAction("REJECT")}
                    disabled={!canAction.canReject || actionBusy}
                    title={!canAction.canReject ? "Somente PENDING/REVIEW/APPROVED" : "Rejeitar (deve liberar HOLD)"}
                  >
                    {actionBusy ? "..." : "Rejeitar"}
                  </button>

                  <button
                    type="button"
                    style={btnStyle("#2b1414")}
                    onClick={() => doAdminAction("CANCEL")}
                    disabled={!canAction.canCancel || actionBusy}
                    title={!canAction.canCancel ? "Somente PENDING/REVIEW/APPROVED" : "Cancelar (deve liberar HOLD)"}
                  >
                    {actionBusy ? "..." : "Cancelar"}
                  </button>

                  {actionMsg ? (
                    <div
                      style={{
                        color: actionMsg.includes("erro") || actionMsg.includes("falhou") ? "#ffb4b4" : "#b7f7c0",
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                    >
                      {actionMsg}
                    </div>
                  ) : null}
                </div>

                <div style={{ marginTop: 10, color: "#9aa4b2", fontSize: 12 }}>
                  {detail?.is_affiliate_withdraw ? (
                    <>
                      Nota: saque afiliado usa a RPC <b>admin_affiliate_withdraw_approve</b> quando você clicar em <b>Efetuar</b>.
                    </>
                  ) : (
                    <>
                      Nota: ações chamam a RPC <b>admin_withdraw_transition</b>. Abra o console (F12) pra ver logs completos.
                    </>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Ledger (wallet_ledger)</div>

                {ledgerLoading ? (
                  <div style={{ color: "#9aa4b2" }}>Carregando ledger...</div>
                ) : ledgerRows.length === 0 ? (
                  <div style={{ color: "#ffb4b4", fontWeight: 900 }}>
                    Nenhum lançamento encontrado para este saque (withdraw_id).
                    <div style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 800, marginTop: 4 }}>
                      Quando o fluxo estiver 100% redondo, aqui deve aparecer: <b>WITHDRAW_HOLD</b> e depois <b>WITHDRAW_SETTLED</b> (ou <b>WITHDRAW_RELEASE</b>).
                    </div>
                  </div>
                ) : (
                  <div style={{ borderRadius: 12, border: "1px solid #20242c", overflow: "hidden" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "170px 1fr 0.6fr 0.8fr 0.8fr",
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

                    {ledgerRows.map((lr) => (
                      <div
                        key={String(lr?.id)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "170px 1fr 0.6fr 0.8fr 0.8fr",
                          padding: "10px 12px",
                          borderTop: "1px solid #20242c",
                          background: "#0b1016",
                          color: "#e5e7eb",
                          alignItems: "center",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ color: "#cbd5e1", fontWeight: 800 }}>
                          {lr?.created_at ? new Date(lr.created_at).toLocaleString("pt-BR") : "—"}
                        </div>

                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 900 }}>{String(lr?.user_id || "").slice(0, 8)}…</span>
                          <button style={btnStyle("#151a21")} onClick={() => copyText(lr?.user_id)}>
                            Copiar
                          </button>
                        </div>

                        <div style={{ fontWeight: 900 }}>{String(lr?.account_type || "—")}</div>
                        <div style={{ fontWeight: 900 }}>{String(lr?.kind || "—")}</div>
                        <div style={{ fontWeight: 900 }}>R$ {formatBRL(lr?.delta)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Timeline (withdraw_events)</div>

                {detailLoading ? (
                  <div style={{ color: "#9aa4b2" }}>Carregando timeline...</div>
                ) : events.length === 0 ? (
                  <div style={{ color: "#9aa4b2" }}>Sem eventos registrados ainda para este withdraw_id.</div>
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
                      <div>Ator</div>
                      <div>Payload</div>
                    </div>

                    {events.map((ev) => {
                      const t = ev?.created_at ? new Date(ev.created_at).toLocaleString("pt-BR") : "—";
                      const e = String(ev?.event_type || "—");
                      const actor = `${String(ev?.actor_type || "—")}${ev?.actor_id ? `:${String(ev.actor_id).slice(0, 8)}…` : ""}`;

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
                          <div style={{ color: "#9aa4b2", fontWeight: 900 }}>{actor}</div>
                          <div>
                            <button
                              style={btnStyle("#151a21")}
                              onClick={() => copyText(JSON.stringify(ev?.payload ?? {}, null, 2))}
                              title="Copiar JSON payload"
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
                Próximo passo depois deste fluxo: revisar RLS e padronizar se afiliado terá ledger final próprio com kind específico de auditoria.
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