// src/admin/pages/AdminSettings.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAdminUsers,
  adminBanUser,
  fetchAdminSecuritySettings,
  saveAdminSecuritySettings,
  fetchAdminMaintenanceSettings,
  saveAdminMaintenanceSettings,
} from "../services/admin.api";

/**
 * ✅ Página: Configurações (Admin)
 * - Manutenção: mantida.
 * - Segurança: políticas + lista de usuários + BAN REAL via Edge Function.
 * - ✅ Agora: Salvar/Recarregar funcionam (GET/POST nas Edge Functions).
 *
 * ✅ FIX: compatibilidade com schema antigo vs novo (pra não “sumir” após F5)
 * - Lê tanto formato antigo (securityEnabled, maxAccountsPerIp...)
 *   quanto novo (enabled, multi_account_ip...)
 * - Salva gravando os dois formatos dentro do JSON, assim nunca mais desincroniza.
 */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
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
    whiteSpace: "nowrap",
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

function Pill({ label, tone = "neutral", title }) {
  const map = {
    ok: { bg: "#142b18", color: "#b7f7c0" },
    warn: { bg: "#2b2414", color: "#ffd6a6" },
    bad: { bg: "#2b1414", color: "#ffb4b4" },
    neutral: { bg: "#0f141a", color: "#cbd5e1" },
  };
  const c = map[tone] || map.neutral;

  return (
    <span
      title={title || ""}
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        border: "1px solid #2b2f36",
        background: c.bg,
        color: c.color,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: 0.2,
      }}
    >
      {label}
    </span>
  );
}

function SectionHeader({ title, subtitle, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontWeight: 900, fontSize: 16, color: "#e5e7eb" }}>{title}</div>
        {subtitle ? <div style={{ marginTop: 4, color: "#9aa4b2", fontSize: 12 }}>{subtitle}</div> : null}
      </div>
      {right ? <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{right}</div> : null}
    </div>
  );
}

function Row({ children }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
      {children}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 220, flex: 1 }}>
      <div style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900 }}>{label}</div>
      {children}
      {hint ? <div style={{ fontSize: 11, color: "#9aa4b2" }}>{hint}</div> : null}
    </div>
  );
}

function ToggleLine({ label, desc, checked, onChange, rightNode, disabled }) {
  return (
    <div
      style={{
        border: "1px solid #20242c",
        borderRadius: 12,
        padding: 12,
        background: "#0f141a",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <div style={{ minWidth: 260, flex: 1 }}>
        <div style={{ fontWeight: 900, color: "#e5e7eb" }}>{label}</div>
        {desc ? <div style={{ marginTop: 4, fontSize: 12, color: "#9aa4b2" }}>{desc}</div> : null}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {rightNode || null}
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer" }}>
          <input
            type="checkbox"
            checked={!!checked}
            onChange={(e) => (disabled ? null : onChange(!!e.target.checked))}
            disabled={disabled}
          />
          <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 900 }}>{checked ? "ATIVO" : "INATIVO"}</span>
        </label>
      </div>
    </div>
  );
}

/** ===== modal ===== */
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

const xBtnStyle = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "1px solid #2b2f36",
  background: "#0f141a",
  color: "#fff",
  cursor: "pointer",
};

