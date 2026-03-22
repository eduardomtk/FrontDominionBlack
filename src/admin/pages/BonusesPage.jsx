// src/pages/admin/BonusesPage.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

/**
 * Ajuste o import do seu supabase client se o caminho for diferente.
 */
import { supabase } from "@/services/supabaseClient";

const TBL_BONUS_CODES = "bonus_codes";
const TBL_BONUS_USAGES = "bonus_usages";

/**
 * Edge Function (Admin)
 */
const ADMIN_FN = "admin-bonus-codes";

/**
 * IMPORTANTE:
 * - Esse segredo tem que estar no .env do teu front ADMIN
 * - Ex: VITE_ADMIN_PANEL_SECRET=....
 */
const ADMIN_SECRET =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_ADMIN_PANEL_SECRET) ||
  "";

/**
 * Paginação local
 */
const PAGE_SIZE = 20;

function formatMoneyBR(value) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTimeBR(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function computeProgressPct(required, completed) {
  const r = clampNumber(required, 0);
  const c = clampNumber(completed, 0);
  if (r <= 0) return 0;
  return Math.max(0, Math.min(100, (c / r) * 100));
}

/**
 * ✅ AJUSTE MÍNIMO:
 * - Wallet modal usa rollover_target / rollover_progress (real-time)
 * - Admin agora lê esses campos primeiro, e cai no legado rollover_required / rollover_completed
 */
function getRolloverRequired(u) {
  const primary = clampNumber(u?.rollover_target, NaN);
  if (Number.isFinite(primary)) return primary;
  return clampNumber(u?.rollover_required, 0);
}

function getRolloverCompleted(u) {
  const primary = clampNumber(u?.rollover_progress, NaN);
  if (Number.isFinite(primary)) return primary;
  return clampNumber(u?.rollover_completed, 0);
}

/**
 * Modal simples sem libs externas.
 */
function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div style={styles.modalBackdrop} onMouseDown={onClose}>
      <div style={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <button style={styles.iconBtn} onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div style={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}

function Pill({ children, tone = "neutral" }) {
  const toneStyle =
    tone === "green"
      ? styles.pillGreen
      : tone === "red"
      ? styles.pillRed
      : tone === "yellow"
      ? styles.pillYellow
      : tone === "blue"
      ? styles.pillBlue
      : styles.pillNeutral;

  return <span style={{ ...styles.pill, ...toneStyle }}>{children}</span>;
}

function ProgressBar({ pct }) {
  const p = Math.max(0, Math.min(100, Number(pct || 0)));
  return (
    <div style={styles.progressOuter}>
      <div style={{ ...styles.progressInner, width: `${p}%` }} />
    </div>
  );
}

/**
 * Helper: chama Edge Function Admin com secret
 */
async function adminInvoke(body) {
  if (!ADMIN_SECRET) {
    throw new Error(
      "VITE_ADMIN_PANEL_SECRET não definido no .env do Admin (precisa enviar x-admin-secret)."
    );
  }

  const { data, error } = await supabase.functions.invoke(ADMIN_FN, {
    headers: { "x-admin-secret": ADMIN_SECRET },
    body,
  });

  if (error) {
    const msg =
      error?.message ||
      (typeof error === "string" ? error : "") ||
      "Falha ao chamar função admin.";
    throw new Error(msg);
  }

  if (data && data.ok === false) {
    throw new Error(data.error || "Falha na operação admin.");
  }

  return data;
}

export default function BonusesPage() {
  const [activeTab, setActiveTab] = useState("codes"); // "codes" | "usages"

  // Bonus codes state
  const [codesLoading, setCodesLoading] = useState(false);
  const [codesError, setCodesError] = useState("");
  const [codes, setCodes] = useState([]);
  const [codesSearch, setCodesSearch] = useState("");
  const [codesFilter, setCodesFilter] = useState("all"); // all | active | inactive | expired
  const [codesPage, setCodesPage] = useState(1);

  // Usages (AGORA: lista de usuários)
  const [usagesLoading, setUsagesLoading] = useState(false);
  const [usagesSoftSyncing, setUsagesSoftSyncing] = useState(false); // ✅ não “pisca” a tabela
  const [usagesError, setUsagesError] = useState("");
  const [usages, setUsages] = useState([]); // rows agrupados por usuário
  const [usagesSearch, setUsagesSearch] = useState("");
  const [usagesStatus, setUsagesStatus] = useState("all"); // all | active | completed | cancelled | expired
  const [usagesPage, setUsagesPage] = useState(1);

  // Modals (codes)
  const [openEditor, setOpenEditor] = useState(false);
  const [editorMode, setEditorMode] = useState("create"); // create | edit
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [editorForm, setEditorForm] = useState({
    id: null,
    code: "",
    title: "",
    description: "",
    bonus_percent: 100,
    rollover_x: 10,
    min_deposit: 0,
    usage_limit_total: "",
    usage_limit_per_user: "",
    starts_at: "",
    expires_at: "",
    is_active: true,
  });

  const [openDelete, setOpenDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // ✅ Modal: detalhes do usuário (todos os bônus daquele user)
  const [openUserDetails, setOpenUserDetails] = useState(false);
  const [userDetailsRow, setUserDetailsRow] = useState(null);

  // ✅ Realtime channel refs
  const realtimeRef = useRef(null);
  const usageRefreshSeqRef = useRef(0);

  const filteredCodes = useMemo(() => {
    const q = codesSearch.trim().toLowerCase();
    const now = Date.now();

    return (codes || [])
      .filter((c) => {
        if (codesFilter === "active") return !!c.is_active;
        if (codesFilter === "inactive") return !c.is_active;
        if (codesFilter === "expired") {
          if (!c.expires_at) return false;
          const t = new Date(c.expires_at).getTime();
          return Number.isFinite(t) && t < now;
        }
        return true;
      })
      .filter((c) => {
        if (!q) return true;
        const hay = `${c.code || ""} ${c.title || ""} ${c.description || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const ta = new Date(a.created_at || 0).getTime();
        const tb = new Date(b.created_at || 0).getTime();
        return tb - ta;
      });
  }, [codes, codesSearch, codesFilter]);

  const pagedCodes = useMemo(() => {
    const start = (codesPage - 1) * PAGE_SIZE;
    return filteredCodes.slice(start, start + PAGE_SIZE);
  }, [filteredCodes, codesPage]);

  const codesTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredCodes.length / PAGE_SIZE));
  }, [filteredCodes.length]);

  // ✅ Filtra USUÁRIOS (não usos)
  const filteredUsages = useMemo(() => {
    const q = usagesSearch.trim().toLowerCase();

    return (usages || [])
      .filter((u) => {
        const primary = u?.primary || null;
        const status = (primary?.status || "").toLowerCase();

        if (usagesStatus === "all") return true;
        return status === usagesStatus;
      })
      .filter((u) => {
        if (!q) return true;
        const email = (u.user_email || "").toLowerCase();
        const uid = (u.user_id || "").toLowerCase();

        // também busca pelo código/status dentro do primary
        const primary = u?.primary || {};
        const bonusCode = (primary?.bonus_code || "").toLowerCase();
        const st = (primary?.status || "").toLowerCase();

        const hay = `${email} ${uid} ${bonusCode} ${st}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const ta = new Date(a?.primary?.applied_at || 0).getTime();
        const tb = new Date(b?.primary?.applied_at || 0).getTime();
        return tb - ta;
      });
  }, [usages, usagesSearch, usagesStatus]);

  const pagedUsages = useMemo(() => {
    const start = (usagesPage - 1) * PAGE_SIZE;
    return filteredUsages.slice(start, start + PAGE_SIZE);
  }, [filteredUsages, usagesPage]);

  const usagesTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredUsages.length / PAGE_SIZE));
  }, [filteredUsages.length]);

  useEffect(() => {
    loadBonusCodes();
    loadBonusUsages({ initial: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Realtime: bônus usages (atualiza sem piscar)
  useEffect(() => {
    // cleanup anterior
    if (realtimeRef.current) {
      try {
        supabase.removeChannel(realtimeRef.current);
      } catch {}
      realtimeRef.current = null;
    }

    const ch = supabase
      .channel(`admin:bonus_usages:rt`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TBL_BONUS_USAGES },
        () => {
          // atualização silenciosa (sem "Carregando..." e sem sumir tabela)
          loadBonusUsages({ soft: true });
        }
      )
      .subscribe((status) => {
        if (import.meta.env.DEV) {
          console.log("[BonusesAdmin] realtime bonus_usages:", status);
        }
      });

    realtimeRef.current = ch;

    return () => {
      if (realtimeRef.current) {
        try {
          supabase.removeChannel(realtimeRef.current);
        } catch {}
        realtimeRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCodesPage(1);
  }, [codesSearch, codesFilter]);

  useEffect(() => {
    setUsagesPage(1);
  }, [usagesSearch, usagesStatus]);

  async function loadBonusCodes() {
    setCodesLoading(true);
    setCodesError("");
    try {
      const data = await adminInvoke({
        action: "list_bonus_codes",
        page: 1,
        page_size: 5000,
      });

      const rows = data?.rows || [];
      setCodes(rows);
    } catch (e) {
      setCodesError(e?.message || "Falha ao carregar bônus.");
    } finally {
      setCodesLoading(false);
    }
  }

  const loadBonusUsages = useCallback(
    async ({ initial = false, soft = false } = {}) => {
      const seq = ++usageRefreshSeqRef.current;

      if (initial) setUsagesLoading(true);
      else if (soft) setUsagesSoftSyncing(true);

      setUsagesError("");
      try {
        const data = await adminInvoke({
          action: "list_bonus_usages",
          page: 1,
          page_size: 5000,
        });

        if (seq !== usageRefreshSeqRef.current) return;

        const rows = data?.rows || [];
        setUsages(rows);
      } catch (e) {
        if (seq !== usageRefreshSeqRef.current) return;
        setUsagesError(e?.message || "Falha ao carregar usuários usando bônus.");
      } finally {
        if (seq !== usageRefreshSeqRef.current) return;
        setUsagesLoading(false);
        setUsagesSoftSyncing(false);
      }
    },
    []
  );

  function openCreate() {
    setEditorMode("create");
    setEditorError("");
    setEditorForm({
      id: null,
      code: "",
      title: "",
      description: "",
      bonus_percent: 100,
      rollover_x: 10,
      min_deposit: 0,
      usage_limit_total: "",
      usage_limit_per_user: "",
      starts_at: "",
      expires_at: "",
      is_active: true,
    });
    setOpenEditor(true);
  }

  function openEdit(row) {
    setEditorMode("edit");
    setEditorError("");
    setEditorForm({
      id: row.id,
      code: row.code || "",
      title: row.title || "",
      description: row.description || "",
      bonus_percent: clampNumber(row.bonus_percent, 0),
      rollover_x: clampNumber(row.rollover_x, 0),
      min_deposit: clampNumber(row.min_deposit, 0),
      usage_limit_total:
        row.usage_limit_total === null || row.usage_limit_total === undefined
          ? ""
          : String(row.usage_limit_total),
      usage_limit_per_user:
        row.usage_limit_per_user === null || row.usage_limit_per_user === undefined
          ? ""
          : String(row.usage_limit_per_user),
      starts_at: row.starts_at ? toLocalDatetimeInput(row.starts_at) : "",
      expires_at: row.expires_at ? toLocalDatetimeInput(row.expires_at) : "",
      is_active: !!row.is_active,
    });
    setOpenEditor(true);
  }

  function openDeleteConfirm(row) {
    setDeleteError("");
    setDeleteTarget(row);
    setOpenDelete(true);
  }

  function openUserModal(row) {
    setUserDetailsRow(row);
    setOpenUserDetails(true);
  }

  function toLocalDatetimeInput(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  function fromLocalDatetimeInput(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  async function saveBonusCode() {
    setEditorSaving(true);
    setEditorError("");

    try {
      const payload = {
        code: (editorForm.code || "").trim().toUpperCase(),
        title: (editorForm.title || "").trim(),
        description: (editorForm.description || "").trim(),
        bonus_percent: clampNumber(editorForm.bonus_percent, 0),
        rollover_x: clampNumber(editorForm.rollover_x, 0),
        min_deposit: clampNumber(editorForm.min_deposit, 0),

        usage_limit_total:
          editorForm.usage_limit_total === "" ? null : clampNumber(editorForm.usage_limit_total, 0),
        usage_limit_per_user:
          editorForm.usage_limit_per_user === "" ? null : clampNumber(editorForm.usage_limit_per_user, 0),

        starts_at: editorForm.starts_at ? fromLocalDatetimeInput(editorForm.starts_at) : null,
        expires_at: editorForm.expires_at ? fromLocalDatetimeInput(editorForm.expires_at) : null,
        is_active: !!editorForm.is_active,
      };

      if (!payload.code) throw new Error("Código do bônus é obrigatório.");
      if (!payload.title) throw new Error("Título é obrigatório.");
      if (payload.bonus_percent <= 0) throw new Error("Bônus (%) precisa ser maior que 0.");
      if (payload.rollover_x < 0) throw new Error("Rollover (x) inválido.");

      if (editorMode === "create") {
        await adminInvoke({
          action: "create_bonus_code",
          ...payload,
        });
      } else {
        if (!editorForm.id) throw new Error("ID inválido para edição.");
        await adminInvoke({
          action: "update_bonus_code",
          id: editorForm.id,
          ...payload,
        });
      }

      setOpenEditor(false);
      await loadBonusCodes();
    } catch (e) {
      setEditorError(e?.message || "Falha ao salvar bônus.");
    } finally {
      setEditorSaving(false);
    }
  }

  async function toggleActive(row) {
    try {
      const next = !row.is_active;

      await adminInvoke({
        action: "update_bonus_code",
        id: row.id,
        is_active: next,
      });

      setCodes((prev) => prev.map((c) => (c.id === row.id ? { ...c, is_active: next } : c)));
    } catch (e) {
      setCodesError(e?.message || "Falha ao alterar status do bônus.");
    }
  }

  async function deleteBonusCode() {
    if (!deleteTarget?.id) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await adminInvoke({
        action: "delete_bonus_code",
        id: deleteTarget.id,
      });

      setOpenDelete(false);
      setDeleteTarget(null);
      await loadBonusCodes();
    } catch (e) {
      setDeleteError(e?.message || "Falha ao apagar bônus.");
    } finally {
      setDeleteLoading(false);
    }
  }

  function toneForStatus(status) {
    const s = (status || "").toLowerCase();
    if (s === "active") return "blue";
    if (s === "completed") return "green";
    if (s === "cancelled") return "red";
    if (s === "expired") return "yellow";
    return "neutral";
  }

  function labelStatus(status) {
    const s = (status || "").toLowerCase();
    if (s === "active") return "Ativo";
    if (s === "completed") return "Concluído";
    if (s === "cancelled") return "Cancelado";
    if (s === "expired") return "Expirado";
    return status || "—";
  }

  function renderHeader() {
    return (
      <div style={styles.header}>
        <div>
          <div style={styles.h1}>Bônus (Admin)</div>
          <div style={styles.sub}>
            Crie códigos de bônus (100% / 200% / 500%), configure rollover (10x / 20x), expiração e acompanhe usuários.
          </div>
        </div>

        <div style={styles.headerActions}>
          <button
            style={styles.secondaryBtn}
            onClick={() => (activeTab === "codes" ? loadBonusCodes() : loadBonusUsages({ soft: true }))}
          >
            Recarregar
          </button>
          {activeTab === "codes" && (
            <button style={styles.primaryBtn} onClick={openCreate}>
              + Criar bônus
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderTabs() {
    return (
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tabBtn, ...(activeTab === "codes" ? styles.tabBtnActive : null) }}
          onClick={() => setActiveTab("codes")}
        >
          Códigos de bônus
        </button>
        <button
          style={{ ...styles.tabBtn, ...(activeTab === "usages" ? styles.tabBtnActive : null) }}
          onClick={() => setActiveTab("usages")}
        >
          Usuários usando bônus
        </button>
      </div>
    );
  }

  function renderCodesToolbar() {
    return (
      <div style={styles.toolbar}>
        <input
          style={styles.input}
          placeholder="Buscar por código, título ou descrição…"
          value={codesSearch}
          onChange={(e) => setCodesSearch(e.target.value)}
        />
        <select style={styles.select} value={codesFilter} onChange={(e) => setCodesFilter(e.target.value)}>
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="expired">Expirados</option>
        </select>
      </div>
    );
  }

  function renderUsagesToolbar() {
    return (
      <div style={styles.toolbar}>
        <input
          style={styles.input}
          placeholder="Buscar por e-mail, user_id, código, status…"
          value={usagesSearch}
          onChange={(e) => setUsagesSearch(e.target.value)}
        />
        <select style={styles.select} value={usagesStatus} onChange={(e) => setUsagesStatus(e.target.value)}>
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="completed">Concluídos</option>
          <option value="cancelled">Cancelados</option>
          <option value="expired">Expirados</option>
        </select>
      </div>
    );
  }

  function renderPagination(page, totalPages, onChange) {
    return (
      <div style={styles.pagination}>
        <button style={styles.pageBtn} onClick={() => onChange(1)} disabled={page <= 1}>
          «
        </button>
        <button style={styles.pageBtn} onClick={() => onChange(page - 1)} disabled={page <= 1}>
          ‹
        </button>
        <div style={styles.pageInfo}>
          Página <b>{page}</b> de <b>{totalPages}</b>
        </div>
        <button style={styles.pageBtn} onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
          ›
        </button>
        <button style={styles.pageBtn} onClick={() => onChange(totalPages)} disabled={page >= totalPages}>
          »
        </button>
      </div>
    );
  }

  function renderCodesTable() {
    const now = Date.now();

    return (
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitle}>Lista de bônus</div>
          <div style={styles.cardMeta}>{filteredCodes.length} itens</div>
        </div>

        {codesError ? <div style={styles.errorBox}>⚠️ {codesError}</div> : null}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Código</th>
                <th style={styles.th}>Bônus</th>
                <th style={styles.th}>Rollover</th>
                <th style={styles.th}>Min. Depósito</th>
                <th style={styles.th}>Validade</th>
                <th style={styles.th}>Status</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {codesLoading ? (
                <tr>
                  <td style={styles.td} colSpan={7}>
                    Carregando…
                  </td>
                </tr>
              ) : pagedCodes.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={7}>
                    Nenhum bônus encontrado.
                  </td>
                </tr>
              ) : (
                pagedCodes.map((c) => {
                  const exp = c.expires_at ? new Date(c.expires_at).getTime() : null;
                  const isExpired = exp !== null && Number.isFinite(exp) && exp < now;

                  const statusPill = isExpired ? (
                    <Pill tone="yellow">Expirado</Pill>
                  ) : c.is_active ? (
                    <Pill tone="green">Ativo</Pill>
                  ) : (
                    <Pill tone="red">Inativo</Pill>
                  );

                  return (
                    <tr key={c.id}>
                      <td style={styles.td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontWeight: 800, letterSpacing: 0.6 }}>
                            {String(c.code || "").toUpperCase()}
                          </div>
                          <div style={{ opacity: 0.8, fontSize: 12 }}>{c.title || "—"}</div>
                        </div>
                      </td>

                      <td style={styles.td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontWeight: 700 }}>{clampNumber(c.bonus_percent, 0)}%</div>
                          {c.description ? (
                            <div
                              style={{
                                opacity: 0.75,
                                fontSize: 12,
                                maxWidth: 320,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {c.description}
                            </div>
                          ) : (
                            <div style={{ opacity: 0.5, fontSize: 12 }}>—</div>
                          )}
                        </div>
                      </td>

                      <td style={styles.td}>{clampNumber(c.rollover_x, 0)}x</td>
                      <td style={styles.td}>{formatMoneyBR(c.min_deposit)}</td>

                      <td style={styles.td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontSize: 12, opacity: 0.85 }}>
                            Início: {c.starts_at ? formatDateTimeBR(c.starts_at) : "Imediato"}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.85 }}>
                            Expira: {c.expires_at ? formatDateTimeBR(c.expires_at) : "Sem limite"}
                          </div>
                        </div>
                      </td>

                      <td style={styles.td}>{statusPill}</td>

                      <td style={{ ...styles.td, textAlign: "right" }}>
                        <div style={styles.rowActions}>
                          <button style={styles.smallBtn} onClick={() => openEdit(c)}>
                            Editar
                          </button>
                          <button style={styles.smallBtn} onClick={() => toggleActive(c)} title="Ativar/Desativar">
                            {c.is_active ? "Desativar" : "Ativar"}
                          </button>
                          <button style={styles.smallBtnDanger} onClick={() => openDeleteConfirm(c)}>
                            Apagar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {renderPagination(codesPage, codesTotalPages, setCodesPage)}
      </div>
    );
  }

  function renderUsagesTable() {
    return (
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={styles.cardTitle}>Usuários usando bônus</div>
            {usagesSoftSyncing ? (
              <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Sincronizando…</span>
            ) : null}
          </div>
          <div style={styles.cardMeta}>{filteredUsages.length} itens</div>
        </div>

        {usagesError ? <div style={styles.errorBox}>⚠️ {usagesError}</div> : null}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Usuário</th>
                <th style={styles.th}>Bônus</th>
                <th style={styles.th}>Depósito</th>
                <th style={styles.th}>Rollover</th>
                <th style={styles.th}>Progresso</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Aplicado em</th>
              </tr>
            </thead>
            <tbody>
              {usagesLoading ? (
                <tr>
                  <td style={styles.td} colSpan={7}>
                    Carregando…
                  </td>
                </tr>
              ) : pagedUsages.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={7}>
                    Nenhum usuário com bônus encontrado.
                  </td>
                </tr>
              ) : (
                pagedUsages.map((row) => {
                  const u = row?.primary || {};
                  // ✅ AJUSTE: usa rollover_target/progress primeiro, com fallback pro legado
                  const required = getRolloverRequired(u);
                  const completed = getRolloverCompleted(u);
                  const pct = computeProgressPct(required, completed);

                  const email = (row.user_email || "").trim();
                  const uid = (row.user_id || "").trim();

                  const bonusPercent = clampNumber(u.bonus_percent_snapshot ?? u.bonus_percent, 0);
                  const rolloverX = clampNumber(u.rollover_x_snapshot ?? u.rollover_x, 0);

                  return (
                    <tr
                      key={uid}
                      onClick={() => openUserModal(row)}
                      style={{ cursor: "pointer" }}
                      title="Clique para ver todos os bônus desse usuário"
                    >
                      <td style={styles.td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontWeight: 900 }}>
                            {email ? email : "— (e-mail não encontrado)"}
                          </div>
                          <div style={{ opacity: 0.7, fontSize: 12 }}>{uid}</div>
                        </div>
                      </td>

                      <td style={styles.td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontWeight: 900, letterSpacing: 0.6 }}>
                            {String(u.bonus_code || "").toUpperCase() || "—"}
                          </div>
                          <div style={{ opacity: 0.82, fontSize: 12 }}>
                            {bonusPercent}% · {rolloverX}x · {row.bonuses_count || 0} bônus
                          </div>
                        </div>
                      </td>

                      <td style={styles.td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div>{formatMoneyBR(u.deposit_amount)}</div>
                          <div style={{ opacity: 0.8, fontSize: 12 }}>Bônus: {formatMoneyBR(u.bonus_amount)}</div>
                        </div>
                      </td>

                      <td style={styles.td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontSize: 12, opacity: 0.85 }}>Req.: {formatMoneyBR(required)}</div>
                          <div style={{ fontSize: 12, opacity: 0.85 }}>Feito: {formatMoneyBR(completed)}</div>
                        </div>
                      </td>

                      <td style={styles.td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <ProgressBar pct={pct} />
                          <div style={{ fontSize: 12, opacity: 0.85 }}>{pct.toFixed(1)}%</div>
                        </div>
                      </td>

                      <td style={styles.td}>
                        <Pill tone={toneForStatus(u.status)}>{labelStatus(u.status)}</Pill>
                        {u.expires_at ? (
                          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                            Expira: {formatDateTimeBR(u.expires_at)}
                          </div>
                        ) : null}
                      </td>

                      <td style={styles.td}>{formatDateTimeBR(u.applied_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {renderPagination(usagesPage, usagesTotalPages, setUsagesPage)}
      </div>
    );
  }

  function renderUserDetailsModal() {
    const row = userDetailsRow;
    const items = row?.items || [];
    const email = (row?.user_email || "").trim();
    const uid = (row?.user_id || "").trim();

    return (
      <Modal
        open={openUserDetails}
        title={email ? `Bônus do usuário: ${email}` : `Bônus do usuário: ${uid}`}
        onClose={() => setOpenUserDetails(false)}
      >
        <div style={{ marginBottom: 10, opacity: 0.88, fontSize: 13 }}>
          <div>
            <b>E-mail:</b> {email || "—"}
          </div>
          <div style={{ marginTop: 4 }}>
            <b>User ID:</b> {uid || "—"}
          </div>
          <div style={{ marginTop: 4 }}>
            <b>Total de bônus:</b> {items.length}
          </div>
        </div>

        <div style={styles.tableWrap}>
          <table style={{ ...styles.table, minWidth: 980 }}>
            <thead>
              <tr>
                <th style={styles.th}>Código</th>
                <th style={styles.th}>Bônus</th>
                <th style={styles.th}>Depósito</th>
                <th style={styles.th}>Rollover</th>
                <th style={styles.th}>Progresso</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Aplicado em</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={7}>
                    Nenhum bônus encontrado para este usuário.
                  </td>
                </tr>
              ) : (
                items.map((u) => {
                  // ✅ AJUSTE: usa rollover_target/progress primeiro, com fallback pro legado
                  const required = getRolloverRequired(u);
                  const completed = getRolloverCompleted(u);
                  const pct = computeProgressPct(required, completed);

                  const bonusPercent = clampNumber(u.bonus_percent_snapshot ?? u.bonus_percent, 0);
                  const rolloverX = clampNumber(u.rollover_x_snapshot ?? u.rollover_x, 0);

                  return (
                    <tr key={u.id}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 900, letterSpacing: 0.6 }}>
                          {String(u.bonus_code || "").toUpperCase() || "—"}
                        </div>
                      </td>

                      <td style={styles.td}>
                        <div style={{ fontWeight: 900 }}>
                          {bonusPercent}% · {rolloverX}x
                        </div>
                        {u.expires_at ? (
                          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                            Expira: {formatDateTimeBR(u.expires_at)}
                          </div>
                        ) : null}
                      </td>

                      <td style={styles.td}>
                        <div>{formatMoneyBR(u.deposit_amount)}</div>
                        <div style={{ opacity: 0.8, fontSize: 12 }}>Bônus: {formatMoneyBR(u.bonus_amount)}</div>
                      </td>

                      <td style={styles.td}>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>Req.: {formatMoneyBR(required)}</div>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>Feito: {formatMoneyBR(completed)}</div>
                      </td>

                      <td style={styles.td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <ProgressBar pct={pct} />
                          <div style={{ fontSize: 12, opacity: 0.85 }}>{pct.toFixed(1)}%</div>
                        </div>
                      </td>

                      <td style={styles.td}>
                        <Pill tone={toneForStatus(u.status)}>{labelStatus(u.status)}</Pill>
                      </td>

                      <td style={styles.td}>{formatDateTimeBR(u.applied_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.secondaryBtn} onClick={() => setOpenUserDetails(false)}>
            Fechar
          </button>
        </div>
      </Modal>
    );
  }

  function renderEditorModal() {
    const isEdit = editorMode === "edit";

    return (
      <Modal
        open={openEditor}
        title={isEdit ? "Editar bônus" : "Criar bônus"}
        onClose={() => (editorSaving ? null : setOpenEditor(false))}
      >
        {editorError ? <div style={styles.errorBox}>⚠️ {editorError}</div> : null}

        <div style={styles.formGrid}>
          <div style={styles.field}>
            <label style={styles.label}>Código *</label>
            <input
              style={styles.input}
              value={editorForm.code}
              onChange={(e) => setEditorForm((s) => ({ ...s, code: e.target.value }))}
              placeholder="EX: BONUS100"
              autoCapitalize="characters"
            />
            <div style={styles.hint}>O usuário vai aplicar esse código no depósito.</div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Ativo</label>
            <select
              style={styles.select}
              value={editorForm.is_active ? "true" : "false"}
              onChange={(e) => setEditorForm((s) => ({ ...s, is_active: e.target.value === "true" }))}
            >
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
            <div style={styles.hint}>Você pode criar e deixar inativo para liberar depois.</div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Título</label>
            <input
              style={styles.input}
              value={editorForm.title}
              onChange={(e) => setEditorForm((s) => ({ ...s, title: e.target.value }))}
              placeholder="EX: Bônus de Boas-vindas"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Bônus (%) *</label>
            <input
              style={styles.input}
              type="number"
              min="1"
              step="1"
              value={editorForm.bonus_percent}
              onChange={(e) => setEditorForm((s) => ({ ...s, bonus_percent: e.target.value }))}
              placeholder="100"
            />
            <div style={styles.hint}>100 = 100% (dobra o depósito). 200 = triplica.</div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Rollover (x) *</label>
            <input
              style={styles.input}
              type="number"
              min="0"
              step="1"
              value={editorForm.rollover_x}
              onChange={(e) => setEditorForm((s) => ({ ...s, rollover_x: e.target.value }))}
              placeholder="10"
            />
            <div style={styles.hint}>
              Ex: 10x significa movimentar 10x do valor base (depósito + bônus, conforme sua regra).
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Depósito mínimo</label>
            <input
              style={styles.input}
              type="number"
              min="0"
              step="0.01"
              value={editorForm.min_deposit}
              onChange={(e) => setEditorForm((s) => ({ ...s, min_deposit: e.target.value }))}
              placeholder="0"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Limite total de usos</label>
            <input
              style={styles.input}
              type="number"
              min="0"
              step="1"
              value={editorForm.usage_limit_total}
              onChange={(e) => setEditorForm((s) => ({ ...s, usage_limit_total: e.target.value }))}
              placeholder="(vazio = ilimitado)"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Limite por usuário</label>
            <input
              style={styles.input}
              type="number"
              min="0"
              step="1"
              value={editorForm.usage_limit_per_user}
              onChange={(e) => setEditorForm((s) => ({ ...s, usage_limit_per_user: e.target.value }))}
              placeholder="(vazio = ilimitado)"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Início (opcional)</label>
            <input
              style={styles.input}
              type="datetime-local"
              value={editorForm.starts_at}
              onChange={(e) => setEditorForm((s) => ({ ...s, starts_at: e.target.value }))}
            />
            <div style={styles.hint}>Se vazio, vale imediatamente.</div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Expiração (opcional)</label>
            <input
              style={styles.input}
              type="datetime-local"
              value={editorForm.expires_at}
              onChange={(e) => setEditorForm((s) => ({ ...s, expires_at: e.target.value }))}
            />
            <div style={styles.hint}>Se vazio, sem limite de tempo.</div>
          </div>

          <div style={{ ...styles.field, gridColumn: "1 / -1" }}>
            <label style={styles.label}>Descrição</label>
            <textarea
              style={styles.textarea}
              value={editorForm.description}
              onChange={(e) => setEditorForm((s) => ({ ...s, description: e.target.value }))}
              placeholder="Detalhes internos/marketing do bônus…"
              rows={3}
            />
          </div>
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.secondaryBtn} disabled={editorSaving} onClick={() => setOpenEditor(false)}>
            Cancelar
          </button>
          <button style={styles.primaryBtn} disabled={editorSaving} onClick={saveBonusCode}>
            {editorSaving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </Modal>
    );
  }

  function renderDeleteModal() {
    return (
      <Modal open={openDelete} title="Apagar bônus" onClose={() => (deleteLoading ? null : setOpenDelete(false))}>
        <div style={{ marginBottom: 10, opacity: 0.9 }}>
          Você está prestes a apagar o bônus <b>{String(deleteTarget?.code || "").toUpperCase()}</b>.
        </div>
        <div style={{ marginBottom: 14, opacity: 0.8, fontSize: 13 }}>
          Isso não apaga automaticamente os históricos de uso (se sua tabela de usos tiver FK, ajuste a regra no banco).
        </div>
        {deleteError ? <div style={styles.errorBox}>⚠️ {deleteError}</div> : null}
        <div style={styles.modalFooter}>
          <button style={styles.secondaryBtn} disabled={deleteLoading} onClick={() => setOpenDelete(false)}>
            Cancelar
          </button>
          <button style={styles.dangerBtn} disabled={deleteLoading} onClick={deleteBonusCode}>
            {deleteLoading ? "Apagando…" : "Apagar"}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <div style={styles.page}>
      {renderHeader()}
      {renderTabs()}

      {activeTab === "codes" ? (
        <>
          {renderCodesToolbar()}
          {renderCodesTable()}
        </>
      ) : (
        <>
          {renderUsagesToolbar()}
          {renderUsagesTable()}
        </>
      )}

      {renderEditorModal()}
      {renderDeleteModal()}
      {renderUserDetailsModal()}
    </div>
  );
}

/**
 * Estilo neutro e “admin-profissional” sem depender do seu design system.
 */
const styles = {
  page: {
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    color: "rgba(255,255,255,0.92)",
  },

  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  h1: { fontSize: 20, fontWeight: 900, letterSpacing: 0.2 },
  sub: { marginTop: 6, fontSize: 13, opacity: 0.78, maxWidth: 880 },
  headerActions: { display: "flex", gap: 10, alignItems: "center" },

  tabs: {
    display: "flex",
    gap: 10,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    paddingBottom: 10,
  },
  tabBtn: {
    padding: "10px 12px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    cursor: "pointer",
    color: "rgba(255,255,255,0.86)",
    fontWeight: 800,
    fontSize: 13,
  },
  tabBtnActive: {
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.95)",
  },

  toolbar: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },

  card: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.18)",
    borderRadius: 14,
    overflow: "hidden",
  },
  cardHeader: {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  cardTitle: { fontWeight: 900, letterSpacing: 0.2 },
  cardMeta: { fontSize: 12, opacity: 0.7 },

  tableWrap: { width: "100%", overflowX: "auto" },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 980 },
  th: {
    textAlign: "left",
    fontSize: 12,
    opacity: 0.72,
    fontWeight: 900,
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    verticalAlign: "top",
    fontSize: 13,
    whiteSpace: "nowrap",
  },

  rowActions: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },

  input: {
    width: 360,
    maxWidth: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
    resize: "vertical",
  },
  select: {
    width: 220,
    maxWidth: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
    cursor: "pointer",
  },

  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.95)",
    cursor: "pointer",
    fontWeight: 900,
  },
  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "transparent",
    color: "rgba(255,255,255,0.88)",
    cursor: "pointer",
    fontWeight: 900,
  },
  dangerBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,80,80,0.35)",
    background: "rgba(255,80,80,0.12)",
    color: "rgba(255,230,230,0.95)",
    cursor: "pointer",
    fontWeight: 900,
  },
  smallBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "transparent",
    color: "rgba(255,255,255,0.88)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },
  smallBtnDanger: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,80,80,0.35)",
    background: "rgba(255,80,80,0.10)",
    color: "rgba(255,230,230,0.95)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "transparent",
    color: "rgba(255,255,255,0.88)",
    cursor: "pointer",
    fontWeight: 900,
  },

  errorBox: {
    margin: 12,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,120,120,0.25)",
    background: "rgba(255,120,120,0.10)",
    color: "rgba(255,235,235,0.95)",
    fontWeight: 800,
    fontSize: 13,
  },

  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 9999,
  },
  modalCard: {
    width: "min(920px, 96vw)",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(15,15,18,0.96)",
    boxShadow: "0 16px 60px rgba(0,0,0,0.55)",
    overflow: "hidden",
  },
  modalHeader: {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: { fontWeight: 900, letterSpacing: 0.2 },
  modalBody: { padding: 14 },
  modalFooter: { marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, opacity: 0.8, fontWeight: 900 },
  hint: { fontSize: 12, opacity: 0.65 },

  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    width: "fit-content",
  },
  pillNeutral: {},
  pillGreen: { borderColor: "rgba(110,255,160,0.22)", background: "rgba(110,255,160,0.10)" },
  pillRed: { borderColor: "rgba(255,110,110,0.22)", background: "rgba(255,110,110,0.10)" },
  pillYellow: { borderColor: "rgba(255,210,110,0.22)", background: "rgba(255,210,110,0.10)" },
  pillBlue: { borderColor: "rgba(120,180,255,0.22)", background: "rgba(120,180,255,0.10)" },

  progressOuter: {
    width: 180,
    maxWidth: "100%",
    height: 10,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    overflow: "hidden",
  },
  progressInner: {
    height: "100%",
    background: "rgba(255,255,255,0.30)",
    borderRadius: 999,
  },

  pagination: {
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  pageBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "transparent",
    color: "rgba(255,255,255,0.88)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },
  pageInfo: { fontSize: 12, opacity: 0.8 },
};
