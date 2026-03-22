// src/admin/pages/AffiliatesPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAdminAffiliatesOverview,
  fetchAdminAffiliateResolve,
  adminAffiliateCreate,
  adminAffiliateUpdate,
  // ✅ Auditoria
  fetchAdminAffiliateReferrals,
  fetchAdminAffiliatePayouts,
  adminAffiliateRetryPayouts,
  fetchAdminAffiliatePayoutReport,
  adminAffiliateDelete,
  // ✅ WEEKLY (manual)
  fetchAdminAffiliateWeeklyPreview,
  adminAffiliateWeeklyPay,
  fetchAdminAffiliateWeeklyPayouts,
} from "../services/admin.api";

/**
 * ✅ Admin Affiliates Page (REAL)
 * - Lista + métricas por período via Edge Function admin-affiliates-overview
 * - CRUD settings via admin-affiliate-update
 * - Resolve via admin-affiliate-resolve
 * - Auditoria: referidos + payouts + reprocessar erros + export (PDF via print)
 * - Delete: admin-affiliate-delete (seguro, service role)
 * - ✅ Weekly Payout (manual): preview + pay + history (paga quando quiser, sem restrição de semana)
 * - ✅ REAL TIME: Polling a cada 5 segundos com Cache em memória para evitar flicker/jumps/sumiços
 */