const dangerBtnStyle = {
  height: 38,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid #442",
  background: "#2b1414",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const softBoxStyle = {
  border: "1px solid #20242c",
  borderRadius: 12,
  padding: 12,
  background: "#0f141a",
};

/** ===== helpers (essencial do AdminUsers) ===== */
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
  return (a && typeof a === "object" ? a : null) ||
    (b && typeof b === "object" ? b : null) ||
    (c && typeof c === "object" ? c : null) ||
    (d && typeof d === "object" ? d : null) ||
    (e && typeof e === "object" ? e : null) ||
    {};
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

// tenta inferir status de bloqueio por flags comuns (até você padronizar no backend)
function isUserBlocked(u) {
  const p = pickProfile(u);
  const candidates = [
    p?.banned, p?.is_banned, p?.blocked, p?.is_blocked, p?.disabled,
    u?.banned, u?.is_banned, u?.blocked, u?.is_blocked, u?.disabled,
  ];
  return candidates.some((v) => v === true);
}

function blockedPill(u) {
  const blocked = isUserBlocked(u);
  return blocked ? <Pill label="BLOQUEADO" tone="bad" /> : <Pill label="ATIVO" tone="ok" />;
}

function numOr(fallback, v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ✅ pega value de responses diferentes:
// - { ok:true, key:'security', value:{...} }
// - { value:{...} }
// - {...} direto
function unwrapValue(resp) {
  if (!resp) return {};
  if (resp?.value && typeof resp.value === "object" && (resp.ok === true || resp.key)) return resp.value;
  if (resp?.value && typeof resp.value === "object") return resp.value;
  if (typeof resp === "object") return resp;
  return {};
}

// ✅ getters compatíveis com schema novo e legado
function pickSecEnabled(secVal) {
  return Boolean(secVal?.enabled ?? secVal?.securityEnabled ?? true);
}
function pickMultiIpEnabled(secVal) {
  return Boolean(
    secVal?.multi_account_ip?.enabled ??
    secVal?.multiAccountIpEnabled ??
    secVal?.multi_account_ip_enabled ??
    true
  );
}
function pickMaxAccountsPerIp(secVal) {
  const v =
    secVal?.multi_account_ip?.max_accounts_per_ip ??
    secVal?.maxAccountsPerIp ??
    secVal?.max_accounts_per_ip ??
    2;
  return String(numOr(2, v));
}
function pickIpWindowMinutes(secVal) {
  const v =
    secVal?.multi_account_ip?.window_minutes ??
    secVal?.ipWindowMinutes ??
    secVal?.window_minutes ??
    60;
  return String(numOr(60, v));
}
function pickAutoActionEnabled(secVal) {
  return Boolean(
    secVal?.multi_account_ip?.auto_action?.enabled ??
    secVal?.autoBanOnMultiIpEnabled ??
    secVal?.auto_action_enabled ??
    false
  );
}
function pickAutoThreshold(secVal) {
  const v =
    secVal?.multi_account_ip?.auto_action?.threshold ??
    secVal?.autoBanThreshold ??
    secVal?.auto_action_threshold ??
    3;
  return String(numOr(3, v));
}
function pickAutoAction(secVal) {
  return String(
    secVal?.multi_account_ip?.auto_action?.action ??
    secVal?.autoBanAction ??
    secVal?.auto_action ??
    "FLAG"
  );
}

function pickMaintEnabled(mVal) {
  return Boolean(mVal?.enabled ?? mVal?.maintenanceEnabled ?? false);
}
function pickMaintViewOnly(mVal) {
  return Boolean(mVal?.view_only ?? mVal?.maintenanceViewOnly ?? true);
}
function pickMaintBlockTrading(mVal) {
  return Boolean(mVal?.block_trading ?? mVal?.maintenanceBlockTrading ?? true);
}
function pickMaintMessage(mVal, fallback) {
  return String(mVal?.message ?? mVal?.maintenanceMessage ?? fallback ?? "");
}

export default function AdminSettings() {
  const [tab, setTab] = useState("SECURITY");

  // ===== topo: backend status =====
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");
  const [settingsErr, setSettingsErr] = useState("");

  const settingsBusy = settingsLoading || settingsSaving;

  // ===== Segurança: políticas úteis =====
  const [securityEnabled, setSecurityEnabled] = useState(true);

  const [multiAccountIpEnabled, setMultiAccountIpEnabled] = useState(true);
  const [maxAccountsPerIp, setMaxAccountsPerIp] = useState("2");
  const [ipWindowMinutes, setIpWindowMinutes] = useState("60");

  const [autoBanOnMultiIpEnabled, setAutoBanOnMultiIpEnabled] = useState(false);
  const [autoBanThreshold, setAutoBanThreshold] = useState("3");
  const [autoBanAction, setAutoBanAction] = useState("FLAG"); // FLAG | TEMP_LOCK | PERM_BAN

  // ===== Segurança: lista de usuários =====
  const [usersOpen, setUsersOpen] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersRows, setUsersRows] = useState([]);
  const [usersError, setUsersError] = useState("");
  const [q, setQ] = useState("");

  const usersLoadingRef = useRef(false);
  const usersPollRef = useRef(null);

  // modal de bloqueio
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const [banMode, setBanMode] = useState("PERM"); // PERM | TEMP | FLAG
  const [banReason, setBanReason] = useState("");
  const [banNote, setBanNote] = useState("");
  const [banMinutes, setBanMinutes] = useState("120");
  const [banAlsoEmail, setBanAlsoEmail] = useState(true);

  const [banBusy, setBanBusy] = useState(false);
  const [banMsg, setBanMsg] = useState("");

  // ===== Manutenção =====
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceViewOnly, setMaintenanceViewOnly] = useState(true);
  const [maintenanceBlockTrading, setMaintenanceBlockTrading] = useState(true);
  const [maintenanceMessage, setMaintenanceMessage] = useState(
    "Estamos em manutenção no momento. O gráfico permanece disponível, mas novas operações estão temporariamente bloqueadas."
  );

  const status = useMemo(() => {
    if (maintenanceEnabled) return { label: "MANUTENÇÃO", tone: "warn" };
    if (!securityEnabled) return { label: "SEGURANÇA OFF", tone: "bad" };
    return { label: "ONLINE", tone: "ok" };
  }, [maintenanceEnabled, securityEnabled]);

  const loadUsers = async ({ silent = false } = {}) => {
    if (usersLoadingRef.current) return;
    usersLoadingRef.current = true;

    if (!silent) {
      setUsersError("");
      setUsersLoading(true);
    }

    try {
      const data = await fetchAdminUsers();
      setUsersRows(normalizeRows(data));
      if (!silent) setUsersError("");
    } catch (e) {
      if (!silent) {
        setUsersError(e?.message || "Erro ao carregar usuários");
        setUsersRows([]);
      } else {
        console.warn("[AdminSettings][Security] loadUsers silent error:", e?.message || e);
      }
    } finally {
      if (!silent) setUsersLoading(false);
      usersLoadingRef.current = false;
    }
  };

  // ✅ carrega settings do backend e joga nos states
  const loadAllSettings = async () => {
    if (settingsBusy) return;

    setSettingsErr("");
    setSettingsMsg("");
    setSettingsLoading(true);

    try {
      const [sec, maint] = await Promise.allSettled([
        fetchAdminSecuritySettings(),
        fetchAdminMaintenanceSettings(),
      ]);

      if (sec.status === "rejected") throw sec.reason;
      if (maint.status === "rejected") throw maint.reason;

      const secVal = unwrapValue(sec.value);
      const mVal = unwrapValue(maint.value);

      // ===== security mapping (compatível) =====
      setSecurityEnabled(pickSecEnabled(secVal));

      setMultiAccountIpEnabled(pickMultiIpEnabled(secVal));
      setMaxAccountsPerIp(pickMaxAccountsPerIp(secVal));
      setIpWindowMinutes(pickIpWindowMinutes(secVal));

      setAutoBanOnMultiIpEnabled(pickAutoActionEnabled(secVal));
      setAutoBanThreshold(pickAutoThreshold(secVal));
      setAutoBanAction(pickAutoAction(secVal));

      // ===== maintenance mapping (compatível) =====
      setMaintenanceEnabled(pickMaintEnabled(mVal));
      setMaintenanceViewOnly(pickMaintViewOnly(mVal));
      setMaintenanceBlockTrading(pickMaintBlockTrading(mVal));
      setMaintenanceMessage(pickMaintMessage(mVal, maintenanceMessage));

      setSettingsMsg("Configurações carregadas.");
    } catch (e) {
      console.error("[AdminSettings] loadAllSettings error:", e);
      setSettingsErr(e?.message || "Falha ao carregar configurações");
    } finally {
      setSettingsLoading(false);
    }
  };

  // ✅ salva settings no backend
  const saveAllSettings = async () => {
    if (settingsBusy) return;

    setSettingsErr("");
    setSettingsMsg("");
    setSettingsSaving(true);

    const request_id =
      (typeof crypto !== "undefined" && crypto?.randomUUID?.()) ||
      `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    try {
      // ✅ schema NOVO (o que você quer padronizar)
      const securityPayload = {
        enabled: Boolean(securityEnabled),
        multi_account_ip: {
          enabled: Boolean(multiAccountIpEnabled),
          max_accounts_per_ip: numOr(2, maxAccountsPerIp),
          window_minutes: numOr(60, ipWindowMinutes),
          auto_action: {
            enabled: Boolean(autoBanOnMultiIpEnabled),
            threshold: numOr(3, autoBanThreshold),
            action: String(autoBanAction || "FLAG"),
          },
        },

        // ✅ schema LEGADO (pra não quebrar configs antigas no banco)
        securityEnabled: Boolean(securityEnabled),
        multiAccountIpEnabled: Boolean(multiAccountIpEnabled),
        maxAccountsPerIp: numOr(2, maxAccountsPerIp),
        ipWindowMinutes: numOr(60, ipWindowMinutes),
        autoBanOnMultiIpEnabled: Boolean(autoBanOnMultiIpEnabled),
        autoBanThreshold: numOr(3, autoBanThreshold),
        autoBanAction: String(autoBanAction || "FLAG"),
      };

      const maintenancePayload = {
        enabled: Boolean(maintenanceEnabled),
        view_only: Boolean(maintenanceViewOnly),
        block_trading: Boolean(maintenanceBlockTrading),
        message: String(maintenanceMessage || ""),

        // ✅ legado
        maintenanceEnabled: Boolean(maintenanceEnabled),
        maintenanceViewOnly: Boolean(maintenanceViewOnly),
        maintenanceBlockTrading: Boolean(maintenanceBlockTrading),
        maintenanceMessage: String(maintenanceMessage || ""),
      };

      await Promise.all([
        saveAdminSecuritySettings({ request_id, value: securityPayload }),
        saveAdminMaintenanceSettings({ request_id, value: maintenancePayload }),
      ]);

      setSettingsMsg("Configurações salvas com sucesso.");

      // ✅ recarrega do banco na sequência pra confirmar que persistiu e já refletir o que o backend gravou
      await loadAllSettings();
    } catch (e) {
      console.error("[AdminSettings] saveAllSettings error:", e);
      setSettingsErr(e?.message || "Falha ao salvar configurações");
    } finally {
      setSettingsSaving(false);
    }
  };

  // carrega no mount
  useEffect(() => {
    loadAllSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // users realtime/poll
  useEffect(() => {
    if (tab !== "SECURITY") return;

    loadUsers({ silent: false });

    if (usersPollRef.current) clearInterval(usersPollRef.current);
    usersPollRef.current = setInterval(() => loadUsers({ silent: true }), 8000);

    return () => {
      if (usersPollRef.current) {
        clearInterval(usersPollRef.current);
        usersPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filteredUsers = useMemo(() => {
    const term = String(q || "").trim().toLowerCase();
    if (!term) return usersRows;

    return (usersRows || []).filter((u) => {
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
  }, [usersRows, q]);

  const openBlock = (u) => {
    setSelectedUser(u);
    setBanMode("PERM");
    setBanReason("");
    setBanNote("");
    setBanMinutes("120");
    setBanAlsoEmail(true);
    setBanBusy(false);
    setBanMsg("");
    setBlockModalOpen(true);
  };

  const closeBlock = () => {
    if (banBusy) return;
    setBlockModalOpen(false);
    setSelectedUser(null);
    setBanMsg("");
  };

  const doBan = async () => {
    if (!selectedUser) return;
    if (banBusy) return;

    const user_id = String(selectedUser?.id || selectedUser?.user_id || "").trim();
    if (!user_id) {
      alert("user_id inválido.");
      return;
    }

    const reason = String(banReason || "").trim();
    if (!reason) {
      alert("Informe o motivo do bloqueio.");
      return;
    }

    const request_id =
      (typeof crypto !== "undefined" && crypto?.randomUUID?.()) ||
      `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    setBanBusy(true);
    setBanMsg("");

    try {
      const mode = String(banMode || "PERM").trim().toUpperCase();
      const minutes = mode === "TEMP" ? Number(banMinutes) : null;

      const resp = await adminBanUser({
        request_id,
        user_id,
        mode,
        minutes,
        reason,
        note: banNote ? String(banNote).trim() : null,
        block_email: Boolean(banAlsoEmail),
      });

      const ok = resp?.ok === true;
      if (!ok) {
        const msg = resp?.error ? String(resp.error) : "Falha ao bloquear";
        setBanMsg(`Falhou • ${msg}`);
      } else {
        setBanMsg("Bloqueio aplicado com sucesso.");
      }

      await loadUsers({ silent: true });
    } catch (e) {
      console.error("[ADMIN][BanUser] error:", e);
      setBanMsg(`Erro • ${e?.message || "Falha ao bloquear"}`);
      await loadUsers({ silent: true });
    } finally {
      setBanBusy(false);
    }
  };

  return (
    <div style={{ overflowAnchor: "none" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>Configurações</h1>
          <Pill label={status.label} tone={status.tone} title="Status geral" />
          {settingsLoading ? <Pill label="CARREGANDO..." tone="neutral" /> : null}
          {settingsSaving ? <Pill label="SALVANDO..." tone="neutral" /> : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            style={btnStyle("#151a21")}
            type="button"
            onClick={loadAllSettings}
            disabled={settingsBusy}
            title="Recarrega do Supabase"
          >
            {settingsLoading ? "..." : "Recarregar"}
          </button>

          <button
            style={btnStyle("#1a202a")}
            type="button"
            onClick={saveAllSettings}
            disabled={settingsBusy}
            title="Salva no Supabase"
          >
            {settingsSaving ? "..." : "Salvar"}
          </button>
        </div>
      </div>

      <p style={{ color: "#9aa4b2", marginTop: 8 }}>
        Segurança real = backend aplica ban/lock e nega login. O admin só dispara comandos (Edge Functions + secret).
      </p>

      {settingsErr ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #442", background: "#221", color: "#ffd6d6" }}>
          {settingsErr}
        </div>
      ) : null}

      {settingsMsg ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #244", background: "#112", color: "#cfe9ff" }}>
          {settingsMsg}
        </div>
      ) : null}

      {/* Tabs */}
      <div style={{ ...boxStyle, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setTab("SECURITY")}
          style={btnStyle(tab === "SECURITY" ? "#1a202a" : "#0f141a")}
        >
          Segurança
        </button>
        <button
          type="button"
          onClick={() => setTab("MAINTENANCE")}
          style={btnStyle(tab === "MAINTENANCE" ? "#1a202a" : "#0f141a")}
        >
          Manutenção
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Pill label={securityEnabled ? "SEGURANÇA ATIVA" : "SEGURANÇA OFF"} tone={securityEnabled ? "ok" : "bad"} />
          <Pill label={multiAccountIpEnabled ? "ANTI MULTI-IP" : "MULTI-IP OFF"} tone={multiAccountIpEnabled ? "ok" : "warn"} />
        </div>
      </div>

      {/* ===== SECURITY ===== */}
      {tab === "SECURITY" ? (
        <>
          <div style={boxStyle}>
            <SectionHeader
              title="Segurança"
              subtitle="Controle global e políticas. O ban de verdade é aplicado via Edge Function."
            />

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <ToggleLine
                label="Segurança global"
                desc="Desativar isso é perigoso. Use apenas para diagnóstico."
                checked={securityEnabled}
                onChange={setSecurityEnabled}
                rightNode={<Pill label={securityEnabled ? "PROTEGIDO" : "EXPOSTO"} tone={securityEnabled ? "ok" : "bad"} />}
              />
            </div>
          </div>

          <div style={boxStyle}>
            <SectionHeader
              title="Política de múltiplas contas por IP"
              subtitle="Detecta IP único logando várias contas (padrão típico de abuso/robô)."
            />

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <ToggleLine
                label="Ativar detecção de múltiplas contas por IP"
                desc="Quando um IP excede o limite dentro da janela, marca e/ou bloqueia conforme regra."
                checked={multiAccountIpEnabled}
                onChange={setMultiAccountIpEnabled}
                rightNode={<Pill label={multiAccountIpEnabled ? "ATIVO" : "OFF"} tone={multiAccountIpEnabled ? "ok" : "neutral"} />}
                disabled={!securityEnabled}
              />

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Field label="Máx. contas por IP" hint="Ex: 2 (bem rígido)">
                  <input
                    value={maxAccountsPerIp}
                    onChange={(e) => setMaxAccountsPerIp(e.target.value)}
                    style={inputStyle}
                    inputMode="numeric"
                    disabled={!securityEnabled || !multiAccountIpEnabled}
                  />
                </Field>

                <Field label="Janela (min)" hint="Ex: 60">
                  <input
                    value={ipWindowMinutes}
                    onChange={(e) => setIpWindowMinutes(e.target.value)}
                    style={inputStyle}
                    inputMode="numeric"
                    disabled={!securityEnabled || !multiAccountIpEnabled}
                  />
                </Field>
              </div>

              <div style={{ ...softBoxStyle }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Ação automática (opcional)</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#9aa4b2" }}>
                      Se um IP passar de um threshold maior, aplica ação.
                    </div>
                  </div>

                  <ToggleLine
                    label="Ativar auto-ação"
                    desc=""
                    checked={autoBanOnMultiIpEnabled}
                    onChange={setAutoBanOnMultiIpEnabled}
                    rightNode={<Pill label={autoBanOnMultiIpEnabled ? "ATIVO" : "OFF"} tone={autoBanOnMultiIpEnabled ? "warn" : "neutral"} />}
                    disabled={!securityEnabled || !multiAccountIpEnabled}
                  />
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                  <Field label="Threshold (contas/IP)" hint="Ex: 3">
                    <input
                      value={autoBanThreshold}
                      onChange={(e) => setAutoBanThreshold(e.target.value)}
                      style={inputStyle}
                      inputMode="numeric"
                      disabled={!securityEnabled || !multiAccountIpEnabled || !autoBanOnMultiIpEnabled}
                    />
                  </Field>

                  <Field label="Ação" hint="FLAG / TEMP / PERM">
                    <select
                      value={autoBanAction}
                      onChange={(e) => setAutoBanAction(e.target.value)}
                      style={{ ...inputStyle, padding: "0 8px" }}
                      disabled={!securityEnabled || !multiAccountIpEnabled || !autoBanOnMultiIpEnabled}
                    >
                      <option value="FLAG">FLAG (revisão)</option>
                      <option value="TEMP_LOCK">TRAVA TEMP</option>
                      <option value="PERM_BAN">BAN PERM</option>
                    </select>
                  </Field>
                </div>

                <div style={{ marginTop: 8, color: "#9aa4b2", fontSize: 12 }}>
                  (Depois) isso será aplicado pelo backend com logs, ban por IP e/ou freeze por usuário.
                </div>
              </div>
            </div>
          </div>

          {/* BLOQUEIO */}
          <div style={boxStyle}>
            <SectionHeader
              title="Bloqueio de contas (ban)"
              subtitle="Bloqueio real: usuário não loga mais (conta e opcionalmente e-mail)."
              right={
                <>
                  <button type="button" onClick={() => setUsersOpen((s) => !s)} style={btnStyle(usersOpen ? "#151a21" : "#1a202a")}>
                    {usersOpen ? "Ocultar lista" : "Ver lista"}
                  </button>
                  <button type="button" onClick={() => loadUsers({ silent: false })} style={btnStyle("#151a21")} disabled={usersLoading}>
                    {usersLoading ? "..." : "Atualizar"}
                  </button>
                </>
              }
            />

            {usersOpen ? (
              <div style={{ ...softBoxStyle, marginTop: 12 }}>
                <Row>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Buscar por email, nome, cpf ou id..."
                      style={{ ...inputStyle, width: "min(520px, 100%)" }}
                    />
                    <div style={{ color: "#9aa4b2", fontSize: 12, whiteSpace: "nowrap" }}>
                      Total: <b style={{ color: "#e5e7eb" }}>{filteredUsers.length}</b>
                    </div>
                  </div>
                </Row>

                {usersError ? (
                  <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: "1px solid #442", background: "#221", color: "#ffd6d6" }}>
                    {usersError}
                  </div>
                ) : null}

                {usersLoading ? <div style={{ marginTop: 12, color: "#9aa4b2" }}>Carregando usuários...</div> : null}

                <div style={{ marginTop: 12, borderRadius: 12, border: "1px solid #2b2f36", overflow: "hidden" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.2fr 1fr 0.9fr 0.7fr 0.7fr",
                      padding: "12px 14px",
                      background: "#0f141a",
                      color: "#cbd5e1",
                      fontWeight: 900,
                      fontSize: 13,
                    }}
                  >
                    <div>Email</div>
                    <div>Nome</div>
                    <div>CPF</div>
                    <div>Status</div>
                    <div>Ações</div>
                  </div>

                  {filteredUsers.length === 0 ? (
                    <div style={{ padding: 14, color: "#9aa4b2" }}>Nenhum usuário encontrado.</div>
                  ) : (
                    filteredUsers.map((u) => {
                      const p = pickProfile(u);
                      const id = String(u?.id || u?.user_id || p?.id || "");
                      const email = getEmail(u) || "(sem email)";
                      const name = getNameFromProfile(p);
                      const cpf = getCpfFromProfile(p);

                      return (
                        <div
                          key={id || email}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.2fr 1fr 0.9fr 0.7fr 0.7fr",
                            padding: "12px 14px",
                            borderTop: "1px solid #20242c",
                            background: "#0b1016",
                            color: "#e5e7eb",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            <div style={{ fontWeight: 900 }}>{email}</div>
                            <div style={{ color: "#9aa4b2", fontSize: 12 }}>id: {id ? `${id.slice(0, 8)}…` : "—"}</div>
                          </div>

                          <div style={{ color: "#e5e7eb", fontWeight: 700 }}>{name}</div>
                          <div style={{ color: "#cbd5e1" }}>{cpf}</div>
                          <div>{blockedPill(u)}</div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button onClick={() => openBlock(u)} style={btnStyle("#2b1414")}>
                              Bloquear
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* MODAL BAN */}
          {blockModalOpen && selectedUser ? (
            <div onClick={closeBlock} style={overlayStyle}>
              <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900 }}>Bloquear conta</div>
                    <div style={{ color: "#9aa4b2", fontSize: 12, marginTop: 4 }}>
                      {getEmail(selectedUser) || "(sem email)"} • id: {String(selectedUser?.id || selectedUser?.user_id || "").slice(0, 8)}…
                    </div>
                  </div>

                  <button onClick={closeBlock} style={xBtnStyle} title="Fechar" disabled={banBusy}>
                    ✕
                  </button>
                </div>

                <div style={{ marginTop: 14, borderTop: "1px solid #20242c", paddingTop: 14 }}>
                  <div style={{ ...softBoxStyle }}>
                    <div style={{ fontWeight: 900 }}>Modo</div>
                    <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => setBanMode("PERM")} style={btnStyle(banMode === "PERM" ? "#2b1414" : "#151a21")} disabled={banBusy}>
                        Ban permanente
                      </button>
                      <button type="button" onClick={() => setBanMode("TEMP")} style={btnStyle(banMode === "TEMP" ? "#2b2414" : "#151a21")} disabled={banBusy}>
                        Trava temporária
                      </button>
                      <button type="button" onClick={() => setBanMode("FLAG")} style={btnStyle(banMode === "FLAG" ? "#1a202a" : "#151a21")} disabled={banBusy}>
                        Marcar p/ revisão
                      </button>

                      <div style={{ marginLeft: "auto" }}>
                        <Pill label={banMode === "PERM" ? "CRÍTICO" : banMode === "TEMP" ? "TEMP" : "REVISÃO"} tone={banMode === "PERM" ? "bad" : banMode === "TEMP" ? "warn" : "neutral"} />
                      </div>
                    </div>

                    {banMode === "TEMP" ? (
                      <div style={{ marginTop: 10 }}>
                        <Field label="Duração (min)" hint="Ex: 120">
                          <input value={banMinutes} onChange={(e) => setBanMinutes(e.target.value)} style={inputStyle} inputMode="numeric" disabled={banBusy} />
                        </Field>
                      </div>
                    ) : null}

                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900, marginBottom: 6 }}>Motivo (obrigatório)</div>
                      <input
                        value={banReason}
                        onChange={(e) => setBanReason(e.target.value)}
                        placeholder="Ex: padrão de robô, multi-conta, fraude..."
                        style={{ ...inputStyle, width: "100%" }}
                        disabled={banBusy}
                      />
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900, marginBottom: 6 }}>Observação interna (opcional)</div>
                      <textarea
                        value={banNote}
                        onChange={(e) => setBanNote(e.target.value)}
                        rows={4}
                        style={{
                          width: "100%",
                          borderRadius: 12,
                          border: "1px solid #2b2f36",
                          background: "#0f141a",
                          color: "#fff",
                          outline: "none",
                          padding: 10,
                          resize: "vertical",
                          fontSize: 13,
                          lineHeight: 1.4,
                        }}
                        placeholder="Detalhes e evidências..."
                        disabled={banBusy}
                      />
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: banBusy ? "not-allowed" : "pointer" }}>
                        <input type="checkbox" checked={banAlsoEmail} onChange={(e) => setBanAlsoEmail(Boolean(e.target.checked))} disabled={banBusy} />
                        <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 900 }}>
                          Bloquear também por e-mail (recomendado)
                        </span>
                      </label>
                    </div>

                    {banMsg ? (
                      <div style={{ marginTop: 10, color: banMsg.startsWith("Erro") || banMsg.startsWith("Falhou") ? "#ffb4b4" : "#b7f7c0", fontSize: 12, fontWeight: 900 }}>
                        {banMsg}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 10, color: "#9aa4b2", fontSize: 12 }}>
                      Esse comando chama a Edge Function <b>admin-user-ban</b>. Abra o console (F12) para logs completos.
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={dangerBtnStyle}
                      onClick={doBan}
                      disabled={banBusy || !String(banReason || "").trim()}
                      title={!String(banReason || "").trim() ? "Informe o motivo" : "Aplicar bloqueio"}
                    >
                      {banBusy ? "Bloqueando..." : "Confirmar bloqueio"}
                    </button>

                    <button type="button" onClick={closeBlock} style={btnStyle("#1a202a")} disabled={banBusy}>
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {/* ===== MAINTENANCE ===== */}
      {tab === "MAINTENANCE" ? (
        <div style={boxStyle}>
          <SectionHeader
            title="Modo Manutenção"
            subtitle="Quando ativo: bloquear operações e exibir overlay no trade. (Depois: backend também deve recusar criar operações.)"
          />

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <ToggleLine
              label="Ativar manutenção"
              desc="Bloqueia operações e mostra aviso global."
              checked={maintenanceEnabled}
              onChange={setMaintenanceEnabled}
              rightNode={<Pill label={maintenanceEnabled ? "MANUTENÇÃO" : "NORMAL"} tone={maintenanceEnabled ? "warn" : "ok"} />}
            />

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <ToggleLine
                label="Permitir visualizar (view-only)"
                desc="Usuário pode ver gráfico e saldo, mas não opera."
                checked={maintenanceViewOnly}
                onChange={setMaintenanceViewOnly}
                rightNode={<Pill label={maintenanceViewOnly ? "SIM" : "NÃO"} tone={maintenanceViewOnly ? "ok" : "neutral"} />}
              />

              <ToggleLine
                label="Bloquear operações"
                desc="Desabilita CALL/PUT e confirmações."
                checked={maintenanceBlockTrading}
                onChange={setMaintenanceBlockTrading}
                rightNode={<Pill label={maintenanceBlockTrading ? "BLOQUEADO" : "LIVRE"} tone={maintenanceBlockTrading ? "warn" : "bad"} />}
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#9aa4b2", fontWeight: 900, marginBottom: 6 }}>Mensagem do overlay</div>
              <textarea
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1px solid #2b2f36",
                  background: "#0f141a",
                  color: "#fff",
                  outline: "none",
                  padding: 10,
                  resize: "vertical",
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
                disabled={!maintenanceEnabled}
              />
            </div>

            <div style={{ color: "#9aa4b2", fontSize: 12 }}>
              Deploy seguro (padrão corretora): <b>liga manutenção</b> → deploy front → valida → <b>desliga manutenção</b>.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
