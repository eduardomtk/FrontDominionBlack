import { useEffect, useMemo, useRef, useState } from "react";
import { adminDeleteUser, adminUpdateUser, fetchAdminUsers } from "../services/admin.api";

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const [saving, setSaving] = useState(false);

  // checkbox: atualizar email no Auth
  const [updateAuthEmail, setUpdateAuthEmail] = useState(false);

  // form editável (qualquer campo do profile)
  const [form, setForm] = useState(() => emptyForm());

  // anti race no polling
  const loadingRef = useRef(false);

  // delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteSelected, setDeleteSelected] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  function normalizeRows(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.users)) return data.users;
    return [];
  }

  // pega profile "onde quer que ele esteja"
  function pickProfile(u) {
    const a = u?.profile;
    const b = u?.profiles;
    const c = u?.profile_data;
    const d = u?.profileRow;
    const e = u?.profile_row;
    return (a && typeof a === "object" ? a : null) ||
      (b && typeof b === "object" ? b : null) ||
      (c && typeof c === "object" ? c : null) ||
      (d && typeof d === "object" ? d : null) ||
      (e && typeof e === "object" ? e : null) ||
      {};
  }

  // ✅ Agora a fonte principal é profiles.email
  function getProfileEmail(u) {
    const p = pickProfile(u);
    return (p?.email && String(p.email).trim()) || "";
  }

  // ✅ “auth email” (pra debug / transparência)
  function getAuthEmail(u) {
    return (
      (u?.email && String(u.email).trim()) ||
      (u?.auth_email && String(u.auth_email).trim()) ||
      (u?.user_email && String(u.user_email).trim()) ||
      (u?.auth?.email && String(u.auth.email).trim()) ||
      ""
    );
  }

  // ✅ Email que aparece na lista: profiles primeiro, auth como fallback
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

  function getKycLabel(u, p) {
    const v =
      u?.kyc_status ||
      u?.kycStatus ||
      p?.kyc_status ||
      p?.kyc_verified ||
      p?.identity_verified ||
      null;

    if (v === true) return "approved";
    if (!v) return "—";
    return String(v);
  }

  const load = async () => {
    setError("");
    setLoading(true);
    loadingRef.current = true;

    try {
      const data = await fetchAdminUsers();
      setRows(normalizeRows(data));
    } catch (e) {
      setError(e?.message || "Erro ao carregar usuários");
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
      const data = await fetchAdminUsers();
      setRows(normalizeRows(data));
    } catch (e) {
      console.warn("[AdminUsers] loadSilent error:", e?.message || e);
    } finally {
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    load();
    const poll = setInterval(() => loadSilent(), 8000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const term = String(q || "").trim().toLowerCase();
    if (!term) return rows;

    return rows.filter((u) => {
      const p = pickProfile(u);
      const email = getEmail(u).toLowerCase();
      const authEmail = getAuthEmail(u).toLowerCase();
      const name = getNameFromProfile(p).toLowerCase();
      const cpf = String(p?.cpf || "").toLowerCase();
      const id = String(u?.id || u?.user_id || "").toLowerCase();
      return (
        email.includes(term) ||
        authEmail.includes(term) ||
        name.includes(term) ||
        cpf.includes(term) ||
        id.includes(term)
      );
    });
  }, [rows, q]);

  const openEdit = (u) => {
    const p = pickProfile(u);

    setSelected(u);
    setUpdateAuthEmail(false);

    setForm({
      id: String(u?.id || u?.user_id || p?.id || ""),
      email: getEmail(u) || "",
      email_verified: Boolean(p?.email_verified),

      first_name: p?.first_name || "",
      last_name: p?.last_name || "",
      name: p?.name || "",
      nickname: p?.nickname || "",
      phone: p?.phone || "",
      cpf: p?.cpf || "",
      birth_date: p?.birth_date ? String(p.birth_date).slice(0, 10) : "",
      country: p?.country || "",
      city: p?.city || "",
      sex: p?.sex || "",

      ranking_opt_in: Boolean(p?.ranking_opt_in ?? true),
    });

    setModalOpen(true);
  };

  const closeEdit = () => {
    if (saving) return;
    setModalOpen(false);
    setSelected(null);
    setUpdateAuthEmail(false);
    setForm(emptyForm());
  };

  const openDelete = (u) => {
    setDeleteSelected(u);
    setDeleteConfirmText("");
    setDeleteModalOpen(true);
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setDeleteSelected(null);
    setDeleteConfirmText("");
  };

  const onDelete = async () => {
    if (!deleteSelected) return;

    const typed = String(deleteConfirmText || "").trim().toLowerCase();
    if (typed !== "delete") {
      alert('Digite "delete" para confirmar.');
      return;
    }

    const user_id = String(deleteSelected?.id || deleteSelected?.user_id || "").trim();
    if (!user_id) {
      alert("user_id inválido.");
      return;
    }

    const request_id =
      (typeof crypto !== "undefined" && crypto?.randomUUID?.()) ||
      `del_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    setDeleting(true);

    try {
      console.groupCollapsed(`[ADMIN][DeleteUser] submit request_id=${request_id}`);
      console.log("user_id:", user_id);
      console.log("typed_confirmation:", typed);
      console.groupEnd();

      await adminDeleteUser({
        request_id,
        user_id,
        confirm_text: typed,
      });

      alert("Usuário deletado com sucesso.");
      closeDelete();

      if (modalOpen) closeEdit();

      await loadSilent();
    } catch (e) {
      console.error(`[ADMIN][DeleteUser] error request_id=${request_id}:`, e);
      alert(e?.message || "Falha ao deletar usuário");
      await loadSilent();
    } finally {
      setDeleting(false);
    }
  };

  const onSave = async () => {
    if (!selected) return;

    const user_id = String(selected?.id || selected?.user_id || form?.id || "").trim();
    if (!user_id) {
      alert("user_id inválido.");
      return;
    }

    const request_id =
      (typeof crypto !== "undefined" && crypto?.randomUUID?.()) ||
      `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    setSaving(true);

    try {
      const profile_patch = {
        email: String(form.email || "").trim() || null,
        email_verified: Boolean(form.email_verified),

        first_name: String(form.first_name || "").trim() || null,
        last_name: String(form.last_name || "").trim() || null,
        name: String(form.name || "").trim() || null,
        nickname: String(form.nickname || "").trim() || null,
        phone: String(form.phone || "").trim() || null,
        cpf: String(form.cpf || "").trim() || null,
        birth_date: form.birth_date ? String(form.birth_date).slice(0, 10) : null,
        country: String(form.country || "").trim() || null,
        city: String(form.city || "").trim() || null,
        sex: String(form.sex || "").trim() || null,
        ranking_opt_in: Boolean(form.ranking_opt_in),
      };

      const auth_email = updateAuthEmail ? String(form.email || "").trim() : null;

      console.groupCollapsed(`[ADMIN][EditUser] submit request_id=${request_id}`);
      console.log("user_id:", user_id);
      console.log("auth_email:", auth_email);
      console.log("updateAuthEmail:", updateAuthEmail);
      console.log("profile_patch:", profile_patch);
      console.groupEnd();

      await adminUpdateUser({
        request_id,
        user_id,
        profile_patch,
        auth_email,
      });

      alert("Usuário atualizado com sucesso.");
      closeEdit();
      await loadSilent();
    } catch (e) {
      console.error(`[ADMIN][EditUser] error request_id=${request_id}:`, e);
      alert(e?.message || "Falha ao salvar usuário");
      await loadSilent();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0 }}>Usuários</h1>

          <button
            onClick={load}
            style={btnStyle("#151a21")}
            disabled={loading}
            title="Forçar atualização"
          >
            Atualizar
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 380 }}>
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
        Lista em tempo real via <b>profiles</b>. Edite dados do usuário e (se necessário) atualize o e-mail do Auth.
      </p>

      {error ? (
        <div style={errorBoxStyle}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <p style={{ marginTop: 16 }}>Carregando...</p>
      ) : (
        <div style={tableWrapStyle}>
          <div style={theadStyle}>
            <div>Email</div>
            <div>Nome</div>
            <div>CPF</div>
            <div>KYC</div>
            <div>Ações</div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: 14, color: "#9aa4b2" }}>Nenhum usuário encontrado.</div>
          ) : (
            filtered.map((u) => {
              const p = pickProfile(u);
              const id = String(u?.id || u?.user_id || p?.id || "");
              const email = getEmail(u) || "(sem email)";
              const authEmail = getAuthEmail(u) || "";
              const name = getNameFromProfile(p);
              const cpf = getCpfFromProfile(p);
              const kyc = getKycLabel(u, p);

              return (
                <div key={id || email} style={trStyle}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    <div style={{ fontWeight: 800 }}>{email}</div>

                    {authEmail && authEmail !== email ? (
                      <div style={{ color: "#9aa4b2", fontSize: 11 }}>
                        auth: {authEmail}
                      </div>
                    ) : null}

                    <div style={{ color: "#9aa4b2", fontSize: 12 }}>id: {id ? `${id.slice(0, 8)}…` : "—"}</div>
                  </div>

                  <div style={{ color: "#e5e7eb", fontWeight: 700 }}>{name}</div>

                  <div style={{ color: "#cbd5e1" }}>{cpf}</div>

                  <div>{statusPill(kyc)}</div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => openEdit(u)} style={btnStyle("#1a202a")}>
                      Editar
                    </button>
                    <button onClick={() => openDelete(u)} style={dangerBtnStyle}>
                      Deletar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODAL EDIT */}
      {modalOpen && selected ? (
        <div onClick={closeEdit} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Editar Usuário</div>
                <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4 }}>
                  {String(form.email || "(sem email)")} • id: {String(form.id || "").slice(0, 8)}…
                </div>
              </div>

              <button onClick={closeEdit} disabled={saving} style={xBtnStyle}>
                ✕
              </button>
            </div>

            <div style={{ marginTop: 14, borderTop: "1px solid #20242c", paddingTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Email (profiles)">
                  <input
                    value={form.email}
                    onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                    style={inputStyle2}
                    placeholder="email@dominio.com"
                    disabled={saving}
                  />
                </Field>

                <Field label="Nome (name)">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    style={inputStyle2}
                    placeholder="Nome completo"
                    disabled={saving}
                  />
                </Field>

                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={updateAuthEmail}
                      onChange={(e) => setUpdateAuthEmail(Boolean(e.target.checked))}
                      disabled={saving}
                    />
                    <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 800 }}>Atualizar Email no Auth</span>
                  </label>

                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(form.email_verified)}
                      onChange={(e) => setForm((s) => ({ ...s, email_verified: Boolean(e.target.checked) }))}
                      disabled={saving}
                    />
                    <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 800 }}>email_verified</span>
                  </label>
                </div>

                <Field label="Primeiro nome (first_name)">
                  <input
                    value={form.first_name}
                    onChange={(e) => setForm((s) => ({ ...s, first_name: e.target.value }))}
                    style={inputStyle2}
                    disabled={saving}
                  />
                </Field>

                <Field label="Sobrenome (last_name)">
                  <input
                    value={form.last_name}
                    onChange={(e) => setForm((s) => ({ ...s, last_name: e.target.value }))}
                    style={inputStyle2}
                    disabled={saving}
                  />
                </Field>

                <Field label="Apelido (nickname)">
                  <input
                    value={form.nickname}
                    onChange={(e) => setForm((s) => ({ ...s, nickname: e.target.value }))}
                    style={inputStyle2}
                    disabled={saving}
                  />
                </Field>

                <Field label="Telefone (phone)">
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                    style={inputStyle2}
                    disabled={saving}
                  />
                </Field>

                <Field label="CPF (cpf)">
                  <input
                    value={form.cpf}
                    onChange={(e) => setForm((s) => ({ ...s, cpf: e.target.value }))}
                    style={inputStyle2}
                    disabled={saving}
                  />
                </Field>

                <Field label="Nascimento (birth_date)">
                  <input
                    value={form.birth_date}
                    onChange={(e) => setForm((s) => ({ ...s, birth_date: e.target.value }))}
                    style={inputStyle2}
                    type="date"
                    disabled={saving}
                  />
                </Field>

                <Field label="País (country)">
                  <input
                    value={form.country}
                    onChange={(e) => setForm((s) => ({ ...s, country: e.target.value }))}
                    style={inputStyle2}
                    disabled={saving}
                  />
                </Field>

                <Field label="Cidade (city)">
                  <input
                    value={form.city}
                    onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))}
                    style={inputStyle2}
                    disabled={saving}
                  />
                </Field>

                <Field label="Sexo (sex)">
                  <input
                    value={form.sex}
                    onChange={(e) => setForm((s) => ({ ...s, sex: e.target.value }))}
                    style={inputStyle2}
                    disabled={saving}
                  />
                </Field>

                <Field label="Ranking (ranking_opt_in)">
                  <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(form.ranking_opt_in)}
                      onChange={(e) => setForm((s) => ({ ...s, ranking_opt_in: Boolean(e.target.checked) }))}
                      disabled={saving}
                    />
                    <span style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 800 }}>Participa do ranking</span>
                  </label>
                </Field>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button type="button" disabled={saving} style={primaryBtnStyle} onClick={onSave}>
                  {saving ? "Salvando..." : "Salvar Perfil"}
                </button>
                <button type="button" onClick={closeEdit} disabled={saving} style={btnStyle("#1a202a")}>
                  Cancelar
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10, color: "#9aa4b2", fontSize: 12 }}>
              Dica: se você marcar “Atualizar Email no Auth”, o backend precisa atualizar também em <b>auth.users</b>.
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL DELETE */}
      {deleteModalOpen && deleteSelected ? (
        <div onClick={closeDelete} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={deleteModalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: "#ffdddd" }}>Deletar Usuário</div>
                <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 6 }}>
                  Essa ação remove o usuário e os dados relacionados.
                </div>
              </div>

              <button onClick={closeDelete} disabled={deleting} style={xBtnStyle}>
                ✕
              </button>
            </div>

            <div style={{ marginTop: 14, padding: 12, border: "1px solid #2b2f36", borderRadius: 12, background: "#0f141a" }}>
              <div style={{ fontSize: 12, color: "#9aa4b2" }}>Usuário</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#e5e7eb", marginTop: 4 }}>
                {getEmail(deleteSelected) || "(sem email)"}
              </div>
              <div style={{ fontSize: 12, color: "#9aa4b2", marginTop: 4 }}>
                id: {String(deleteSelected?.id || deleteSelected?.user_id || "").slice(0, 8)}…
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={labelStyle}>Digite <b style={{ color: "#fff" }}>delete</b> para confirmar</div>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                style={inputStyle2}
                placeholder="delete"
                disabled={deleting}
                autoFocus
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting || String(deleteConfirmText || "").trim().toLowerCase() !== "delete"}
                style={dangerPrimaryBtnStyle}
              >
                {deleting ? "Deletando..." : "Confirmar Exclusão"}
              </button>

              <button type="button" onClick={closeDelete} disabled={deleting} style={btnStyle("#1a202a")}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** ===== helpers ===== */