export default function AffiliatesPage() {
  const [activeTab, setActiveTab] = useState("afiliados"); // "afiliados" | "resumo"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Filtros
  const [q, setQ] = useState("");
  const [rangePreset, setRangePreset] = useState("7d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Dados
  const [rows, setRows] = useState([]);
  // Modal detalhes
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  // Resolve (modal detalhes)
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [resolved, setResolved] = useState(null);
  // Modal criar afiliado
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPass, setCreatePass] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState("");
  // ✅ Modal editar afiliado
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editPct, setEditPct] = useState("30"); // UI em %
  const [editDestEmail, setEditDestEmail] = useState("");
  // ✅ Auditoria: Referidos
  const [refsLoading, setRefsLoading] = useState(false);
  const [refsError, setRefsError] = useState("");
  const [referrals, setReferrals] = useState([]);
  // ✅ Auditoria: Payouts
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [payoutsError, setPayoutsError] = useState("");
  const [payouts, setPayouts] = useState([]);
  const [payoutsStatusFilter, setPayoutsStatusFilter] = useState(""); // "", PENDING, PAID, ERROR
  // ✅ WEEKLY (manual) - week_end agora é OPCIONAL
  const [weekEnd, setWeekEnd] = useState(""); // YYYY-MM-DD (opcional)
  const [weeklyPreviewLoading, setWeeklyPreviewLoading] = useState(false);
  const [weeklyPreviewError, setWeeklyPreviewError] = useState("");
  const [weeklyPreview, setWeeklyPreview] = useState(null);
  const [weeklyPayBusy, setWeeklyPayBusy] = useState(false);
  const [weeklyHistoryLoading, setWeeklyHistoryLoading] = useState(false);
  const [weeklyHistoryError, setWeeklyHistoryError] = useState("");
  const [weeklyHistory, setWeeklyHistory] = useState([]);
  const [weeklyHistoryStatusFilter, setWeeklyHistoryStatusFilter] = useState(""); // "", PENDING, PAID, ERROR
  // ✅ Delete
  const [deleteBusy, setDeleteBusy] = useState(false);
  // anti-race
  const loadingRef = useRef(false);
  const lastArgsRef = useRef(null);
  // ✅✅✅ CACHE REAL TIME (Memória) - Segura dados antes da atualização para evitar sumiços/pulos/flicker
  const lastSuccessfulRowsRef = useRef([]);
  const lastSuccessfulStatsRef = useRef(null);

  /** =========================
   *  Helpers
   *  ========================= */
  function safeNum(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }
  function formatBRL(n) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function clampPct(n) {
    const v = safeNum(n);
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }
  function normalizeText(s) {
    return String(s || "").trim().toLowerCase();
  }
  function getPresetLabel(p) {
    if (p === "7d") return "Últimos 7 dias";
    if (p === "30d") return "Últimos 30 dias";
    if (p === "this_month") return "Este mês";
    if (p === "last_month") return "Mês passado";
    if (p === "custom") return "Personalizado";
    return "Período";
  }
  function nowISODate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  function isoFromDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  // ✅ último sábado (inclui hoje se for sábado)
  function getLastSaturdayISO() {
    const d = new Date();
    const day = d.getDay(); // 0=dom, 6=sáb
    const delta = (day - 6 + 7) % 7;
    d.setDate(d.getDate() - delta);
    return isoFromDate(d);
  }
  function normalizeStatusToUI(v) {
    const s = String(v || "").trim().toUpperCase();
    if (s === "ATIVO" || s === "ACTIVE") return "ACTIVE";
    if (s === "PAUSADO" || s === "PAUSED") return "PAUSED";
    return "ACTIVE";
  }
  function statusToLabel(v) {
    const s = normalizeStatusToUI(v);
    return s === "PAUSED" ? "PAUSADO" : "ATIVO";
  }
  function normalizePctFromBackend(pctMaybe) {
    const v = safeNum(pctMaybe);
    if (v > 0 && v <= 1) return clampPct(v * 100);
    return clampPct(v);
  }
  function getOverviewArgs({ silent } = { silent: false }) {
    const args = {
      preset: rangePreset,
      from: rangePreset === "custom" ? (dateFrom || null) : null,
      to: rangePreset === "custom" ? (dateTo || null) : null,
      q: q ? String(q).trim() : null,
    };
    if (silent) {
      const prev = lastArgsRef.current;
      const same =
        prev &&
        prev.preset === args.preset &&
        prev.from === args.from &&
        prev.to === args.to &&
        prev.q === args.q;
      if (same) return null;
    }
    lastArgsRef.current = args;
    return args;
  }
  function normalizeRows(payload) {
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload)) return payload;
    return [];
  }
  function fmtDT(v) {
    try {
      if (!v) return "—";
      return new Date(v).toLocaleString("pt-BR");
    } catch {
      return "—";
    }
  }
  function shortId(id) {
    const s = String(id || "");
    return s ? `${s.slice(0, 8)}…${s.slice(-4)}` : "—";
  }
  // ✅ parse retorno do weekly_pay (edge pode encapsular em item)
  function pickWeeklyPayResult(payload) {
    const p = payload?.item && typeof payload.item === "object" ? payload.item : payload;
    // algumas edges retornam array (RPC table return)
    if (Array.isArray(p) && p.length) return p[0];
    return p && typeof p === "object" ? p : {};
  }
  // ✅✅✅ COMPARAÇÃO PROFUNDA PARA CACHE - Evita re-render se dados idênticos
  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object" || a === null || b === null) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  // ✅✅✅ Verifica se rows mudaram significativamente (para polling)
  function rowsHaveChanged(prev, next) {
    if (!prev || !next) return true;
    if (prev.length !== next.length) return true;
    // Compara campos críticos que indicam mudança real de dados
    for (let i = 0; i < Math.min(prev.length, next.length); i++) {
      const p = prev[i];
      const n = next[i];
      if (!p || !n) return true;
      // Campos que indicam mudança real de dados financeiros/operacionais
      if (String(p.affiliate_commission_total) !== String(n.affiliate_commission_total)) return true;
      if (String(p.broker_profit_total) !== String(n.broker_profit_total)) return true;
      if (String(p.referred_total) !== String(n.referred_total)) return true;
      if (String(p.referred_7d) !== String(n.referred_7d)) return true;
      if (String(p.referred_30d) !== String(n.referred_30d)) return true;
      if (String(p.trader_net_total) !== String(n.trader_net_total)) return true;
      if (String(p.status_ui) !== String(n.status_ui)) return true;
    }
    return false;
  }

  /** =========================
   *  Load
   *  ========================= */
  async function load({ silent } = { silent: false }) {
    if (loadingRef.current) return;
    const args = getOverviewArgs({ silent });
    if (!args) return;
    if (!silent) {
      setError("");
      setLoading(true);
    }
    loadingRef.current = true;
    try {
      const payload = await fetchAdminAffiliatesOverview(args);
      const items = normalizeRows(payload);
      const normalized = (items || []).map((r) => {
        const rawStatus = r?.status ?? r?.state ?? r?.active ?? "ACTIVE";
        return {
          affiliate_id: r?.affiliate_id ?? r?.id ?? "",
          affiliate_email: r?.affiliate_email ?? r?.email ?? "",
          affiliate_name: r?.affiliate_name ?? r?.name ?? "",
          status: statusToLabel(rawStatus),
          status_ui: normalizeStatusToUI(rawStatus),
          payout_pct: normalizePctFromBackend(r?.payout_pct ?? r?.commission_pct ?? r?.pct ?? 0),
          destination_email: r?.destination_email ?? r?.dest_email ?? r?.destination ?? "",
          referred_total: r?.referred_total ?? r?.referrals_total ?? r?.referrals ?? 0,
          referred_7d: r?.referred_7d ?? r?.new_7d ?? 0,
          referred_30d: r?.referred_30d ?? r?.new_30d ?? 0,
          trader_net_total: r?.trader_net_total ?? r?.net_traders ?? 0,
          affiliate_commission_total: r?.affiliate_commission_total ?? r?.commission_total ?? 0,
          broker_profit_total: r?.broker_profit_total ?? r?.broker_total ?? 0,
          last_activity_at:
            r?.last_activity_at ?? r?.last_activity ?? r?.updated_at ?? r?.created_at ?? null,
          raw: r,
        };
      });

      // ✅✅✅ CACHE REAL TIME: Só atualiza estado se dados realmente mudaram (silent mode)
      if (silent) {
        // Verifica se houve mudança significativa nos dados
        const hasChanged = rowsHaveChanged(lastSuccessfulRowsRef.current, normalized);
        if (!hasChanged) {
          // Dados idênticos - NÃO atualiza estado para evitar flicker/re-render desnecessário
          loadingRef.current = false;
          return;
        }
        // ✅✅✅ Manteve os dados antigos na tela enquanto carrega novos (não limpa rows)
        // Só atualiza após confirmar que há mudança real
      }

      // ✅✅✅ Atualiza cache E estado (sempre em modo não-silent, ou se mudou em silent)
      lastSuccessfulRowsRef.current = normalized;
      setRows(normalized);
    } catch (e) {
      console.error("[AffiliatesPage] load error:", e);
      if (!silent) setError(e?.message || "Erro ao carregar afiliados");
      // ✅✅✅ CACHE REAL TIME: Em modo silent, NUNCA limpa os dados se houver erro (segura o cache)
      // Os dados anteriores permanecem visíveis na tela
      if (!silent) setRows([]);
    } finally {
      if (!silent) setLoading(false);
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    if (!dateTo) setDateTo(nowISODate());
    // ✅ week_end é opcional, não inicializa mais com valor fixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅✅✅ REAL TIME POLLING: Atualiza a cada 5 SEGUNDOS (5000ms) com cache inteligente
  useEffect(() => {
    load({ silent: false });
    // ✅ Polling a cada 5 segundos para buscar novas operações automaticamente
    const poll = setInterval(() => {
      load({ silent: true });
    }, 5000);
    const onFocus = () => load({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (rangePreset === "custom" && !dateTo) return;
    load({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangePreset, dateFrom, dateTo]);

  /** =========================
   *  Filtered + Stats
   *  ========================= */
  const filtered = useMemo(() => {
    const term = normalizeText(q);
    if (!term) return rows;
    return rows.filter((r) => {
      const a = normalizeText(r.affiliate_email);
      const b = normalizeText(r.affiliate_name);
      const c = normalizeText(r.destination_email);
      const id = normalizeText(r.affiliate_id);
      return a.includes(term) || b.includes(term) || c.includes(term) || id.includes(term);
    });
  }, [rows, q]);

  const stats = useMemo(() => {
    const list = filtered;
    const affiliatesTotal = list.length;
    const affiliatesActive = list.filter((r) => r.status_ui === "ACTIVE").length;
    const referredTotal = list.reduce((s, r) => s + safeNum(r.referred_total), 0);
    const new7d = list.reduce((s, r) => s + safeNum(r.referred_7d), 0);
    const new30d = list.reduce((s, r) => s + safeNum(r.referred_30d), 0);
    const affiliateCommission = list.reduce((s, r) => s + safeNum(r.affiliate_commission_total), 0);
    const brokerProfit = list.reduce((s, r) => s + safeNum(r.broker_profit_total), 0);
    const tradersNet = list.reduce((s, r) => s + safeNum(r.trader_net_total), 0);
    return {
      affiliatesTotal,
      affiliatesActive,
      referredTotal,
      new7d,
      new30d,
      affiliateCommission,
      brokerProfit,
      tradersNet,
    };
  }, [filtered]);

  /** =========================
   *  Actions
   *  ========================= */
  function onChangePreset(p) {
    setRangePreset(p);
    if (p === "custom" && !dateTo) setDateTo(nowISODate());
  }

  /** =========================
   *  Auditoria loaders
   *  ========================= */
  async function loadReferrals(affiliate_id) {
    setRefsLoading(true);
    setRefsError("");
    setReferrals([]);
    try {
      const payload = await fetchAdminAffiliateReferrals({ affiliate_id, limit: 500, offset: 0 });
      setReferrals(Array.isArray(payload?.items) ? payload.items : []);
    } catch (e) {
      console.error("[AffiliatesPage] referrals error:", e);
      setRefsError(e?.message || "Erro ao carregar referidos");
      setReferrals([]);
    } finally {
      setRefsLoading(false);
    }
  }

  async function loadPayouts(affiliate_id, { status } = {}) {
    setPayoutsLoading(true);
    setPayoutsError("");
    setPayouts([]);
    try {
      const payload = await fetchAdminAffiliatePayouts({
        affiliate_id,
        status: status || null,
        limit: 300,
        offset: 0,
      });
      setPayouts(Array.isArray(payload?.items) ? payload.items : []);
    } catch (e) {
      console.error("[AffiliatesPage] payouts error:", e);
      setPayoutsError(e?.message || "Erro ao carregar payouts");
      setPayouts([]);
    } finally {
      setPayoutsLoading(false);
    }
  }

  /** =========================
   *  Weekly (manual) loaders
   *  ========================= */
  async function loadWeeklyPreview(affiliate_id, week_end = null) {
    setWeeklyPreviewLoading(true);
    setWeeklyPreviewError("");
    setWeeklyPreview(null);
    try {
      // ✅ week_end é opcional - null pega TODOS os pendentes
      const payload = await fetchAdminAffiliateWeeklyPreview({ affiliate_id, week_end: week_end || null });
      setWeeklyPreview(payload || null);
    } catch (e) {
      console.error("[AffiliatesPage] weekly preview error:", e);
      setWeeklyPreviewError(e?.message || "Erro ao gerar preview semanal");
      setWeeklyPreview(null);
    } finally {
      setWeeklyPreviewLoading(false);
    }
  }

  async function loadWeeklyHistory(affiliate_id, { status } = {}) {
    setWeeklyHistoryLoading(true);
    setWeeklyHistoryError("");
    setWeeklyHistory([]);
    try {
      const payload = await fetchAdminAffiliateWeeklyPayouts({
        affiliate_id,
        status: status || null,
        from: null,
        to: null,
        limit: 200,
        offset: 0,
      });
      setWeeklyHistory(Array.isArray(payload?.items) ? payload.items : []);
    } catch (e) {
      console.error("[AffiliatesPage] weekly history error:", e);
      setWeeklyHistoryError(e?.message || "Erro ao carregar histórico semanal");
      setWeeklyHistory([]);
    } finally {
      setWeeklyHistoryLoading(false);
    }
  }

  /** =========================
   *  Weekly (manual) actions
   *  ========================= */
  async function previewWeeklyInline() {
    if (!selected?.affiliate_id) return;
    const affiliate_id = String(selected.affiliate_id || "").trim();
    // ✅ week_end é opcional - pode ser vazio para pegar tudo
    const we = String(weekEnd || "").trim() || null;
    await loadWeeklyPreview(affiliate_id, we);
  }

  async function payWeeklyInline() {
    if (!selected?.affiliate_id) return;
    const affiliate_id = String(selected.affiliate_id || "").trim();
    // ✅ week_end é opcional - pode ser vazio para pagar tudo pendente
    const we = String(weekEnd || "").trim() || null;
    const periodMsg = we ? `com week_end=${we}` : "TODAS as comissões pendentes";
    const ok = confirm(`Executar pagamento semanal (${periodMsg})?
Isso credita a comissão no destino e registra o payout semanal.`);
    if (!ok) return;
    setWeeklyPayBusy(true);
    try {
      const raw = await adminAffiliateWeeklyPay({ affiliate_id, week_end: we });
      const res = pickWeeklyPayResult(raw);
      const paid = safeNum(res?.paid_count);
      const err = safeNum(res?.error_count);
      const total = safeNum(res?.total_amount);
      if (paid <= 0 && err <= 0) {
        alert("Nada para pagar ✅ (0 pendentes no período)");
      } else if (err > 0) {
        alert(`Pagamento executado com alertas ⚠️
Pagos: ${paid}
Erros: ${err}
Total: ${formatBRL(total)}
batch: ${res?.batch_id || "—"}`);
      } else {
        alert(`Pagamento semanal executado ✅
Pagos: ${paid}
Total: ${formatBRL(total)}
batch: ${res?.batch_id || "—"}`);
      }
      // ✅ Recarrega TUDO relevante (inclui payouts por trade)
      await Promise.all([
        load({ silent: false }),
        loadWeeklyHistory(affiliate_id, { status: weeklyHistoryStatusFilter || "" }),
        loadWeeklyPreview(affiliate_id, we),
        loadPayouts(affiliate_id, { status: payoutsStatusFilter || "" }),
      ]);
    } catch (e) {
      alert(e?.message || "Erro ao executar pagamento semanal");
    } finally {
      setWeeklyPayBusy(false);
    }
  }

  // ✅ Botões na tabela (sem abrir modal)
  async function previewWeeklyRow(e, affiliate_id) {
    e?.stopPropagation?.();
    // ✅ Sem week_end = pega todos pendentes
    try {
      const payload = await fetchAdminAffiliateWeeklyPreview({ affiliate_id: String(affiliate_id), week_end: null });
      const it = payload?.item || payload || {};
      const amt = it?.amount ?? it?.commission_amount ?? it?.total ?? it?.payout_amount ?? 0;
      const wk = it?.week_end || "Todos pendentes";
      alert(`Preview semanal ✅
week_end: ${wk}
Comissão: ${formatBRL(amt)}`);
    } catch (err) {
      alert(err?.message || "Erro ao gerar preview semanal");
    }
  }

  async function payWeeklyRow(e, affiliate_id) {
    e?.stopPropagation?.();
    // ✅ Sem week_end = paga todos pendentes
    const ok = confirm(`Pagar TODAS as comissões pendentes agora?
affiliate_id: ${String(affiliate_id)}
week_end: null (todos pendentes)`);
    if (!ok) return;
    try {
      const raw = await adminAffiliateWeeklyPay({ affiliate_id: String(affiliate_id), week_end: null });
      const res = pickWeeklyPayResult(raw);
      const paid = safeNum(res?.paid_count);
      const err = safeNum(res?.error_count);
      const total = safeNum(res?.total_amount);
      if (paid <= 0 && err <= 0) {
        alert("Nada para pagar ✅ (0 pendentes)");
      } else if (err > 0) {
        alert(`Pagamento executado com alertas ⚠️
Pagos: ${paid}
Erros: ${err}
Total: ${formatBRL(total)}
batch: ${res?.batch_id || "—"}`);
      } else {
        alert(`Pagamento semanal executado ✅
Pagos: ${paid}
Total: ${formatBRL(total)}
batch: ${res?.batch_id || "—"}`);
      }
      await load({ silent: false });
      // se o modal estiver aberto e for o mesmo afiliado, atualiza também a auditoria
      if (modalOpen && selected?.affiliate_id && String(selected.affiliate_id) === String(affiliate_id)) {
        await Promise.all([
          loadWeeklyHistory(String(affiliate_id), { status: weeklyHistoryStatusFilter || "" }),
          loadWeeklyPreview(String(affiliate_id), null),
          loadPayouts(String(affiliate_id), { status: payoutsStatusFilter || "" }),
        ]);
      }
    } catch (err) {
      alert(err?.message || "Erro ao executar pagamento semanal");
    }
  }

  /** =========================
   *  Modal + Resolve (detalhes)
   *  ========================= */
  async function openModal(row) {
    setSelected(row);
    setModalOpen(true);
    setResolved(null);
    setResolveError("");
    setResolveLoading(true);
    setRefsError("");
    setReferrals([]);
    setPayoutsError("");
    setPayouts([]);
    setPayoutsStatusFilter("");
    // weekly states
    // ✅ week_end agora é opcional - passa null para pegar tudo
    setWeekEnd("");
    setWeeklyPreviewError("");
    setWeeklyPreview(null);
    setWeeklyHistoryError("");
    setWeeklyHistory([]);
    setWeeklyHistoryStatusFilter("");
    try {
      const affiliate_id = String(row?.affiliate_id || "").trim();
      if (!affiliate_id) throw new Error("affiliate_id vazio");
      const payload = await fetchAdminAffiliateResolve({ affiliate_id });
      const item = payload?.item && typeof payload.item === "object" ? payload.item : payload;
      setResolved(item || null);
      // auditoria + weekly (carrega em paralelo)
      await Promise.all([
        loadReferrals(affiliate_id),
        loadPayouts(affiliate_id, { status: "" }),
        loadWeeklyPreview(affiliate_id, null), // ✅ null = pega todos pendentes
        loadWeeklyHistory(affiliate_id, { status: "" }),
      ]);
    } catch (e) {
      console.error("[AffiliatesPage] resolve error:", e);
      setResolveError(e?.message || "Erro ao resolver afiliado");
      setResolved(null);
    } finally {
      setResolveLoading(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setSelected(null);
    setResolved(null);
    setResolveError("");
    setResolveLoading(false);
    setEditOpen(false);
    setEditBusy(false);
    setEditErr("");
    setRefsLoading(false);
    setRefsError("");
    setReferrals([]);
    setPayoutsLoading(false);
    setPayoutsError("");
    setPayouts([]);
    setPayoutsStatusFilter("");
    setWeeklyPreviewLoading(false);
    setWeeklyPreviewError("");
    setWeeklyPreview(null);
    setWeeklyPayBusy(false);
    setWeeklyHistoryLoading(false);
    setWeeklyHistoryError("");
    setWeeklyHistory([]);
    setWeeklyHistoryStatusFilter("");
    setDeleteBusy(false);
  }

  function resolveLink() {
    const r = resolved || {};
    const link = r?.affiliate_link || r?.link || r?.url || r?.ref_link || r?.referral_link || "";
    const s = String(link || "").trim();
    return s || "—";
  }

  /** =========================
   *  Modal editar
   *  ========================= */
  function openEdit() {
    if (!selected) return;
    const r = resolved || {};
    const status = normalizeStatusToUI(r?.status || selected?.status_ui || selected?.status);
    const pct = normalizePctFromBackend(r?.payout_pct ?? selected?.payout_pct ?? 30);
    const dest = String(r?.destination_email ?? selected?.destination_email ?? "").trim();
    setEditStatus(status);
    setEditPct(String(pct));
    setEditDestEmail(dest);
    setEditErr("");
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditBusy(false);
    setEditErr("");
  }

  async function submitEdit() {
    if (!selected?.affiliate_id) return;
    const affiliate_id = String(selected.affiliate_id || "").trim();
    const payout_pct_percent = clampPct(Number(editPct));
    const destination_email = String(editDestEmail || "").trim().toLowerCase();
    const status = normalizeStatusToUI(editStatus);
    if (!destination_email) {
      setEditErr("Informe o email de destino.");
      return;
    }
    setEditBusy(true);
    setEditErr("");
    try {
      await adminAffiliateUpdate({ affiliate_id, payout_pct_percent, destination_email, status });
      try {
        setResolveLoading(true);
        const payload = await fetchAdminAffiliateResolve({ affiliate_id });
        const item = payload?.item && typeof payload.item === "object" ? payload.item : payload;
        setResolved(item || null);
      } catch {
        // ignore
      } finally {
        setResolveLoading(false);
      }
      await load({ silent: false });
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              payout_pct: payout_pct_percent,
              destination_email,
              status: statusToLabel(status),
              status_ui: status,
            }
          : prev
      );
      closeEdit();
      alert("Afiliado atualizado ✅");
    } catch (e) {
      console.error("[AffiliatesPage] update affiliate error:", e);
      setEditErr(e?.message || "Erro ao atualizar afiliado");
    } finally {
      setEditBusy(false);
    }
  }

  /** =========================
   *  Modal criar afiliado
   *  ========================= */
  function openCreate() {
    setCreateErr("");
    setCreateEmail("");
    setCreatePass("");
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateBusy(false);
    setCreateErr("");
  }

  async function submitCreate() {
    const email = String(createEmail || "").trim().toLowerCase();
    const password = String(createPass || "");
    if (!email) {
      setCreateErr("Informe um email.");
      return;
    }
    if (!password || password.length < 6) {
      setCreateErr("Informe uma senha (mínimo 6 caracteres).");
      return;
    }
    setCreateBusy(true);
    setCreateErr("");
    try {
      await adminAffiliateCreate({ email, password });
      closeCreate();
      await load({ silent: false });
      alert("Afiliado criado ✅");
    } catch (e) {
      console.error("[AffiliatesPage] create affiliate error:", e);
      setCreateErr(e?.message || "Erro ao criar afiliado");
    } finally {
      setCreateBusy(false);
    }
  }

  /** =========================
   *  Auditoria actions
   *  ========================= */
  async function onChangePayoutStatusFilter(next) {
    setPayoutsStatusFilter(next);
    if (!selected?.affiliate_id) return;
    await loadPayouts(String(selected.affiliate_id), { status: next });
  }

  async function retryAllErrors() {
    if (!selected?.affiliate_id) return;
    const ok = confirm("Reprocessar TODOS os payouts com ERRO deste afiliado? (ERROR → PENDING)");
    if (!ok) return;
    try {
      await adminAffiliateRetryPayouts({
        action: "retry_all_error",
        affiliate_id: String(selected.affiliate_id),
      });
      await loadPayouts(String(selected.affiliate_id), { status: payoutsStatusFilter || "" });
      alert("Erros reprocessados ✅");
    } catch (e) {
      alert(e?.message || "Falha ao reprocessar erros");
    }
  }

  async function retryOne(id) {
    if (!selected?.affiliate_id || !id) return;
    try {
      await adminAffiliateRetryPayouts({
        action: "retry_ids",
        affiliate_id: String(selected.affiliate_id),
        ids: [id],
      });
      await loadPayouts(String(selected.affiliate_id), { status: payoutsStatusFilter || "" });
      alert("Payout reprocessado ✅");
    } catch (e) {
      alert(e?.message || "Falha ao reprocessar payout");
    }
  }

  function buildReportHtml({ title, report, affiliateLabel }) {
    const totals = report?.totals || {};
    const list = Array.isArray(report?.affiliates) ? report.affiliates : [];
    const fmt = (n) => formatBRL(Number(n || 0));
    const dt = (x) => (x ? new Date(x).toLocaleString("pt-BR") : "—");
    const rows = list
      .map((a) => {
        return `
<tr>
<td style="padding:8px;border-bottom:1px solid #ddd;">${a.affiliate_id || ""}</td>
<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${fmt(a.ledger_commission_total)}</td>
<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${fmt(a.ledger_broker_profit_total)}</td>
<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${fmt(a.ledger_loss_total)}</td>
<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${fmt(a.payouts_paid_total)} (${a.payouts_paid_count || 0})</td>
<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${fmt(a.payouts_pending_total)} (${a.payouts_pending_count || 0})</td>
<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${fmt(a.payouts_error_total)} (${a.payouts_error_count || 0})</td>
</tr>
`;
      })
      .join("");
    return `
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${title}</title>
</head>
<body style="font-family: Arial, sans-serif; color:#111; padding:20px;">
<h2 style="margin:0 0 6px 0;">${title}</h2>
<div style="color:#444; font-size:12px; margin-bottom:14px;">
<div><b>Gerado em:</b> ${dt(new Date().toISOString())}</div>
<div><b>Afiliado:</b> ${affiliateLabel}</div>
<div><b>Período:</b> ${report?.range?.from || "—"} até ${report?.range?.to || "—"}</div>
<div><b>Timezone:</b> ${report?.tz || "—"}</div>
</div>
<div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
<div style="border:1px solid #ddd; border-radius:10px; padding:10px; min-width:220px;">
<div style="font-size:12px; color:#666; font-weight:bold;">Comissão (ledger)</div>
<div style="font-size:18px; font-weight:bold;">${fmt(totals.ledger_commission_total)}</div>
</div>
<div style="border:1px solid #ddd; border-radius:10px; padding:10px; min-width:220px;">
<div style="font-size:12px; color:#666; font-weight:bold;">Lucro corretora (ledger)</div>
<div style="font-size:18px; font-weight:bold;">${fmt(totals.ledger_broker_profit_total)}</div>
</div>
<div style="border:1px solid #ddd; border-radius:10px; padding:10px; min-width:220px;">
<div style="font-size:12px; color:#666; font-weight:bold;">Loss (ledger)</div>
<div style="font-size:18px; font-weight:bold;">${fmt(totals.ledger_loss_total)}</div>
</div>
<div style="border:1px solid #ddd; border-radius:10px; padding:10px; min-width:220px;">
<div style="font-size:12px; color:#666; font-weight:bold;">Payouts pagos</div>
<div style="font-size:18px; font-weight:bold;">${fmt(totals.payouts_paid_total)} (${totals.payouts_paid_count || 0})</div>
</div>
</div>
<table style="border-collapse:collapse; width:100%; font-size:12px;">
<thead>
<tr>
<th style="text-align:left;padding:8px;border-bottom:2px solid #111;">Affiliate ID</th>
<th style="text-align:right;padding:8px;border-bottom:2px solid #111;">Comissão</th>
<th style="text-align:right;padding:8px;border-bottom:2px solid #111;">Lucro Corretora</th>
<th style="text-align:right;padding:8px;border-bottom:2px solid #111;">Loss</th>
<th style="text-align:right;padding:8px;border-bottom:2px solid #111;">PAID</th>
<th style="text-align:right;padding:8px;border-bottom:2px solid #111;">PENDING</th>
<th style="text-align:right;padding:8px;border-bottom:2px solid #111;">ERROR</th>
</tr>
</thead>
<tbody>
${rows || "<tr><td colspan='7' style='padding:10px;'>Sem dados</td></tr>"}
</tbody>
</table>
<div style="margin-top:14px; font-size:11px; color:#666;">
Este relatório foi gerado automaticamente para auditoria contábil.
</div>
<script>
setTimeout(() => { window.print(); }, 250);
</script>
</body>
</html>
`;
  }

  async function exportReport(period) {
    try {
      const affiliate_id = selected?.affiliate_id ? String(selected.affiliate_id) : null;
      const payload = await fetchAdminAffiliatePayoutReport({
        affiliate_id,
        period,
        tz: "America/Recife",
        from: period === "custom" ? (dateFrom || null) : null,
        to: period === "custom" ? (dateTo || null) : null,
      });
      const title =
        period === "monthly"
          ? "Relatório Contábil Mensal (Afiliados)"
          : period === "custom"
          ? "Relatório Contábil (Custom)"
          : "Relatório Semanal de Payout (Afiliados)";
      const affiliateLabel = selected?.affiliate_email || (affiliate_id ? affiliate_id : "GERAL");
      const html = buildReportHtml({ title, report: payload, affiliateLabel });
      const w = window.open("", "_blank");
      if (!w) {
        alert("Popup bloqueado. Permita popups para exportar PDF.");
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      alert(e?.message || "Erro ao gerar relatório");
    }
  }

  /** =========================
   *  Delete afiliado
   *  ========================= */
  async function deleteAffiliate() {
    if (!selected?.affiliate_id) return;
    const email = selected?.affiliate_email || "";
    const id = String(selected.affiliate_id);
    const ok = confirm(
      `Excluir afiliado?
Email: ${email}
ID: ${id}
Isso apaga auth.user e todos os dados em cascata.`
    );
    if (!ok) return;
    setDeleteBusy(true);
    try {
      await adminAffiliateDelete({ affiliate_id: id, delete_auth_user: true });
      alert("Afiliado excluído ✅");
      closeModal();
      await load({ silent: false });
    } catch (e) {
      alert(e?.message || "Erro ao excluir afiliado");
    } finally {
      setDeleteBusy(false);
    }
  }

  /** =========================
   *  Render
   *  ========================= */
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0 }}>Afiliados</h1>
          <button
            onClick={() => load({ silent: false })}
            style={btnStyle("#151a21")}
            disabled={loading}
            title="Forçar atualização"
          >
            Atualizar
          </button>
          <button
            onClick={openCreate}
            style={btnStyle("#1a202a")}
            disabled={loading}
            title="Criar afiliado (email/senha)"
          >
            Criar afiliado
          </button>
          <div style={{ display: "flex", gap: 8, marginLeft: 6 }}>
            <button onClick={() => setActiveTab("afiliados")} style={tabBtnStyle(activeTab === "afiliados")}>
              Lista
            </button>
            <button onClick={() => setActiveTab("resumo")} style={tabBtnStyle(activeTab === "resumo")}>
              Resumo
            </button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 540 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por email, nome, destino ou id..."
            style={{ ...inputStyle, width: "100%" }}
          />
          <select
            value={rangePreset}
            onChange={(e) => onChangePreset(e.target.value)}
            style={selectStyle}
            title="Período"
          >
            <option value="7d">7 dias</option>
            <option value="30d">30 dias</option>
            <option value="this_month">Este mês</option>
            <option value="last_month">Mês passado</option>
            <option value="custom">Personalizado</option>
          </select>
          <div style={{ color: "#9aa4b2", fontSize: 12, whiteSpace: "nowrap" }}>
            Total: <b style={{ color: "#e5e7eb" }}>{filtered.length}</b>
          </div>
        </div>
      </div>
      <p style={{ color: "#9aa4b2", marginTop: 8 }}>
        Painel de afiliados (Admin). Período: <b>{getPresetLabel(rangePreset)}</b>
        {rangePreset === "custom" && (
          <>
            {" "}
            • de <b>{dateFrom || "—"}</b> até <b>{dateTo || "—"}</b>
          </>
        )}
      </p>
      {error ? <div style={errorBoxStyle}>{error}</div> : null}
      {rangePreset === "custom" ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
          <div style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 900 }}>Período personalizado:</div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={dateInputStyle}
          />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={dateInputStyle} />
          <button
            onClick={() => load({ silent: false })}
            style={btnStyle("#1a202a")}
            disabled={loading}
            title="Aplicar período personalizado"
          >
            Aplicar
          </button>
          <div style={{ marginLeft: "auto", color: "#9aa4b2", fontSize: 12 }}>
            Dica: lista filtrada por <b>profiles.is_affiliate=true</b>.
          </div>
        </div>
      ) : null}
      <div style={cardsWrapStyle}>
        <div style={cardStyle}>
          <div style={cardLabel}>Afiliados (Total)</div>
          <div style={cardValue}>{stats.affiliatesTotal}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Afiliados (Ativos)</div>
          <div style={cardValue}>{stats.affiliatesActive}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Referidos (Total)</div>
          <div style={cardValue}>{stats.referredTotal}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Novos (7d)</div>
          <div style={cardValue}>{stats.new7d}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Novos (30d)</div>
          <div style={cardValue}>{stats.new30d}</div>
        </div>
      </div>
      <div
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0,1fr))",
          gap: 10,
        }}
      >
        <div style={cardStyle}>
          <div style={cardLabel}>Comissão Afiliados</div>
          <div style={{ ...cardValue, color: "#bcd6ff" }}>{formatBRL(stats.affiliateCommission)}</div>
          <div style={{ marginTop: 6, color: "#9aa4b2", fontSize: 12 }}>Total no período selecionado.</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Lucro Corretora (Afiliados)</div>
          <div style={{ ...cardValue, color: "#10b981" }}>{formatBRL(stats.brokerProfit)}</div>
          <div style={{ marginTop: 6, color: "#9aa4b2", fontSize: 12 }}>Loss - comissão (no período).</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Net Traders (Referidos)</div>
          <div
            style={{
              ...cardValue,
              color: stats.tradersNet >= 0 ? "#ef4444" : "#10b981",
            }}
          >
            {formatBRL(stats.tradersNet)}
          </div>
          <div style={{ marginTop: 6, color: "#9aa4b2", fontSize: 12 }}>
            Resultado agregado dos referidos (no período).
          </div>
        </div>
      </div>
      {activeTab === "resumo" ? (
        <div style={{ marginTop: 16, ...panelStyle }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>Resumo Geral</div>
          <div style={{ marginTop: 6, color: "#9aa4b2", fontSize: 12 }}>
            ✅ Fonte: <b>admin-affiliates-overview</b> (Edge) agregando referrals + ledger por período.
          </div>
        </div>
      ) : loading ? (
        <p style={{ marginTop: 16 }}>Carregando...</p>
      ) : (
        <div style={tableWrapStyle}>
          <div style={theadStyle}>
            <div>Status</div>
            <div>Afiliado</div>
            <div>Destino (lucro)</div>
            <div style={{ textAlign: "right" }}>%</div>
            <div style={{ textAlign: "right" }}>Referidos</div>
            <div style={{ textAlign: "right" }}>Comissão</div>
            <div style={{ textAlign: "right" }}>Lucro Corretora</div>
            <div style={{ textAlign: "right" }}>Atividade</div>
            <div style={{ textAlign: "right" }}>Ações</div>
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: 14, color: "#9aa4b2" }}>Nenhum afiliado encontrado.</div>
          ) : (
            filtered
              .slice()
              .sort((a, b) => safeNum(b.affiliate_commission_total) - safeNum(a.affiliate_commission_total))
              .map((r) => {
                const isActive = r.status_ui === "ACTIVE";
                const last = r.last_activity_at
                  ? new Date(r.last_activity_at).toLocaleString("pt-BR")
                  : "—";
                return (
                  <div
                    key={r.affiliate_id || r.affiliate_email}
                    style={{ ...trStyle, cursor: "pointer" }}
                    title={`Abrir detalhes • ${r.affiliate_email}`}
                    onClick={() => openModal(r)}
                  >
                    <div>{statusPill(isActive ? "ok" : "paused")}</div>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      <div style={{ fontWeight: 900 }}>{r.affiliate_email || "—"}</div>
                      <div style={{ color: "#9aa4b2", fontSize: 12 }}>
                        id: {String(r.affiliate_id || "").slice(0, 12) || "—"}
                      </div>
                    </div>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      <div style={{ fontWeight: 900 }}>{r.destination_email || "—"}</div>
                      <div style={{ color: "#9aa4b2", fontSize: 12 }}>Conta que recebe o crédito.</div>
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 900 }}>{clampPct(r.payout_pct)}%</div>
                    <div style={{ textAlign: "right", fontWeight: 900 }}>
                      {safeNum(r.referred_total)}{" "}
                      <span style={{ color: "#9aa4b2", fontSize: 12 }}>
                        ({safeNum(r.referred_7d)} / {safeNum(r.referred_30d)})
                      </span>
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 900, color: "#bcd6ff" }}>
                      {formatBRL(r.affiliate_commission_total)}
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 900, color: "#10b981" }}>
                      {formatBRL(r.broker_profit_total)}
                    </div>
                    <div style={{ textAlign: "right", color: "#cbd5e1", fontWeight: 800, fontSize: 12 }}>
                      {last}
                    </div>
                    {/* ✅ Ações (Preview/Pagar semana) */}
                    <div
                      style={{
                        textAlign: "right",
                        display: "flex",
                        gap: 6,
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={(e) => previewWeeklyRow(e, r.affiliate_id)}
                        style={btnMiniStyle("#151a21")}
                        title="Preview semanal (paga todos pendentes)"
                      >
                        Preview
                      </button>
                      <button
                        onClick={(e) => payWeeklyRow(e, r.affiliate_id)}
                        style={btnMiniStyle("linear-gradient(135deg,#10b981,#059669)")}
                        title="Executar pagamento semanal agora (manual)"
                      >
                        Pagar
                      </button>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}
      {/* Modal detalhes */}
      {modalOpen && selected ? (
        <div onClick={closeModal} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Detalhes do Afiliado</div>
                <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4 }}>
                  {selected.affiliate_email || "—"} • id:{" "}
                  {String(selected.affiliate_id || "").slice(0, 12) || "—"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  style={btnStyle("#1a202a")}
                  onClick={openEdit}
                  disabled={resolveLoading}
                  title="Editar"
                >
                  Editar
                </button>
                <button
                  style={btnStyle("linear-gradient(135deg, #ef4444, #b91c1c)")}
                  onClick={deleteAffiliate}
                  disabled={deleteBusy || resolveLoading}
                  title="Excluir afiliado"
                >
                  {deleteBusy ? "Excluindo..." : "Excluir"}
                </button>
                <button onClick={closeModal} style={xBtnStyle} title="Fechar">
                  ✕
                </button>
              </div>
            </div>
            {resolveError ? (
              <div style={{ ...errorBoxStyle, marginTop: 12 }}>{resolveError}</div>
            ) : null}
            <div style={{ marginTop: 14, borderTop: "1px solid #20242c", paddingTop: 14 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0,1fr))",
                  gap: 10,
                }}
              >
                <div style={cardStyle}>
                  <div style={cardLabel}>Status</div>
                  <div style={cardValue}>
                    {statusToLabel(selected.status_ui || selected.status)}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>% Comissão Afiliado</div>
                  <div style={cardValue}>{clampPct(selected.payout_pct)}%</div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>Destino (lucro)</div>
                  <div style={{ ...cardValue, fontSize: 12, wordBreak: "break-all" }}>
                    {String(selected.destination_email || "—")}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>Link</div>
                  <div style={{ ...cardValue, fontSize: 12, wordBreak: "break-all" }}>
                    {resolveLoading ? "Carregando..." : resolveLink()}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10, color: "#9aa4b2", fontSize: 12 }}>
                ✅ Comissão e lucro são agregados por período via overview (ledger/settlements).
              </div>
            </div>
            {/* ✅ WEEKLY PAYOUT (manual) */}
            <div style={{ marginTop: 14, ...panelStyle }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>
                    Weekly payout (manual) • Pague quando quiser
                  </div>
                  <div style={{ marginTop: 4, color: "#9aa4b2", fontSize: 12 }}>
                    Deixe <b>week_end vazio</b> para pagar TODAS as comissões pendentes, ou selecione uma data para
                    filtrar.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ color: "#9aa4b2", fontSize: 11, fontWeight: 900 }}>
                      week_end (opcional)
                    </div>
                    <input
                      type="date"
                      value={weekEnd}
                      onChange={(e) => setWeekEnd(e.target.value)}
                      style={dateInputStyle}
                      title="week_end (opcional, deixe vazio para pagar tudo)"
                    />
                  </div>
                  <button
                    onClick={previewWeeklyInline}
                    style={btnStyle("#151a21")}
                    disabled={weeklyPreviewLoading || resolveLoading}
                    title="Gerar preview semanal"
                  >
                    {weeklyPreviewLoading ? "Preview..." : "Preview"}
                  </button>
                  <button
                    onClick={payWeeklyInline}
                    style={btnStyle("linear-gradient(135deg,#10b981,#059669)")}
                    disabled={weeklyPayBusy || resolveLoading}
                    title="Executar pagamento semanal (manual)"
                  >
                    {weeklyPayBusy ? "Pagando..." : "Pagar semana"}
                  </button>
                </div>
              </div>
              {weeklyPreviewError ? (
                <div style={{ ...errorBoxStyle, marginTop: 12 }}>{weeklyPreviewError}</div>
              ) : null}
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0,1fr))",
                  gap: 10,
                }}
              >
                <div style={cardStyle}>
                  <div style={cardLabel}>Período</div>
                  <div style={cardValue}>
                    {weeklyPreviewLoading
                      ? "—"
                      : weeklyPreview?.item?.week_start ||
                        weeklyPreview?.week_start ||
                        "Todos pendentes"}{" "}
                    → {weeklyPreviewLoading ? "—" : weeklyPreview?.item?.week_end || weeklyPreview?.week_end || "—"}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>Comissão (preview)</div>
                  <div style={{ ...cardValue, color: "#bcd6ff" }}>
                    {weeklyPreviewLoading
                      ? "—"
                      : formatBRL(
                          weeklyPreview?.item?.amount ??
                            weeklyPreview?.item?.commission_amount ??
                            weeklyPreview?.amount ??
                            weeklyPreview?.commission_amount ??
                            weeklyPreview?.totals?.commission_total ??
                            0
                        )}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>Destino</div>
                  <div style={{ ...cardValue, fontSize: 12, wordBreak: "break-all" }}>
                    {weeklyPreviewLoading
                      ? "—"
                      : String(
                          weeklyPreview?.item?.destination_email ??
                            weeklyPreview?.destination_email ??
                            selected?.destination_email ??
                            "—"
                        )}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>Qtd trades</div>
                  <div style={cardValue}>
                    {weeklyPreviewLoading
                      ? "—"
                      : safeNum(
                          weeklyPreview?.item?.trades_count ??
                            weeklyPreview?.trades_count ??
                            weeklyPreview?.item?.count ??
                            weeklyPreview?.count ??
                            0
                        )}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10, color: "#9aa4b2", fontSize: 12 }}>
                💡 O pagamento semanal cria/atualiza registros no modo <b>weekly_*</b> da Edge{" "}
                <b>admin-affiliate-payouts</b>.
              </div>
              {/* ✅ Histórico semanal */}
              <div style={{ marginTop: 12, borderTop: "1px solid #20242c", paddingTop: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900 }}>Histórico semanal</div>
                    <div style={{ marginTop: 4, color: "#9aa4b2", fontSize: 12 }}>
                      Lista de payouts semanais já executados (ou pendentes/erro).
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <select
                      value={weeklyHistoryStatusFilter}
                      onChange={async (e) => {
                        const v = e.target.value;
                        setWeeklyHistoryStatusFilter(v);
                        if (!selected?.affiliate_id) return;
                        await loadWeeklyHistory(String(selected.affiliate_id), { status: v });
                      }}
                      style={selectStyle}
                      title="Filtrar status"
                    >
                      <option value="">TODOS</option>
                      <option value="PENDING">PENDING</option>
                      <option value="PAID">PAID</option>
                      <option value="ERROR">ERROR</option>
                    </select>
                    <button
                      onClick={() =>
                        loadWeeklyHistory(String(selected.affiliate_id), {
                          status: weeklyHistoryStatusFilter,
                        })
                      }
                      style={btnStyle("#151a21")}
                      disabled={weeklyHistoryLoading}
                      title="Recarregar histórico semanal"
                    >
                      {weeklyHistoryLoading ? "Carregando..." : "Recarregar"}
                    </button>
                  </div>
                </div>
                {weeklyHistoryError ? (
                  <div style={{ ...errorBoxStyle, marginTop: 12 }}>{weeklyHistoryError}</div>
                ) : null}
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 12,
                    border: "1px solid #2b2f36",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "0.8fr 1fr 1fr 1fr 1fr",
                      padding: "10px 12px",
                      background: "#0f141a",
                      color: "#cbd5e1",
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    <div>Status</div>
                    <div>Semana</div>
                    <div>Valor</div>
                    <div>Destino</div>
                    <div style={{ textAlign: "right" }}>Criado</div>
                  </div>
                  {weeklyHistoryLoading ? (
                    <div style={{ padding: 12, color: "#9aa4b2" }}>Carregando...</div>
                  ) : weeklyHistory.length === 0 ? (
                    <div style={{ padding: 12, color: "#9aa4b2" }}>Sem histórico semanal.</div>
                  ) : (
                    weeklyHistory.map((w) => {
                      const st = String(w.status || "").toUpperCase();
                      const isErr = st === "ERROR";
                      const isPaid = st === "PAID";
                      const bg = isPaid ? "#142b18" : isErr ? "#2b1414" : "#141c2b";
                      const color = isPaid ? "#b7f7c0" : isErr ? "#ffb4b4" : "#bcd6ff";
                      const weekLabel = `${w.week_start || "—"} → ${w.week_end || "—"}`;
                      return (
                        <div
                          key={w.id || `${w.week_end}_${w.created_at}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "0.8fr 1fr 1fr 1fr 1fr",
                            padding: "10px 12px",
                            borderTop: "1px solid #20242c",
                            background: "#0b1016",
                            color: "#e5e7eb",
                            alignItems: "center",
                            fontSize: 12,
                          }}
                        >
                          <div>
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
                              }}
                            >
                              {st || "—"}
                            </span>
                          </div>
                          <div style={{ fontWeight: 900 }}>{weekLabel}</div>
                          <div style={{ fontWeight: 900, color: "#bcd6ff" }}>
                            {formatBRL(w.amount)}
                          </div>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            <div style={{ fontWeight: 900 }}>
                              {w.destination_email || selected?.destination_email || "—"}
                            </div>
                            <div style={{ color: "#9aa4b2" }}>
                              request_id: {shortId(w.request_id)}
                            </div>
                          </div>
                          <div
                            style={{
                              textAlign: "right",
                              color: "#cbd5e1",
                              fontWeight: 800,
                            }}
                          >
                            {fmtDT(w.created_at)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            {/* ===== Export ===== */}
            <div style={{ marginTop: 14, ...panelStyle }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>
                    Export / Relatórios (PDF via imprimir)
                  </div>
                  <div style={{ marginTop: 4, color: "#9aa4b2", fontSize: 12 }}>
                    Gera HTML e abre para salvar como PDF (impressão do navegador).
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button onClick={() => exportReport("weekly")} style={btnStyle("#1a202a")}>
                    PDF semanal
                  </button>
                  <button onClick={() => exportReport("monthly")} style={btnStyle("#1a202a")}>
                    PDF mensal
                  </button>
                  <button
                    onClick={() => exportReport("custom")}
                    style={btnStyle("#151a21")}
                    disabled={rangePreset === "custom" && (!dateFrom || !dateTo)}
                    title="Usa dateFrom/dateTo do topo"
                  >
                    PDF custom
                  </button>
                </div>
              </div>
            </div>
            {/* ===== Referidos ===== */}
            <div style={{ marginTop: 14, ...panelStyle }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>Referidos (Auditoria)</div>
                  <div style={{ marginTop: 4, color: "#9aa4b2", fontSize: 12 }}>
                    Lista completa de quem usou o código deste afiliado.
                  </div>
                </div>
                <button
                  onClick={() => loadReferrals(String(selected.affiliate_id))}
                  style={btnStyle("#151a21")}
                  disabled={refsLoading}
                  title="Recarregar referidos"
                >
                  {refsLoading ? "Carregando..." : "Recarregar"}
                </button>
              </div>
              {refsError ? (
                <div style={{ ...errorBoxStyle, marginTop: 12 }}>{refsError}</div>
              ) : null}
              <div
                style={{
                  marginTop: 10,
                  borderRadius: 12,
                  border: "1px solid #2b2f36",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.6fr 1.2fr 1fr 0.9fr",
                    padding: "10px 12px",
                    background: "#0f141a",
                    color: "#cbd5e1",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  <div>Usuário</div>
                  <div>RefCode</div>
                  <div>Data vínculo</div>
                  <div style={{ textAlign: "right" }}>User ID</div>
                </div>
                {refsLoading ? (
                  <div style={{ padding: 12, color: "#9aa4b2" }}>Carregando...</div>
                ) : referrals.length === 0 ? (
                  <div style={{ padding: 12, color: "#9aa4b2" }}>Nenhum referido.</div>
                ) : (
                  referrals.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.6fr 1.2fr 1fr 0.9fr",
                        padding: "10px 12px",
                        borderTop: "1px solid #20242c",
                        background: "#0b1016",
                        color: "#e5e7eb",
                        alignItems: "center",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        <div style={{ fontWeight: 900 }}>{r.referred_email || "—"}</div>
                        <div style={{ color: "#9aa4b2" }}>
                          criado: {fmtDT(r.referred_created_at)}
                        </div>
                      </div>
                      <div style={{ fontWeight: 900 }}>{r.ref_code || "—"}</div>
                      <div style={{ color: "#cbd5e1", fontWeight: 800 }}>
                        {fmtDT(r.created_at)}
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          color: "#9aa4b2",
                          fontWeight: 800,
                        }}
                      >
                        {shortId(r.referred_user_id)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            {/* ===== Payouts ===== */}
            <div style={{ marginTop: 14, ...panelStyle }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>Payouts (Auditoria)</div>
                  <div style={{ marginTop: 4, color: "#9aa4b2", fontSize: 12 }}>
                    PENDING/PAID/ERROR. Erros podem ser reprocessados (ERROR → PENDING).
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <select
                    value={payoutsStatusFilter}
                    onChange={(e) => onChangePayoutStatusFilter(e.target.value)}
                    style={selectStyle}
                    title="Filtrar status"
                  >
                    <option value="">TODOS</option>
                    <option value="PENDING">PENDING</option>
                    <option value="PAID">PAID</option>
                    <option value="ERROR">ERROR</option>
                  </select>
                  <button
                    onClick={() =>
                      loadPayouts(String(selected.affiliate_id), { status: payoutsStatusFilter })
                    }
                    style={btnStyle("#151a21")}
                    disabled={payoutsLoading}
                    title="Recarregar payouts"
                  >
                    {payoutsLoading ? "Carregando..." : "Recarregar"}
                  </button>
                  <button
                    onClick={retryAllErrors}
                    style={btnStyle("linear-gradient(135deg, #f59e0b, #d97706)")}
                    disabled={payoutsLoading}
                    title="Reprocessar todos ERROR"
                  >
                    Reprocessar erros
                  </button>
                </div>
              </div>
              {payoutsError ? (
                <div style={{ ...errorBoxStyle, marginTop: 12 }}>{payoutsError}</div>
              ) : null}
              <div
                style={{
                  marginTop: 10,
                  borderRadius: 12,
                  border: "1px solid #2b2f36",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "0.9fr 0.9fr 1fr 1fr 1.2fr 0.8fr 0.9fr",
                    padding: "10px 12px",
                    background: "#0f141a",
                    color: "#cbd5e1",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  <div>Status</div>
                  <div>Valor</div>
                  <div>Destino</div>
                  <div>Trade ID</div>
                  <div>Erro</div>
                  <div>Retry</div>
                  <div style={{ textAlign: "right" }}>Ações</div>
                </div>
                {payoutsLoading ? (
                  <div style={{ padding: 12, color: "#9aa4b2" }}>Carregando...</div>
                ) : payouts.length === 0 ? (
                  <div style={{ padding: 12, color: "#9aa4b2" }}>Nenhum payout.</div>
                ) : (
                  payouts.map((p) => {
                    const st = String(p.status || "").toUpperCase();
                    const isErr = st === "ERROR";
                    const isPaid = st === "PAID";
                    const pillBg = isPaid ? "#142b18" : isErr ? "#2b1414" : "#141c2b";
                    const pillColor = isPaid ? "#b7f7c0" : isErr ? "#ffb4b4" : "#bcd6ff";
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "0.9fr 0.9fr 1fr 1fr 1.2fr 0.8fr 0.9fr",
                          padding: "10px 12px",
                          borderTop: "1px solid #20242c",
                          background: "#0b1016",
                          color: "#e5e7eb",
                          alignItems: "center",
                          fontSize: 12,
                        }}
                      >
                        <div>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 10px",
                              borderRadius: 999,
                              fontSize: 12,
                              border: "1px solid #2b2f36",
                              background: pillBg,
                              color: pillColor,
                              fontWeight: 900,
                            }}
                          >
                            {st || "—"}
                          </span>
                        </div>
                        <div style={{ fontWeight: 900 }}>{formatBRL(p.amount)}</div>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                          <div style={{ fontWeight: 900 }}>{p.destination_email || "—"}</div>
                          <div style={{ color: "#9aa4b2" }}>criado: {fmtDT(p.created_at)}</div>
                        </div>
                        <div
                          style={{
                            color: "#cbd5e1",
                            fontWeight: 800,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.trade_id || "—"}
                        </div>
                        <div
                          style={{
                            color: isErr ? "#ffb4b4" : "#9aa4b2",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.last_error || "—"}
                        </div>
                        <div style={{ fontWeight: 900 }}>{safeNum(p.retry_count)}</div>
                        <div style={{ textAlign: "right" }}>
                          {isErr ? (
                            <button
                              onClick={() => retryOne(p.id)}
                              style={btnMiniStyle("#1a202a")}
                              title="Reprocessar este payout"
                            >
                              Reprocessar
                            </button>
                          ) : (
                            <span style={{ color: "#9aa4b2" }}>—</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {/* ✅ Modal Edit dentro do modal detalhes */}
            {editOpen ? (
              <div
                onClick={closeEdit}
                style={{ ...overlayStyle, position: "fixed", zIndex: 10000 }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ ...modalStyle, width: "min(720px, 100%)" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 900 }}>Editar Afiliado</div>
                      <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4 }}>
                        {selected.affiliate_email || "—"} • id:{" "}
                        {String(selected.affiliate_id || "").slice(0, 12) || "—"}
                      </div>
                    </div>
                    <button onClick={closeEdit} style={xBtnStyle} title="Fechar">
                      ✕
                    </button>
                  </div>
                  {editErr ? (
                    <div style={{ ...errorBoxStyle, marginTop: 12 }}>{editErr}</div>
                  ) : null}
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 900 }}>Status</div>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        style={selectStyle}
                      >
                        <option value="ACTIVE">ATIVO</option>
                        <option value="PAUSED">PAUSADO</option>
                      </select>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 900 }}>
                        % Comissão (0–100)
                      </div>
                      <input
                        value={editPct}
                        onChange={(e) => setEditPct(e.target.value)}
                        style={inputStyle}
                        placeholder="Ex: 30"
                        inputMode="numeric"
                      />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 900 }}>
                        Email de destino (lucro)
                      </div>
                      <input
                        value={editDestEmail}
                        onChange={(e) => setEditDestEmail(e.target.value)}
                        style={inputStyle}
                        placeholder="destino@dominio.com"
                        autoComplete="off"
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        justifyContent: "flex-end",
                        marginTop: 6,
                      }}
                    >
                      <button
                        onClick={closeEdit}
                        style={btnStyle("#151a21")}
                        disabled={editBusy}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={submitEdit}
                        style={btnStyle("linear-gradient(135deg, #3b82f6, #2563eb)")}
                        disabled={editBusy}
                      >
                        {editBusy ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                    <div style={{ marginTop: 6, color: "#9aa4b2", fontSize: 12 }}>
                      💡 Comissão é calculada sobre <b>LOSS REAL liquidado</b> (trade_settlements).
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {/* Modal criar afiliado */}
      {createOpen ? (
        <div onClick={closeCreate} style={overlayStyle}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...modalStyle, width: "min(560px, 100%)" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Criar Afiliado</div>
                <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4 }}>
                  Cria conta (email/senha) e marca is_affiliate.
                </div>
              </div>
              <button onClick={closeCreate} style={xBtnStyle} title="Fechar">
                ✕
              </button>
            </div>
            {createErr ? (
              <div style={{ ...errorBoxStyle, marginTop: 12 }}>{createErr}</div>
            ) : null}
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 900 }}>Email</div>
                <input
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  style={inputStyle}
                  placeholder="email@dominio.com"
                  autoComplete="off"
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 900 }}>Senha</div>
                <input
                  value={createPass}
                  onChange={(e) => setCreatePass(e.target.value)}
                  style={inputStyle}
                  placeholder="senha (mín. 6)"
                  type="password"
                  autoComplete="new-password"
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 6,
                }}
              >
                <button
                  onClick={closeCreate}
                  style={btnStyle("#151a21")}
                  disabled={createBusy}
                >
                  Cancelar
                </button>
                <button
                  onClick={submitCreate}
                  style={btnStyle("linear-gradient(135deg, #3b82f6, #2563eb)")}
                  disabled={createBusy}
                >
                  {createBusy ? "Criando..." : "Criar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** =========================
 *  UI styles (padrão admin)
 *  ========================= */
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

function btnMiniStyle(bg) {
  return {
    height: 30,
    padding: "0 10px",
    borderRadius: 10,
    border: "1px solid #2b2f36",
    background: bg,
    color: "#fff",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 900,
  };
}

function tabBtnStyle(active) {
  return {
    height: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #2b2f36",
    background: active
      ? "linear-gradient(135deg, #3b82f6, #2563eb)"
      : "#0f141a",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 12,
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

const selectStyle = {
  height: 34,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid #2b2f36",
  background: "#0f141a",
  color: "#fff",
  outline: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const dateInputStyle = {
  height: 34,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid #2b2f36",
  background: "#0f141a",
  color: "#fff",
  outline: "none",
  fontWeight: 800,
};

const errorBoxStyle = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #442",
  background: "#221",
  color: "#ffd6d6",
};

const cardsWrapStyle = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 10,
};

const cardStyle = {
  borderRadius: 12,
  border: "1px solid #2b2f36",
  background: "#0b1016",
  padding: 12,
};

const panelStyle = {
  borderRadius: 12,
  border: "1px solid #2b2f36",
  background: "#0b1016",
  padding: 14,
};

const cardLabel = { fontSize: 12, color: "#9aa4b2", fontWeight: 900 };

const cardValue = { marginTop: 6, fontSize: 16, color: "#e5e7eb", fontWeight: 900 };

const tableWrapStyle = {
  marginTop: 16,
  borderRadius: 12,
  border: "1px solid #2b2f36",
  overflow: "hidden",
};

const theadStyle = {
  display: "grid",
  gridTemplateColumns: "0.7fr 1.6fr 1.4fr 0.5fr 0.7fr 0.8fr 0.9fr 0.9fr 1fr",
  padding: "12px 14px",
  background: "#0f141a",
  color: "#cbd5e1",
  fontWeight: 900,
  fontSize: 13,
};

const trStyle = {
  display: "grid",
  gridTemplateColumns: "0.7fr 1.6fr 1.4fr 0.5fr 0.7fr 0.8fr 0.9fr 0.9fr 1fr",
  padding: "12px 14px",
  borderTop: "1px solid #20242c",
  background: "#0b1016",
  color: "#e5e7eb",
  alignItems: "center",
};

function statusPill(kind) {
  const v = String(kind || "").toLowerCase();
  const isOk = v === "ok";
  const isPaused = v === "paused";
  const bg = isOk ? "#142b18" : isPaused ? "#141c2b" : "#2b1414";
  const color = isOk ? "#b7f7c0" : isPaused ? "#bcd6ff" : "#ffb4b4";
  const label = isOk ? "ATIVO" : isPaused ? "PAUSADO" : "INATIVO";
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
      }}
    >
      {label}
    </span>
  );
}

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
  width: "min(1100px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  borderRadius: 14,
  border: "1px solid #2b2f36",
  background: "#0b1016",
  padding: 16,
  color: "#e5e7eb",
};

const xBtnStyle = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "1px solid #2b2f36",
  background: "#0f141a",
  color: "#fff",
  cursor: "pointer",
};