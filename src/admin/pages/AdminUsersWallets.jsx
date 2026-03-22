import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAdminUsers, adjustUserBalance } from "../services/admin.api";
import { supabase } from "@/services/supabaseClient";

export default function AdminUsersWallets() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const [accountType, setAccountType] = useState("DEMO");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [showInHistory, setShowInHistory] = useState(false); // ✅ NOVO
  const [saving, setSaving] = useState(false);

  const rtRef = useRef(null);
  const loadingRef = useRef(false);

  const load = async () => {
    setError("");
    setLoading(true);
    loadingRef.current = true;

    try {
      const data = await fetchAdminUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || "Erro ao carregar usuários");
      setUsers([]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const loadSilent = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const data = await fetchAdminUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("[AdminUsersWallets] loadSilent error:", e?.message || e);
    } finally {
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    load();
    const poll = setInterval(() => {
      loadSilent();
    }, 8000);

    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdjust = (u) => {
    setSelectedUser(u);
    setAccountType("DEMO"); // default
    setDelta("");
    setReason("");
    setShowInHistory(false); // ✅ default
    setModalOpen(true);
  };

  const closeAdjust = () => {
    if (saving) return;
    setModalOpen(false);
    setSelectedUser(null);
  };

  const selectedWallets = useMemo(() => {
    const w = selectedUser?.wallets || {};
    return { DEMO: Number(w.DEMO || 0), REAL: Number(w.REAL || 0) };
  }, [selectedUser]);

  function normalizeType(v) {
    const t = String(v || "DEMO").toUpperCase();
    return t === "REAL" ? "REAL" : "DEMO";
  }

  function coerceBalanceLocal(v) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) return null;
      return coerceBalanceLocal(v[0]);
    }
    if (v && typeof v === "object") {
      const o = v;
      const cand = o.balance ?? o.new_balance ?? o.value ?? o.result ?? o.amount;
      return coerceBalanceLocal(cand);
    }
    return null;
  }

  function applyWalletUpdate(userId, t, bal) {
    setUsers((prev) =>
      prev.map((u) => {
        if (String(u.id) !== String(userId)) return u;
        const w = u.wallets || { DEMO: 0, REAL: 0 };
        const cur = Number(w[t] || 0);
        if (cur === bal) return u;
        return { ...u, wallets: { ...w, [t]: bal } };
      })
    );

    setSelectedUser((prev) => {
      if (!prev) return prev;
      if (String(prev.id) !== String(userId)) return prev;
      const w = prev.wallets || { DEMO: 0, REAL: 0 };
      const cur = Number(w[t] || 0);
      if (cur === bal) return prev;
      return { ...prev, wallets: { ...w, [t]: bal } };
    });
  }

  // ✅ BROADCAST realtime
  useEffect(() => {
    if (rtRef.current) {
      supabase.removeChannel(rtRef.current);
      rtRef.current = null;
    }

    const channel = supabase
      .channel("admin-wallets")
      .on("broadcast", { event: "wallet_updated" }, async ({ payload }) => {
        const userId = String(payload?.user_id || "");
        if (!userId) return;

        const t = normalizeType(payload?.account_type);
        const bal =
          coerceBalanceLocal(payload?.balance) ??
          coerceBalanceLocal(payload?.normalized_balance) ??
          coerceBalanceLocal(payload?.balance_raw);

        if (bal === null) {
          await loadSilent();
          return;
        }

        applyWalletUpdate(userId, t, bal);
      })
      .subscribe();

    rtRef.current = channel;

    return () => {
      if (rtRef.current) {
        supabase.removeChannel(rtRef.current);
        rtRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmitAdjust = async (e) => {
    e.preventDefault();
    if (!selectedUser?.id) return;

    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) {
      alert("Delta inválido. Use número positivo ou negativo.");
      return;
    }
    if (!String(reason || "").trim()) {
      alert("Motivo é obrigatório.");
      return;
    }

    setSaving(true);

    // ✅ optimistic (mantido)
    setUsers((prev) =>
      prev.map((u) => {
        if (String(u.id) !== String(selectedUser.id)) return u;
        const w = u.wallets || { DEMO: 0, REAL: 0 };
        return { ...u, wallets: { ...w, [accountType]: Number(w[accountType] || 0) + d } };
      })
    );
    setSelectedUser((prev) => {
      if (!prev) return prev;
      const w = prev.wallets || { DEMO: 0, REAL: 0 };
      return { ...prev, wallets: { ...w, [accountType]: Number(w[accountType] || 0) + d } };
    });

    try {
      const resp = await adjustUserBalance({
        user_id: selectedUser.id,
        account_type: accountType,
        delta: d,
        reason: String(reason).trim(),
        show_in_history: showInHistory, // ✅ NOVO
      });

      await loadSilent();

      alert(`Saldo ajustado com sucesso. Novo saldo: ${resp?.new_balance ?? "OK"}`);
      closeAdjust();
    } catch (err) {
      // rollback
      setUsers((prev) =>
        prev.map((u) => {
          if (String(u.id) !== String(selectedUser.id)) return u;
          const w = u.wallets || { DEMO: 0, REAL: 0 };
          return { ...u, wallets: { ...w, [accountType]: Number(w[accountType] || 0) - d } };
        })
      );
      setSelectedUser((prev) => {
        if (!prev) return prev;
        const w = prev.wallets || { DEMO: 0, REAL: 0 };
        return { ...prev, wallets: { ...w, [accountType]: Number(w[accountType] || 0) - d } };
      });

      alert(err?.message || "Falha ao ajustar saldo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Usuários / Carteiras</h1>
        <button onClick={load} style={btnStyle("#151a21")}>
          Atualizar
        </button>
      </div>

      <p style={{ color: "#9aa4b2", marginTop: 8 }}>
        Lista usuários reais do Supabase + saldos DEMO/REAL (wallets).
      </p>

      {error ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #442", background: "#221", color: "#ffd6d6" }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <p style={{ marginTop: 16 }}>Carregando...</p>
      ) : (
        <div style={{ marginTop: 16, borderRadius: 12, border: "1px solid #2b2f36", overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.3fr 0.8fr 0.8fr 0.6fr 1fr",
              gap: 0,
              padding: "12px 14px",
              background: "#0f141a",
              color: "#cbd5e1",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <div>Email</div>
            <div>DEMO</div>
            <div>REAL</div>
            <div>Status</div>
            <div>Ações</div>
          </div>

          {users.length === 0 ? (
            <div style={{ padding: 14, color: "#9aa4b2" }}>Nenhum usuário.</div>
          ) : (
            users.map((u) => {
              const demo = Number(u?.wallets?.DEMO || 0);
              const real = Number(u?.wallets?.REAL || 0);

              return (
                <div
                  key={String(u.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.3fr 0.8fr 0.8fr 0.6fr 1fr",
                    padding: "12px 14px",
                    borderTop: "1px solid #20242c",
                    background: "#0b1016",
                    color: "#e5e7eb",
                    alignItems: "center",
                  }}
                >
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    <div style={{ fontWeight: 700 }}>{u.email || "(sem email)"}</div>
                    <div style={{ color: "#9aa4b2", fontSize: 12 }}>
                      id: {String(u.id).slice(0, 8)}…
                    </div>
                  </div>

                  <div>R$ {demo.toFixed(2)}</div>
                  <div>R$ {real.toFixed(2)}</div>

                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        border: "1px solid #2b2f36",
                        background: u.status === "blocked" ? "#2b1414" : "#142b18",
                        color: u.status === "blocked" ? "#ffb4b4" : "#b7f7c0",
                      }}
                    >
                      {u.status || "active"}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {/* ✅ ÚNICO BOTÃO */}
                    <button onClick={() => openAdjust(u)} style={btnStyle("#1d2a3a")}>
                      Ajustar Saldo
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {modalOpen && selectedUser ? (
        <div
          onClick={closeAdjust}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              borderRadius: 14,
              border: "1px solid #2b2f36",
              background: "#0b1016",
              padding: 16,
              color: "#e5e7eb",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Ajustar Saldo</div>
                <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4 }}>
                  {selectedUser.email || "(sem email)"}
                </div>
              </div>

              <button onClick={closeAdjust} disabled={saving} style={xBtnStyle}>
                ✕
              </button>
            </div>

            <div style={{ marginTop: 14, color: "#9aa4b2", fontSize: 12 }}>
              Saldos atuais — DEMO: <b>R$ {selectedWallets.DEMO.toFixed(2)}</b> | REAL:{" "}
              <b>R$ {selectedWallets.REAL.toFixed(2)}</b>
            </div>

            <form onSubmit={onSubmitAdjust} style={{ marginTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={labelStyle}>Conta</div>
                  <select value={accountType} onChange={(e) => setAccountType(e.target.value)} style={inputStyle} disabled={saving}>
                    <option value="DEMO">DEMO</option>
                    <option value="REAL">REAL</option>
                  </select>
                </div>

                <div>
                  <div style={labelStyle}>Delta (ex: 100 ou -50)</div>
                  <input value={delta} onChange={(e) => setDelta(e.target.value)} style={inputStyle} placeholder="0" disabled={saving} />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={labelStyle}>Motivo (obrigatório)</div>
                <input value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} placeholder="Ex: bônus, ajuste manual, correção..." disabled={saving} />
              </div>

              {/* ✅ NOVO: aparecer no histórico */}
              <label style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "#cbd5e1" }}>
                <input
                  type="checkbox"
                  checked={showInHistory}
                  onChange={(e) => setShowInHistory(Boolean(e.target.checked))}
                  disabled={saving}
                />
                <span>Aparecer no histórico do usuário</span>
              </label>

              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button type="submit" disabled={saving} style={primaryBtnStyle}>
                  {saving ? "Aplicando..." : "Aplicar Ajuste"}
                </button>
                <button type="button" onClick={closeAdjust} disabled={saving} style={btnStyle("#1a202a")}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
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
  height: 38,
  padding: "0 14px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
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
