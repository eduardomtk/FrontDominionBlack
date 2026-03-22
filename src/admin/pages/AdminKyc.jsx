import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAdminKycRequests, fetchAdminKycDetail, reviewAdminKyc } from "../services/admin.api";

export default function AdminKyc() {
  const [filter, setFilter] = useState("pending"); // pending | approved | rejected | resubmit_required | all
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const [actionType, setActionType] = useState("approve"); // approve | reject | resubmit
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [openingDoc, setOpeningDoc] = useState(false);

  const loadingRef = useRef(false);

  const title = useMemo(() => {
    if (filter === "pending") return "Pendentes";
    if (filter === "approved") return "Aprovados";
    if (filter === "rejected") return "Recusados";
    if (filter === "resubmit_required") return "Reenvio solicitado";
    return "Todos";
  }, [filter]);

  function normalizeRows(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  }

  const load = async () => {
    setError("");
    setLoading(true);
    loadingRef.current = true;

    try {
      const data = await fetchAdminKycRequests({
        status: filter,
        limit: 200,
        offset: 0,
      });

      setRows(normalizeRows(data));
    } catch (e) {
      setError(e?.message || "Erro ao carregar KYC");
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
      const data = await fetchAdminKycRequests({ status: filter, limit: 200, offset: 0 });
      setRows(normalizeRows(data));
    } catch (e) {
      console.warn("[AdminKyc] loadSilent error:", e?.message || e);
    } finally {
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    load();

    const poll = setInterval(() => loadSilent(), 12000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const openDetail = (r) => {
    setSelected(r);
    setActionType("approve");
    setNote("");
    setModalOpen(true);
  };

  const closeDetail = () => {
    if (saving || openingDoc) return;
    setModalOpen(false);
    setSelected(null);
    setActionType("approve");
    setNote("");
  };

  const statusPill = (s) => {
    const v = String(s || "pending");
    const isApproved = v === "approved";
    const isRejected = v === "rejected";
    const isResubmit = v === "resubmit_required";

    const bg = isApproved ? "#142b18" : isRejected ? "#2b1414" : isResubmit ? "#2b2614" : "#141c2b";
    const color = isApproved ? "#b7f7c0" : isRejected ? "#ffb4b4" : isResubmit ? "#ffe1a6" : "#bcd6ff";

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
          fontWeight: 800,
          textTransform: "lowercase",
        }}
      >
        {v}
      </span>
    );
  };

  const openSignedDoc = async (request_id, which) => {
    if (!request_id) return;

    setOpeningDoc(true);
    try {
      const detail = await fetchAdminKycDetail({ request_id });
      const url = which === "back" ? detail?.back_url : detail?.front_url;

      if (!url) {
        alert("Sem arquivo disponível.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(e?.message || "Falha ao abrir documento");
    } finally {
      setOpeningDoc(false);
    }
  };

  const onSubmitReview = async (e) => {
    e.preventDefault();
    if (!selected?.id) return;

    if ((actionType === "reject" || actionType === "resubmit") && !String(note || "").trim()) {
      alert("Mensagem/observação é obrigatória para Recusar ou Solicitar Reenvio.");
      return;
    }

    setSaving(true);

    const newStatus =
      actionType === "approve" ? "approved" : actionType === "reject" ? "rejected" : "resubmit_required";

    // optimistic
    setRows((prev) =>
      prev.map((r) => {
        if (String(r.id) !== String(selected.id)) return r;
        return { ...r, status: newStatus, admin_note: String(note || "").trim() };
      })
    );
    setSelected((prev) => (prev ? { ...prev, status: newStatus, admin_note: String(note || "").trim() } : prev));

    try {
      await reviewAdminKyc({
        request_id: selected.id,
        action: actionType, // approve | reject | resubmit
        message: String(note || "").trim(), // ✅ antes você mandava "note" e a API ignorava
      });

      alert(
        newStatus === "approved"
          ? "KYC aprovado com sucesso."
          : newStatus === "rejected"
          ? "KYC recusado."
          : "Reenvio solicitado ao usuário."
      );

      closeDetail();
      await loadSilent();
    } catch (err) {
      alert(err?.message || "Falha ao aplicar ação KYC");
      await loadSilent();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0 }}>KYC</h1>

          <button
            onClick={load}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid #2b2f36",
              background: "#151a21",
              color: "#fff",
              cursor: "pointer",
            }}
            disabled={loading}
          >
            Atualizar
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={inputStyle} disabled={loading}>
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovados</option>
            <option value="rejected">Recusados</option>
            <option value="resubmit_required">Reenvio solicitado</option>
            <option value="all">Todos</option>
          </select>

          <div style={{ color: "#9aa4b2", fontSize: 12 }}>
            {title}: <b style={{ color: "#e5e7eb" }}>{rows.length}</b>
          </div>
        </div>
      </div>

      <p style={{ color: "#9aa4b2", marginTop: 8 }}>
        Visualize documentos (frente/verso) e aprove/recuse/solicite reenvio com mensagem.
      </p>

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

      {loading ? (
        <p style={{ marginTop: 16 }}>Carregando...</p>
      ) : (
        <div
          style={{
            marginTop: 16,
            borderRadius: 12,
            border: "1px solid #2b2f36",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.3fr 0.9fr 0.9fr 1fr",
              gap: 0,
              padding: "12px 14px",
              background: "#0f141a",
              color: "#cbd5e1",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <div>Usuário</div>
            <div>Status</div>
            <div>Enviado</div>
            <div>Ações</div>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: 14, color: "#9aa4b2" }}>Nenhuma solicitação KYC.</div>
          ) : (
            rows.map((r) => {
              const sentAt = r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-";

              return (
                <div
                  key={String(r.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.3fr 0.9fr 0.9fr 1fr",
                    padding: "12px 14px",
                    borderTop: "1px solid #20242c",
                    background: "#0b1016",
                    color: "#e5e7eb",
                    alignItems: "center",
                  }}
                >
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    <div style={{ fontWeight: 700 }}>{r.email || "(sem email)"}</div>
                    <div style={{ color: "#9aa4b2", fontSize: 12 }}>id: {String(r.user_id || "").slice(0, 8)}…</div>
                  </div>

                  <div>{statusPill(r.status)}</div>

                  <div style={{ color: "#cbd5e1" }}>{sentAt}</div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => openDetail(r)} style={btnStyle("#1a202a")}>
                      Revisar
                    </button>
                    <button
                      onClick={() => openSignedDoc(r.id, "front")}
                      style={btnStyle("#1d2a3a")}
                      disabled={openingDoc}
                    >
                      Ver Frente
                    </button>
                    <button
                      onClick={() => openSignedDoc(r.id, "back")}
                      style={btnStyle("#1d2a3a")}
                      disabled={openingDoc}
                    >
                      Ver Verso
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {modalOpen && selected ? (
        <div
          onClick={closeDetail}
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
              width: "min(720px, 100%)",
              borderRadius: 14,
              border: "1px solid #2b2f36",
              background: "#0b1016",
              padding: 16,
              color: "#e5e7eb",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Revisar KYC</div>
                <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4 }}>
                  {selected.email || "(sem email)"} • id: {String(selected.user_id || "").slice(0, 8)}…
                </div>
              </div>

              <button onClick={closeDetail} disabled={saving || openingDoc} style={xBtnStyle}>
                ✕
              </button>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <span style={{ color: "#9aa4b2", fontSize: 12 }}>Status atual:</span>{" "}
                <span style={{ marginLeft: 6 }}>{statusPill(selected.status)}</span>
              </div>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => openSignedDoc(selected.id, "front")}
                  style={btnStyle("#1d2a3a")}
                  disabled={saving || openingDoc}
                >
                  Ver Frente
                </button>
                <button
                  onClick={() => openSignedDoc(selected.id, "back")}
                  style={btnStyle("#1d2a3a")}
                  disabled={saving || openingDoc}
                >
                  Ver Verso
                </button>
              </div>
            </div>

            <div style={{ marginTop: 14, borderTop: "1px solid #20242c", paddingTop: 14 }}>
              <form onSubmit={onSubmitReview}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Ação</div>
                    <select
                      value={actionType}
                      onChange={(e) => setActionType(e.target.value)}
                      style={inputStyle2}
                      disabled={saving}
                    >
                      <option value="approve">Aprovar</option>
                      <option value="reject">Recusar</option>
                      <option value="resubmit">Solicitar Reenvio</option>
                    </select>
                  </div>

                  <div>
                    <div style={labelStyle}>Dica rápida</div>
                    <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 8 }}>
                      {actionType === "approve"
                        ? "Aprova a identidade do usuário."
                        : actionType === "reject"
                        ? "Recusa e informa o motivo (obrigatório)."
                        : "Solicita novas fotos e envia a mensagem (obrigatório)."}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={labelStyle}>
                    Mensagem / Observação{" "}
                    {(actionType === "reject" || actionType === "resubmit") ? "(obrigatório)" : "(opcional)"}
                  </div>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    style={inputStyle2}
                    placeholder={
                      actionType === "resubmit"
                        ? "Ex: Envie fotos mais nítidas, sem reflexo, documento inteiro..."
                        : actionType === "reject"
                        ? "Ex: Documento inválido / não corresponde ao usuário..."
                        : "Ex: Validado."
                    }
                    disabled={saving}
                  />
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button type="submit" disabled={saving} style={primaryBtnStyle}>
                    {saving ? "Aplicando..." : "Aplicar"}
                  </button>
                  <button type="button" onClick={closeDetail} disabled={saving} style={btnStyle("#1a202a")}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>

            {selected.admin_note ? (
              <div style={{ marginTop: 12, color: "#9aa4b2", fontSize: 12 }}>
                Última observação: <b style={{ color: "#e5e7eb" }}>{selected.admin_note}</b>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** ===== estilos no padrão do AdminUsersWallets ===== */
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
  height: 34,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid #2b2f36",
  background: "#0f141a",
  color: "#fff",
  outline: "none",
};

const inputStyle2 = {
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