function emptyForm() {
  return {
    id: "",
    email: "",
    email_verified: false,

    first_name: "",
    last_name: "",
    name: "",
    nickname: "",
    phone: "",
    cpf: "",
    birth_date: "",
    country: "",
    city: "",
    sex: "",
    ranking_opt_in: true,
  };
}

function Field({ label, children }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

function statusPill(s) {
  const v = String(s || "—").toLowerCase();

  const isApproved = v === "approved";
  const isPending = v === "pending";
  const isRejected = v === "rejected" || v === "resubmit_required";

  const bg = isApproved ? "#142b18" : isRejected ? "#2b1414" : isPending ? "#141c2b" : "#0f141a";
  const color = isApproved ? "#b7f7c0" : isRejected ? "#ffb4b4" : isPending ? "#bcd6ff" : "#cbd5e1";

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
        textTransform: "lowercase",
      }}
    >
      {v}
    </span>
  );
}

/** ===== estilos ===== */
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

const dangerBtnStyle = {
  height: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #4a2323",
  background: "#2a1414",
  color: "#ffcdcd",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
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

const labelStyle = { fontSize: 12, color: "#9aa4b2", marginBottom: 6, fontWeight: 800 };

const primaryBtnStyle = {
  height: 38,
  padding: "0 14px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const dangerPrimaryBtnStyle = {
  height: 38,
  padding: "0 14px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg, #dc2626, #b91c1c)",
  color: "#fff",
  fontWeight: 900,
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

const errorBoxStyle = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #442",
  background: "#221",
  color: "#ffd6d6",
};

const tableWrapStyle = {
  marginTop: 16,
  borderRadius: 12,
  border: "1px solid #2b2f36",
  overflow: "hidden",
};

const theadStyle = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr 0.9fr 0.8fr 0.7fr",
  gap: 0,
  padding: "12px 14px",
  background: "#0f141a",
  color: "#cbd5e1",
  fontWeight: 900,
  fontSize: 13,
};

const trStyle = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr 0.9fr 0.8fr 0.7fr",
  padding: "12px 14px",
  borderTop: "1px solid #20242c",
  background: "#0b1016",
  color: "#e5e7eb",
  alignItems: "center",
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
  width: "min(920px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  borderRadius: 14,
  border: "1px solid #2b2f36",
  background: "#0b1016",
  padding: 16,
  color: "#e5e7eb",
};

const deleteModalStyle = {
  width: "min(460px, 100%)",
  borderRadius: 14,
  border: "1px solid #2b2f36",
  background: "#0b1016",
  padding: 16,
  color: "#e5e7eb",
};