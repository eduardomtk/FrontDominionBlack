// src/admin/pages/AdminRanking.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchRankingConfig,
  saveRankingConfig,
  runRankingGenerateToday,
  adminResetRankingToday,
  adminSeedRankingFakes,
} from "../services/rankingAdminService";

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeStr(v) {
  return String(v ?? "").trim();
}

export default function AdminRanking() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const [cfg, setCfg] = useState(null);

  // UI values
  const [minProfit, setMinProfit] = useState("0");
  const [dayMinProfit, setDayMinProfit] = useState("");
  const [dayMaxProfit, setDayMaxProfit] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [volatility, setVolatility] = useState("");
  const [topLockEnabled, setTopLockEnabled] = useState(false);
  const [topLockN, setTopLockN] = useState("");

  // anti-race
  const loadingRef = useRef(false);

  const hasExtraFields = useMemo(() => {
    if (!cfg) return false;
    return (
      "day_min_profit" in cfg ||
      "day_max_profit" in cfg ||
      "activity_level" in cfg ||
      "volatility" in cfg ||
      "top_lock_enabled" in cfg ||
      "top_lock_n" in cfg
    );
  }, [cfg]);

  async function load({ silent } = { silent: false }) {
    if (loadingRef.current) return;
    loadingRef.current = true;

    if (!silent) {
      setError("");
      setLoading(true);
    }

    try {
      const data = await fetchRankingConfig();

      setCfg(data || null);
      setMinProfit(String(toNum(data?.min_profit_to_enter, 0)));

      if (data) {
        if ("day_min_profit" in data) setDayMinProfit(String(data.day_min_profit ?? ""));
        if ("day_max_profit" in data) setDayMaxProfit(String(data.day_max_profit ?? ""));
        if ("activity_level" in data) setActivityLevel(String(data.activity_level ?? ""));
        if ("volatility" in data) setVolatility(String(data.volatility ?? ""));
        if ("top_lock_enabled" in data) setTopLockEnabled(Boolean(data.top_lock_enabled));
        if ("top_lock_n" in data) setTopLockN(String(data.top_lock_n ?? ""));
      } else {
        setDayMinProfit("");
        setDayMaxProfit("");
        setActivityLevel("");
        setVolatility("");
        setTopLockEnabled(false);
        setTopLockN("");
      }
    } catch (e) {
      console.error("[AdminRanking] load error:", e);
      if (!silent) setError(e?.message || "Falha ao carregar ranking_config.");
    } finally {
      if (!silent) setLoading(false);
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    load({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = saving || running || loading;

  const patchPreview = useMemo(() => {
    const p = {
      min_profit_to_enter: toNum(minProfit, 0),
    };

    // Só inclui campos que existem (evita erro se alguém remover coluna no futuro)
    if (cfg) {
      if ("day_min_profit" in cfg) p.day_min_profit = toNum(dayMinProfit, 0);
      if ("day_max_profit" in cfg) p.day_max_profit = toNum(dayMaxProfit, 0);
      if ("activity_level" in cfg) p.activity_level = toNum(activityLevel, 2);
      if ("volatility" in cfg) p.volatility = toNum(volatility, 1);
      if ("top_lock_enabled" in cfg) p.top_lock_enabled = Boolean(topLockEnabled);
      if ("top_lock_n" in cfg) p.top_lock_n = toNum(topLockN, 5);
    }

    return p;
  }, [minProfit, dayMinProfit, dayMaxProfit, activityLevel, volatility, topLockEnabled, topLockN, cfg]);

  async function handleSave() {
    setError("");
    try {
      setSaving(true);

      const saved = await saveRankingConfig(patchPreview);
      setCfg(saved || null);

      alert("Config salva ✅");
    } catch (e) {
      console.error("[AdminRanking] save error:", e);
      setError(e?.message || "Falha ao salvar config.");
      alert("Falha ao salvar config (ver console).");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateNow() {
    setError("");
    try {
      setRunning(true);
      await runRankingGenerateToday();
      alert("Ranking regenerado ✅");
    } catch (e) {
      console.error("[AdminRanking] generate error:", e);
      setError(e?.message || "Falha ao regenerar ranking.");
      alert("Falha ao regenerar (ver console).");
    } finally {
      setRunning(false);
    }
  }

  async function handleSeedFakes() {
    setError("");
    try {
      setRunning(true);
      await adminSeedRankingFakes();
      alert("Seed de fakes executado ✅");
    } catch (e) {
      console.error("[AdminRanking] seed fakes error:", e);
      setError(e?.message || "Seed fakes falhou.");
      alert("Seed fakes falhou (ver console).");
    } finally {
      setRunning(false);
    }
  }

  async function handleResetToday() {
    setError("");
    try {
      setRunning(true);
      await adminResetRankingToday();
      alert("Reset do dia executado ✅");
    } catch (e) {
      console.error("[AdminRanking] reset today error:", e);
      setError(e?.message || "Reset do dia falhou.");
      alert("Reset do dia falhou (ver console).");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0 }}>Ranking</h1>

          <button
            onClick={() => load({ silent: false })}
            style={btnStyle("#151a21")}
            disabled={busy}
            title="Recarregar config"
          >
            Atualizar
          </button>

          <button
            onClick={handleGenerateNow}
            style={btnStyle("linear-gradient(135deg,#10b981,#059669)")}
            disabled={busy}
            title="Regerar ranking do dia"
          >
            {running ? "Executando..." : "Regerar Agora"}
          </button>
        </div>

        <div style={{ color: "#9aa4b2", fontSize: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <span>
            Config:{" "}
            <b style={{ color: "#e5e7eb" }}>
              {cfg?.id ? `id=${String(cfg.id).slice(0, 8)}…` : "nenhuma (será criada ao salvar)"}
            </b>
          </span>
        </div>
      </div>

      <p style={{ color: "#9aa4b2", marginTop: 8 }}>
        Ajustes de regras do ranking (Admin). Para aplicar no ranking público, salve e depois clique em{" "}
        <b>Regerar Agora</b>.
      </p>

      {error ? <div style={errorBoxStyle}>{error}</div> : null}

      {loading ? (
        <p style={{ marginTop: 16 }}>Carregando...</p>
      ) : (
        <>
          {/* Cards */}
          <div style={{ ...panelStyle, marginTop: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              <div style={cardStyle}>
                <div style={cardLabel}>min_profit_to_enter (REAL)</div>
                <input
                  value={minProfit}
                  onChange={(e) => setMinProfit(e.target.value)}
                  type="number"
                  step="1"
                  style={{ ...inputStyle, marginTop: 8, width: "100%" }}
                  placeholder="Ex: 100"
                  disabled={busy}
                />
                <div style={hintStyle}>
                  Filtra <b>traders reais</b> com lucro líquido do dia menor que este valor.
                </div>
              </div>

              <div style={cardStyle}>
                <div style={cardLabel}>Status</div>
                <div style={{ ...cardValue, marginTop: 8 }}>
                  {saving ? "Salvando..." : running ? "Executando..." : "Pronto"}
                </div>
                <div style={hintStyle}>✅ Admin via Edge Function + x-admin-secret.</div>
              </div>

              <div style={cardStyle}>
                <div style={cardLabel}>Ações rápidas</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                  <button
                    onClick={handleSave}
                    style={btnStyle("linear-gradient(135deg,#3b82f6,#2563eb)")}
                    disabled={busy}
                    title="Salvar config"
                  >
                    {saving ? "Salvando..." : "Salvar Config"}
                  </button>

                  <button
                    onClick={handleResetToday}
                    style={btnStyle("#1a202a")}
                    disabled={busy}
                    title="Reset imediato do dia"
                  >
                    Reset do Dia
                  </button>

                  <button
                    onClick={handleSeedFakes}
                    style={btnStyle("#1a202a")}
                    disabled={busy}
                    title="Cria/atualiza fakes com avatar/nome"
                  >
                    Seed Fakes
                  </button>
                </div>

                <div style={hintStyle}>
                  Reset e Seed agora são Edge Functions (sem RPC pendente).
                </div>
              </div>
            </div>
          </div>

          {/* Extras */}
          {hasExtraFields ? (
            <div style={{ ...panelStyle, marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 900 }}>Parâmetros avançados</div>
              <div style={{ marginTop: 6, color: "#9aa4b2", fontSize: 12 }}>
                Esses campos aparecem porque existem na tabela <b>ranking_config</b>.
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {"day_min_profit" in (cfg || {}) ? (
                  <div style={cardStyle}>
                    <div style={cardLabel}>day_min_profit</div>
                    <input
                      value={dayMinProfit}
                      onChange={(e) => setDayMinProfit(e.target.value)}
                      type="number"
                      step="1"
                      style={{ ...inputStyle, marginTop: 8, width: "100%" }}
                      disabled={busy}
                    />
                    <div style={hintStyle}>Piso do dia (inclusive fakes).</div>
                  </div>
                ) : null}

                {"day_max_profit" in (cfg || {}) ? (
                  <div style={cardStyle}>
                    <div style={cardLabel}>day_max_profit</div>
                    <input
                      value={dayMaxProfit}
                      onChange={(e) => setDayMaxProfit(e.target.value)}
                      type="number"
                      step="1"
                      style={{ ...inputStyle, marginTop: 8, width: "100%" }}
                      disabled={busy}
                    />
                    <div style={hintStyle}>Teto do dia (inclusive fakes).</div>
                  </div>
                ) : null}

                {"activity_level" in (cfg || {}) ? (
                  <div style={cardStyle}>
                    <div style={cardLabel}>activity_level</div>
                    <input
                      value={activityLevel}
                      onChange={(e) => setActivityLevel(e.target.value)}
                      type="number"
                      step="1"
                      style={{ ...inputStyle, marginTop: 8, width: "100%" }}
                      disabled={busy}
                    />
                    <div style={hintStyle}>Controla “quantos traders” aparecem no dia.</div>
                  </div>
                ) : null}

                {"volatility" in (cfg || {}) ? (
                  <div style={cardStyle}>
                    <div style={cardLabel}>volatility</div>
                    <input
                      value={volatility}
                      onChange={(e) => setVolatility(e.target.value)}
                      type="number"
                      step="0.01"
                      style={{ ...inputStyle, marginTop: 8, width: "100%" }}
                      disabled={busy}
                    />
                    <div style={hintStyle}>Aumenta/diminui variação (ruído realista).</div>
                  </div>
                ) : null}

                {"top_lock_enabled" in (cfg || {}) ? (
                  <div style={cardStyle}>
                    <div style={cardLabel}>top_lock_enabled</div>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, color: "#cbd5e1", fontWeight: 800 }}>
                      <input
                        type="checkbox"
                        checked={topLockEnabled}
                        onChange={(e) => setTopLockEnabled(e.target.checked)}
                        disabled={busy}
                      />
                      Ativo
                    </label>
                    <div style={hintStyle}>Trava topo N se o gerador usar esse modo.</div>
                  </div>
                ) : null}

                {"top_lock_n" in (cfg || {}) ? (
                  <div style={cardStyle}>
                    <div style={cardLabel}>top_lock_n</div>
                    <input
                      value={topLockN}
                      onChange={(e) => setTopLockN(e.target.value)}
                      type="number"
                      step="1"
                      style={{ ...inputStyle, marginTop: 8, width: "100%" }}
                      disabled={busy}
                    />
                    <div style={hintStyle}>Quantidade travada no topo (ex: 5).</div>
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 12, color: "#9aa4b2", fontSize: 12 }}>
                Depois de alterar avançados: <b>Salvar Config</b> → <b>Regerar Agora</b>.
              </div>
            </div>
          ) : (
            <div style={{ ...panelStyle, marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 900 }}>Parâmetros avançados</div>
              <div style={{ marginTop: 6, color: "#9aa4b2", fontSize: 12 }}>
                Nenhum campo extra detectado na config atual.
              </div>
            </div>
          )}

          {/* Preview */}
          <div style={{ ...panelStyle, marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 900 }}>Preview do patch</div>
            <div style={{ marginTop: 6, color: "#9aa4b2", fontSize: 12 }}>
              O que será enviado ao salvar.
            </div>
            <pre
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                border: "1px solid #2b2f36",
                background: "#0f141a",
                color: "#cbd5e1",
                fontSize: 12,
                overflowX: "auto",
              }}
            >
{JSON.stringify(patchPreview, null, 2)}
            </pre>
          </div>
        </>
      )}
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

const panelStyle = {
  borderRadius: 12,
  border: "1px solid #2b2f36",
  background: "#0b1016",
  padding: 14,
};

const cardStyle = {
  borderRadius: 12,
  border: "1px solid #2b2f36",
  background: "#0f141a",
  padding: 12,
};

const cardLabel = { fontSize: 12, color: "#9aa4b2", fontWeight: 900 };
const cardValue = { fontSize: 16, color: "#e5e7eb", fontWeight: 900 };

const hintStyle = { marginTop: 8, color: "#9aa4b2", fontSize: 12, lineHeight: 1.4 };