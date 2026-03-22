import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/services/supabaseClient";
import { fetchAdminUsers, fetchAdminTradeHistoryAggREAL, fetchAdminUserTradesREAL } from "../services/admin.api";

export default function OperationsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [userTrades, setUserTrades] = useState([]);
  const [userStats, setUserStats] = useState(null);

  // paginação modal
  const [tradePageSize] = useState(200);
  const [tradeCursor, setTradeCursor] = useState(null);
  const [hasMoreTrades, setHasMoreTrades] = useState(false);

  // anti race
  const loadingRef = useRef(false);
  const modalLoadingRef = useRef(false);

  /** =========================
   *  Helpers
   *  ========================= */
  function normalizeRows(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.users)) return data.users;
    return [];
  }

  function pickProfile(u) {
    const a = u?.profile;
    const b = u?.profiles;
    const c = u?.profile_data;
    const d = u?.profileRow;
    const e = u?.profile_row;
    return (
      (a && typeof a === "object" ? a : null) ||
      (b && typeof b === "object" ? b : null) ||
      (c && typeof c === "object" ? c : null) ||
      (d && typeof d === "object" ? d : null) ||
      (e && typeof e === "object" ? e : null) ||
      {}
    );
  }

  function getProfileEmail(u) {
    const p = pickProfile(u);
    return (p?.email && String(p.email).trim()) || "";
  }

  function getAuthEmail(u) {
    return (
      (u?.email && String(u.email).trim()) ||
      (u?.auth_email && String(u.auth_email).trim()) ||
      (u?.user_email && String(u.user_email).trim()) ||
      (u?.auth?.email && String(u.auth.email).trim()) ||
      ""
    );
  }

  function getEmail(u) {
    return getProfileEmail(u) || getAuthEmail(u) || "";
  }

  function getNameFromProfile(p) {
    const name =
      (p?.name && String(p.name).trim()) ||
      `${String(p?.first_name || "").trim()} ${String(p?.last_name || "").trim()}`.trim() ||
      "";
    return name || "—";
  }

  function getCpfFromProfile(p) {
    const cpf = p?.cpf ? String(p.cpf).trim() : "";
    return cpf || "—";
  }

  function getUserId(u) {
    const p = pickProfile(u);

    const candidates = [
      u?.user_id,
      u?.id,
      u?.auth_user_id,
      u?.uid,
      u?.userId,
      u?.user?.id,
      u?.auth?.id,
      p?.user_id,
      p?.id,
      p?.auth_user_id,
      p?.uid,
      p?.userId,
    ];

    for (const c of candidates) {
      const s = String(c || "").trim();
      if (s) return s;
    }
    return "";
  }

  function formatBRL(n) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function safeNum(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeResult(r) {
    const v = String(r || "").trim().toUpperCase();
    if (v === "WIN" || v === "W") return "WIN";
    if (v === "LOSS" || v === "L" || v === "LOSE") return "LOSS";
    if (v === "TIE" || v === "DRAW") return "TIE";
    return v || "—";
  }

  /**
   * ✅ Cálculo PROFISSIONAL:
   * - LOSS: SEMPRE -amount
   * - TIE: 0
   * - WIN:
   *    - se profit vier e for != 0 => usa profit
   *    - senão, se payout vier => payout - amount
   *    - senão 0
   */
  function calcTradeNet(row) {
    const amount = safeNum(row?.amount);
    const payout = safeNum(row?.payout);
    const profitRaw = row?.profit;
    const result = normalizeResult(row?.result);

    if (result === "LOSS") return -amount;
    if (result === "TIE") return 0;

    // WIN
    if (profitRaw !== null && profitRaw !== undefined && profitRaw !== "") {
      const p = safeNum(profitRaw);
      if (p !== 0) return p;
    }

    if (payout) return payout - amount;
    return 0;
  }

  function calcWinProfit(row) {
    const result = normalizeResult(row?.result);
    if (result !== "WIN") return 0;
    return calcTradeNet(row);
  }

  function calcLossAmount(row) {
    const result = normalizeResult(row?.result);
    if (result !== "LOSS") return 0;
    return safeNum(row?.amount);
  }

  /** =========================
   *  Load principal (AGORA SERVER-SIDE)
   *  ========================= */
  const load = async () => {
    setError("");
    setLoading(true);
    loadingRef.current = true;

    try {
      const dataUsers = await fetchAdminUsers();
      const users = normalizeRows(dataUsers);

      // ✅ agregado vem da Edge Function (service role) — sem RLS do browser
      const aggPayload = await fetchAdminTradeHistoryAggREAL();
      const aggItems = Array.isArray(aggPayload?.items) ? aggPayload.items : [];

      const aggMap = new Map();
      for (const it of aggItems) {
        const uid = String(it?.user_id || "").trim();
        if (!uid) continue;
        aggMap.set(uid, it);
      }

      const merged = users.map((u) => {
        const p = pickProfile(u);
        const user_id = getUserId(u);

        const a =
          aggMap.get(user_id) || {
            operations: 0,
            volume: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            win_profit: 0,
            loss_amount: 0,
            net_trader: 0,
          };

        const net_trader = safeNum(a.net_trader);
        const broker_result = -net_trader;
        const danger = net_trader > 0;

        return {
          raw: u,
          profile: p,
          user_id,
          email: getEmail(u) || "(sem email)",
          name: getNameFromProfile(p),
          cpf: getCpfFromProfile(p),

          operations: Number(a.operations || 0),
          volume: safeNum(a.volume),

          wins: Number(a.wins || 0),
          losses: Number(a.losses || 0),
          ties: Number(a.ties || 0),
          win_profit: safeNum(a.win_profit),
          loss_amount: safeNum(a.loss_amount),

          trader_result: net_trader,
          broker_result,
          danger,
        };
      });

      merged.sort((a, b) => {
        if (a.danger !== b.danger) return a.danger ? -1 : 1;
        if (b.volume !== a.volume) return b.volume - a.volume;
        return b.operations - a.operations;
      });

      setRows(merged);
    } catch (e) {
      console.error("[AdminOperations] load error:", e);
      setError(e?.message || "Erro ao carregar operações");
      setRows([]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const loadSilent = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const dataUsers = await fetchAdminUsers();
      const users = normalizeRows(dataUsers);

      const aggPayload = await fetchAdminTradeHistoryAggREAL();
      const aggItems = Array.isArray(aggPayload?.items) ? aggPayload.items : [];

      const aggMap = new Map();
      for (const it of aggItems) {
        const uid = String(it?.user_id || "").trim();
        if (!uid) continue;
        aggMap.set(uid, it);
      }

      const merged = users.map((u) => {
        const p = pickProfile(u);
        const user_id = getUserId(u);

        const a =
          aggMap.get(user_id) || {
            operations: 0,
            volume: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            win_profit: 0,
            loss_amount: 0,
            net_trader: 0,
          };

        const net_trader = safeNum(a.net_trader);
        const broker_result = -net_trader;
        const danger = net_trader > 0;

        return {
          raw: u,
          profile: p,
          user_id,
          email: getEmail(u) || "(sem email)",
          name: getNameFromProfile(p),
          cpf: getCpfFromProfile(p),

          operations: Number(a.operations || 0),
          volume: safeNum(a.volume),

          wins: Number(a.wins || 0),
          losses: Number(a.losses || 0),
          ties: Number(a.ties || 0),
          win_profit: safeNum(a.win_profit),
          loss_amount: safeNum(a.loss_amount),

          trader_result: net_trader,
          broker_result,
          danger,
        };
      });

      merged.sort((a, b) => {
        if (a.danger !== b.danger) return a.danger ? -1 : 1;
        if (b.volume !== a.volume) return b.volume - a.volume;
        return b.operations - a.operations;
      });

      setRows(merged);
    } catch (e) {
      console.warn("[AdminOperations] loadSilent error:", e?.message || e);
    } finally {
      loadingRef.current = false;
    }
  };

  /** =========================
   *  Realtime + polling (NÃO MEXI)
   *  ========================= */
  useEffect(() => {
    load();

    const poll = setInterval(() => loadSilent(), 2500);

    const channel = supabase
      .channel("admin-operations-trade-history")
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_history" }, () => {
        loadSilent();
      })
      .subscribe();

    const onFocus = () => loadSilent();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** =========================
   *  Filtro / Stats cards
   *  ========================= */
  const filtered = useMemo(() => {
    const term = String(q || "").trim().toLowerCase();
    if (!term) return rows;

    return rows.filter((r) => {
      const id = String(r.user_id || "").toLowerCase();
      const email = String(r.email || "").toLowerCase();
      const name = String(r.name || "").toLowerCase();
      const cpf = String(r.cpf || "").toLowerCase();
      return id.includes(term) || email.includes(term) || name.includes(term) || cpf.includes(term);
    });
  }, [rows, q]);

  const stats = useMemo(() => {
    const list = filtered;

    const volume = list.reduce((s, r) => s + safeNum(r.volume), 0);
    const broker = list.reduce((s, r) => s + safeNum(r.broker_result), 0);
    const ops = list.reduce((s, r) => s + safeNum(r.operations), 0);

    const usersTotal = list.length;
    const usersTrading = list.filter((r) => safeNum(r.operations) > 0).length;
    const riskUsers = list.filter((r) => r.danger).length;

    return { volume, broker, ops, usersTotal, usersTrading, riskUsers };
  }, [filtered]);

  /** =========================
   *  Modal: carregar histórico do usuário (AGORA SERVER-SIDE)
   *  ========================= */
  function computeUserStatsFromTrades(trades) {
    const ops = trades.length;
    let volume = 0;
    let wins = 0;
    let losses = 0;
    let ties = 0;

    let win_profit = 0;
    let loss_amount = 0;

    for (const t of trades) {
      volume += safeNum(t.amount);

      const r = normalizeResult(t.result);
      if (r === "WIN") wins++;
      else if (r === "LOSS") losses++;
      else if (r === "TIE") ties++;

      win_profit += calcWinProfit(t);
      loss_amount += calcLossAmount(t);
    }

    const net_trader = win_profit - loss_amount;
    const net_broker = -net_trader;
    const winRate = ops > 0 ? (wins / ops) * 100 : 0;

    return { ops, volume, wins, losses, ties, win_profit, loss_amount, net_trader, net_broker, winRate };
  }

  async function refreshUserModal(user_id, { reset } = { reset: false }) {
    if (!user_id) return;
    if (modalLoadingRef.current) return;

    modalLoadingRef.current = true;
    setModalError("");
    setModalLoading(true);

    try {
      const cursor = !reset ? tradeCursor : null;

      const payload = await fetchAdminUserTradesREAL({
        user_id,
        cursor,
        limit: tradePageSize,
      });

      const list = Array.isArray(payload?.items) ? payload.items : [];
      const merged = reset ? list : [...userTrades, ...list];

      setUserTrades(merged);

      setTradeCursor(payload?.next_cursor ? String(payload.next_cursor) : null);
      setHasMoreTrades(Boolean(payload?.has_more));

      setUserStats(computeUserStatsFromTrades(merged));
    } catch (e) {
      console.error("[OperationsPage][Modal] refreshUserModal error:", e);
      setModalError(e?.message || "Erro ao carregar histórico do usuário");
    } finally {
      setModalLoading(false);
      modalLoadingRef.current = false;
    }
  }

  function openUserModal(row) {
    setSelected(row);
    setModalOpen(true);

    setUserTrades([]);
    setUserStats(null);
    setTradeCursor(null);
    setHasMoreTrades(false);
    setModalError("");

    refreshUserModal(row.user_id, { reset: true });
  }

  function closeUserModal() {
    if (modalLoading) return;
    setModalOpen(false);
    setSelected(null);
    setUserTrades([]);
    setUserStats(null);
    setTradeCursor(null);
    setHasMoreTrades(false);
    setModalError("");
  }

  // ✅ realtime/polling do modal (sem F5) — NÃO MEXI
  useEffect(() => {
    if (!modalOpen || !selected?.user_id) return;

    const poll = setInterval(() => {
      refreshUserModal(selected.user_id, { reset: true });
    }, 2000);

    const filter = `user_id=eq.${selected.user_id}`;
    const ch = supabase
      .channel(`admin-modal-trades-${selected.user_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_history", filter }, () => {
        refreshUserModal(selected.user_id, { reset: true });
        loadSilent();
      })
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, selected?.user_id]);

  /** =========================
   *  PDF (mantive igual)
   *  ========================= */
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function printHtmlToPDF(html) {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      alert("Falha ao gerar PDF (iframe).");
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      try {
        document.body.removeChild(iframe);
      } catch {}
    };

    try {
      iframe.contentWindow.onafterprint = cleanup;
    } catch {}

    setTimeout(cleanup, 15000);
  }

  function buildPdfHtml({ title, subtitle, generatedAt, cards, tableHead, tableBody, footerLeft, footerRight }) {
    const cardsHtml = (cards || [])
      .map(
        ([label, value]) => `
        <div class="card">
          <div class="label">${escapeHtml(label)}</div>
          <div class="value">${escapeHtml(value)}</div>
        </div>`
      )
      .join("");

    const headHtml = (tableHead || []).map((h) => `<th>${escapeHtml(h)}</th>`).join("");

    return `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <style>
    *{box-sizing:border-box;}
    body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#0b1220;}
    .page{padding:14mm;}
    .head{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:10px;}
    .head h1{margin:0;font-size:16px;}
    .muted{color:#444;font-size:11px;line-height:1.35;}
    .cards{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:10px 0 10px;}
    .card{border:1px solid #e5e7eb;border-radius:10px;padding:8px;}
    .label{font-size:10px;color:#555;margin-bottom:4px;}
    .value{font-size:12px;font-weight:800;}
    table{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;}
    thead th{background:#f6f7fb;font-size:10px;text-align:left;padding:7px;border-bottom:1px solid #e5e7eb;white-space:nowrap;}
    tbody td{font-size:10.5px;padding:7px;border-bottom:1px solid #f0f0f0;vertical-align:top;}
    .footer{margin-top:10px;font-size:10px;color:#666;border-top:1px solid #ddd;padding-top:8px;display:flex;justify-content:space-between;}
    @media print{
      @page{size:A4;margin:12mm;}
      .page{padding:0;}
      thead{display:table-header-group;}
      tr{break-inside:avoid;}
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="head">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="muted">${subtitle || ""}</div>
      </div>
      <div class="muted" style="text-align:right;">
        Gerado em: <b>${escapeHtml(generatedAt)}</b><br/>
        Documento: <b>Consolidado Operacional</b>
      </div>
    </div>

    <div class="cards">
      ${cardsHtml}
    </div>

    <table>
      <thead>
        <tr>${headHtml}</tr>
      </thead>
      <tbody>
        ${tableBody}
      </tbody>
    </table>

    <div class="footer">
      <div>${escapeHtml(footerLeft || "")}</div>
      <div>${escapeHtml(footerRight || "")}</div>
    </div>
  </div>

  <script>
    window.onload = () => setTimeout(() => window.print(), 150);
  </script>
</body>
</html>
    `.trim();
  }

  function exportPDFGeneral() {
    const now = new Date();
    const generatedAt = now.toLocaleString("pt-BR");

    const bodyRows = filtered
      .map((r) => {
        const statusLabel = r.danger ? "RISCO" : "OK";
        return `
          <tr>
            <td>${escapeHtml(statusLabel)}</td>
            <td>${escapeHtml(r.email)}</td>
            <td>${escapeHtml(r.name)}</td>
            <td>${escapeHtml(r.cpf)}</td>
            <td style="text-align:right;">${escapeHtml(formatBRL(r.volume))}</td>
            <td style="text-align:right;">${Number(r.operations || 0)}</td>
            <td style="text-align:right;">${escapeHtml(formatBRL(r.trader_result))}</td>
            <td style="text-align:right;">${escapeHtml(formatBRL(r.broker_result))}</td>
          </tr>
        `;
      })
      .join("");

    const html = buildPdfHtml({
      title: "Relatório de Operações — TradePro (REAL)",
      subtitle: "Fonte: trade_history (REAL) + profiles",
      generatedAt,
      cards: [
        ["Volume Operado", formatBRL(stats.volume)],
        ["Lucro Corretora", formatBRL(stats.broker)],
        ["Usuários (total)", String(stats.usersTotal)],
        ["Usuários com trades", String(stats.usersTrading)],
        ["Usuários em risco", String(stats.riskUsers)],
      ],
      tableHead: ["Status", "Email", "Nome", "CPF", "Volume", "Ops", "Net Trader", "Net Corretora"],
      tableBody: bodyRows || `<tr><td colspan="8">Sem dados.</td></tr>`,
      footerLeft: "TradePro • Painel Administrativo",
      footerRight: generatedAt,
    });

    printHtmlToPDF(html);
  }

  function exportPDFUser() {
    if (!selected) return;
    const now = new Date();
    const generatedAt = now.toLocaleString("pt-BR");

    const s = userStats || computeUserStatsFromTrades(userTrades);

    const bodyRows = userTrades
      .map((t) => {
        const dt = t?.created_at ? new Date(t.created_at).toLocaleString("pt-BR") : "—";
        const res = normalizeResult(t?.result);
        const net = calcTradeNet(t);

        return `
          <tr>
            <td>${escapeHtml(dt)}</td>
            <td>${escapeHtml(t?.symbol || "—")}</td>
            <td>${escapeHtml(t?.direction || "—")}</td>
            <td style="text-align:right;">${escapeHtml(formatBRL(t?.amount))}</td>
            <td>${escapeHtml(res)}</td>
            <td style="text-align:right;">${escapeHtml(formatBRL(net))}</td>
          </tr>
        `;
      })
      .join("");

    const html = buildPdfHtml({
      title: "Relatório de Operações — Usuário (REAL)",
      subtitle: `${escapeHtml(selected.email)} • ${escapeHtml(selected.name)} • CPF: ${escapeHtml(selected.cpf)}`,
      generatedAt,
      cards: [
        ["Volume (carregado)", formatBRL(s.volume)],
        ["Operações", String(s.ops)],
        ["WIN / LOSS / TIE", `${s.wins} / ${s.losses} / ${s.ties}`],
        ["Ganho (WIN)", formatBRL(s.win_profit)],
        ["Perda (LOSS)", formatBRL(s.loss_amount)],
      ],
      tableHead: ["Data", "Ativo", "Direção", "Valor", "Resultado", "Net (Trader)"],
      tableBody: bodyRows || `<tr><td colspan="6">Sem dados.</td></tr>`,
      footerLeft: `user_id: ${escapeHtml(selected.user_id)}`,
      footerRight: generatedAt,
    });

    printHtmlToPDF(html);
  }

  /** =========================
   *  Render
   *  ========================= */
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0 }}>Operações</h1>

          <button onClick={load} style={btnStyle("#151a21")} disabled={loading} title="Forçar atualização">
            Atualizar
          </button>

          <button onClick={exportPDFGeneral} style={primaryBtnStyle} disabled={loading} title="Gerar relatório geral">
            Exportar PDF
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 420 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por email, nome, cpf ou id..."
            style={{ ...inputStyle, width: "100%" }}
          />
          <div style={{ color: "#9aa4b2", fontSize: 12, whiteSpace: "nowrap" }}>
            Total: <b style={{ color: "#e5e7eb" }}>{filtered.length}</b>
          </div>
        </div>
      </div>

      <p style={{ color: "#9aa4b2", marginTop: 8 }}>
        Cálculo via <b>trade_history (REAL)</b>. Status <b>RISCO</b> = net do trader positivo (ruim pra corretora).
      </p>

      {error ? <div style={errorBoxStyle}>{error}</div> : null}

      <div style={cardsWrapStyle}>
        <div style={cardStyle}>
          <div style={cardLabel}>Volume Operado</div>
          <div style={cardValue}>{formatBRL(stats.volume)}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Lucro Corretora</div>
          <div style={cardValue}>{formatBRL(stats.broker)}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Usuários (Total)</div>
          <div style={cardValue}>{stats.usersTotal}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Usuários com Trades</div>
          <div style={cardValue}>{stats.usersTrading}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Usuários em Risco</div>
          <div style={cardValue}>{stats.riskUsers}</div>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 16 }}>Carregando...</p>
      ) : (
        <div style={tableWrapStyle}>
          <div style={theadStyle}>
            <div>Status</div>
            <div>Email</div>
            <div>Nome</div>
            <div>CPF</div>
            <div style={{ textAlign: "right" }}>Volume</div>
            <div style={{ textAlign: "right" }}>Ops</div>
            <div style={{ textAlign: "right" }}>Net Trader</div>
            <div style={{ textAlign: "right" }}>Net Corretora</div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: 14, color: "#9aa4b2" }}>Nenhum usuário encontrado.</div>
          ) : (
            filtered.map((r) => {
              const id = r.user_id;

              return (
                <div
                  key={id || r.email}
                  style={{ ...trStyle, cursor: "pointer" }}
                  title={`Abrir detalhes • user_id: ${id}`}
                  onClick={() => openUserModal(r)}
                >
                  <div>{statusPill(r.danger ? "risk" : "ok")}</div>

                  <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    <div style={{ fontWeight: 900 }}>{r.email}</div>
                    <div style={{ color: "#9aa4b2", fontSize: 12 }}>id: {id ? `${String(id).slice(0, 8)}…` : "—"}</div>
                  </div>

                  <div style={{ color: "#e5e7eb", fontWeight: 800 }}>{r.name}</div>
                  <div style={{ color: "#cbd5e1" }}>{r.cpf}</div>

                  <div style={{ textAlign: "right", fontWeight: 900 }}>{formatBRL(r.volume)}</div>
                  <div style={{ textAlign: "right", fontWeight: 900 }}>{r.operations}</div>

                  <div style={{ textAlign: "right", fontWeight: 900, color: r.trader_result >= 0 ? "#10b981" : "#ef4444" }}>
                    {formatBRL(r.trader_result)}
                  </div>

                  <div style={{ textAlign: "right", fontWeight: 900, color: r.broker_result >= 0 ? "#10b981" : "#ef4444" }}>
                    {formatBRL(r.broker_result)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {modalOpen && selected ? (
        <div onClick={closeUserModal} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Detalhes do Usuário</div>
                <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4 }}>
                  {selected.email} • {selected.name} • CPF: {selected.cpf} • id: {String(selected.user_id || "").slice(0, 8)}…
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    exportPDFUser();
                  }}
                  disabled={modalLoading}
                  style={primaryBtnStyle}
                  title="Exportar relatório deste usuário"
                >
                  Exportar PDF
                </button>

                <button onClick={closeUserModal} disabled={modalLoading} style={xBtnStyle} title="Fechar">
                  ✕
                </button>
              </div>
            </div>

            {modalError ? <div style={{ ...errorBoxStyle, marginTop: 12 }}>{modalError}</div> : null}

            <div style={{ marginTop: 14, borderTop: "1px solid #20242c", paddingTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 10 }}>
                <div style={cardStyle}>
                  <div style={cardLabel}>Volume (carregado)</div>
                  <div style={cardValue}>{formatBRL(userStats?.volume ?? 0)}</div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>Operações</div>
                  <div style={cardValue}>{userStats?.ops ?? 0}</div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>WIN / LOSS / TIE</div>
                  <div style={cardValue}>
                    {(userStats?.wins ?? 0)} / {(userStats?.losses ?? 0)} / {(userStats?.ties ?? 0)}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>Ganho (WIN)</div>
                  <div style={{ ...cardValue, color: "#10b981" }}>{formatBRL(userStats?.win_profit ?? 0)}</div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>Perda (LOSS)</div>
                  <div style={{ ...cardValue, color: "#ef4444" }}>{formatBRL(userStats?.loss_amount ?? 0)}</div>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10 }}>
                <div style={cardStyle}>
                  <div style={cardLabel}>Net Trader</div>
                  <div style={{ ...cardValue, color: (userStats?.net_trader ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>
                    {formatBRL(userStats?.net_trader ?? 0)}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>Net Corretora</div>
                  <div style={{ ...cardValue, color: (userStats?.net_broker ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>
                    {formatBRL(userStats?.net_broker ?? 0)}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ color: "#9aa4b2", fontSize: 12 }}>
                  Lista de operações (REAL) — mostrando últimas <b>{userTrades.length}</b>
                </div>

                <button
                  onClick={() => refreshUserModal(selected.user_id, { reset: false })}
                  disabled={modalLoading || !hasMoreTrades}
                  style={btnStyle("#1a202a")}
                  title={hasMoreTrades ? "Carregar mais" : "Sem mais registros"}
                >
                  {modalLoading ? "Carregando..." : hasMoreTrades ? "Carregar mais" : "Sem mais"}
                </button>
              </div>

              <div style={{ marginTop: 10, borderRadius: 12, border: "1px solid #2b2f36", overflow: "hidden" }}>
                <div style={theadTradesStyle}>
                  <div>Data</div>
                  <div>Ativo</div>
                  <div>Direção</div>
                  <div style={{ textAlign: "right" }}>Valor</div>
                  <div>Resultado</div>
                  <div style={{ textAlign: "right" }}>Net (Trader)</div>
                </div>

                {userTrades.length === 0 ? (
                  <div style={{ padding: 14, color: "#9aa4b2" }}>{modalLoading ? "Carregando..." : "Sem operações."}</div>
                ) : (
                  userTrades.map((t) => {
                    const dt = t?.created_at ? new Date(t.created_at).toLocaleString("pt-BR") : "—";
                    const res = normalizeResult(t?.result);
                    const net = calcTradeNet(t);

                    return (
                      <div key={t.id} style={trTradesStyle}>
                        <div style={{ color: "#cbd5e1" }}>{dt}</div>
                        <div style={{ fontWeight: 900 }}>{t?.symbol || "—"}</div>
                        <div style={{ color: "#e5e7eb", fontWeight: 900 }}>{t?.direction || "—"}</div>
                        <div style={{ textAlign: "right", fontWeight: 900 }}>{formatBRL(t?.amount)}</div>
                        <div>
                          <span style={resultPillStyle(res)}>{res}</span>
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 900, color: net >= 0 ? "#10b981" : "#ef4444" }}>
                          {formatBRL(net)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ marginTop: 10, color: "#9aa4b2", fontSize: 12 }}>
                Nota: Net = Soma(WIN lucro líquido) − Soma(LOSS amount). (Não depende de “saldo atual”, depende do histórico.)
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

const inputStyle = {
  height: 34,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid #2b2f36",
  background: "#0f141a",
  color: "#fff",
  outline: "none",
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
  gridTemplateColumns: "0.75fr 1.7fr 1.1fr 0.9fr 0.9fr 0.5fr 0.9fr 0.95fr",
  padding: "12px 14px",
  background: "#0f141a",
  color: "#cbd5e1",
  fontWeight: 900,
  fontSize: 13,
};

const trStyle = {
  display: "grid",
  gridTemplateColumns: "0.75fr 1.7fr 1.1fr 0.9fr 0.9fr 0.5fr 0.9fr 0.95fr",
  padding: "12px 14px",
  borderTop: "1px solid #20242c",
  background: "#0b1016",
  color: "#e5e7eb",
  alignItems: "center",
};

function statusPill(kind) {
  const isRisk = kind === "risk";
  const bg = isRisk ? "#2b1414" : "#142b18";
  const color = isRisk ? "#ffb4b4" : "#b7f7c0";
  const label = isRisk ? "RISCO" : "OK";

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

const theadTradesStyle = {
  display: "grid",
  gridTemplateColumns: "1.1fr 0.7fr 0.7fr 0.6fr 0.6fr 0.6fr",
  padding: "12px 14px",
  background: "#0f141a",
  color: "#cbd5e1",
  fontWeight: 900,
  fontSize: 13,
};

const trTradesStyle = {
  display: "grid",
  gridTemplateColumns: "1.1fr 0.7fr 0.7fr 0.6fr 0.6fr 0.6fr",
  padding: "10px 14px",
  borderTop: "1px solid #20242c",
  background: "#0b1016",
  alignItems: "center",
};

function resultPillStyle(res) {
  const v = String(res || "—").toUpperCase();
  const isWin = v === "WIN";
  const isLoss = v === "LOSS";
  const isTie = v === "TIE";

  const bg = isWin ? "#142b18" : isLoss ? "#2b1414" : isTie ? "#141c2b" : "#0f141a";
  const color = isWin ? "#b7f7c0" : isLoss ? "#ffb4b4" : isTie ? "#bcd6ff" : "#cbd5e1";

  return {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid #2b2f36",
    background: bg,
    color,
    fontWeight: 900,
  };
}
