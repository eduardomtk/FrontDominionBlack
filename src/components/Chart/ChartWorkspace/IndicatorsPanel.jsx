// src/components/Chart/IndicatorsPanel/IndicatorsPanel.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./IndicatorsPanel.module.css";
import { useIndicators } from "@/context/IndicatorsContext";
import { INDICATOR_DEFINITIONS } from "@/indicators/indicatorRegistry";
import IndicatorSettingsModal from "./IndicatorSettingsModal";
import SoundManager from "@/sound/SoundManager.js";
// ✅ i18n
import { useTranslation } from "react-i18next";

const LS_KEY = "valyron.userScripts.v1";

/**
 * ✅ FEATURE FLAG (Lançamento rápido)
 * - Mantém TODA a feature de scripts no código
 * - Oculta a aba de scripts na UI
 * - Impede navegação acidental para "scripts"
 *
 * Para reativar depois:
 * - Troque para true
 * - Recoloque o botão "Scripts" no sidebar
 */
const ENABLE_SCRIPTS_TAB = false;

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function loadUserScripts() {
  const raw = localStorage.getItem(LS_KEY);
  const list = safeJsonParse(raw, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      id: String(x.id || ""),
      name: String(x.name || "Script sem nome"),
      code: String(x.code || ""),
      enabled: Boolean(x.enabled),
      createdAt: Number.isFinite(Number(x.createdAt)) ? Number(x.createdAt) : Date.now(),
      updatedAt: Number.isFinite(Number(x.updatedAt)) ? Number(x.updatedAt) : Date.now(),
    }))
    .filter((x) => x.id);
}

function saveUserScripts(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

function makeId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toTypeId(scriptId) {
  return `script:${scriptId}`;
}

export default function IndicatorsPanel({ onClose }) {
  // ✅ Hook i18n
  const { t } = useTranslation("indicatorsPanel");

  const [activeTab, setActiveTab] = useState("list");
  const [search, setSearch] = useState("");

  const [settingsInst, setSettingsInst] = useState(null);

  const {
    instances,
    addIndicator,
    removeIndicator,
    removeIndicatorsByType,
    toggleIndicatorVisibility,
    updateIndicatorSettings,
  } = useIndicators();

  // ✅ Click-outside support (mínima alteração)
  const panelRef = useRef(null);

  // -------------------------------
  // Scripts
  // -------------------------------
  const [userScripts, setUserScripts] = useState([]);
  const [scriptName, setScriptName] = useState("");
  const [scriptCode, setScriptCode] = useState("");

  const codeRef = useRef(null);

  useEffect(() => {
    setUserScripts(loadUserScripts());
  }, []);

  // ✅ Guard: se scripts estiverem desativados, impede cair na aba "scripts"
  useEffect(() => {
    if (!ENABLE_SCRIPTS_TAB && activeTab === "scripts") {
      setActiveTab("list");
    }
  }, [activeTab]);

  const enabledScriptsCount = useMemo(
    () => userScripts.filter((s) => s.enabled).length,
    [userScripts]
  );

  const inUseCount = instances.length;

  const filteredDefinitions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return INDICATOR_DEFINITIONS;

    return INDICATOR_DEFINITIONS.filter((def) => {
      const name = (def.name || "").toLowerCase();
      const short = (def.shortName || "").toLowerCase();
      return name.includes(q) || short.includes(q);
    });
  }, [search]);

  function persist(next) {
    setUserScripts(next);
    saveUserScripts(next);
  }

  function ensureScriptInstanceOnEnable(scriptId) {
    addIndicator(toTypeId(scriptId));
  }

  function ensureScriptInstanceOffDisable(scriptId) {
    removeIndicatorsByType(toTypeId(scriptId));
  }

  function handleAddScript() {
    const name = scriptName.trim();
    const code = scriptCode.trim();
    if (!name || !code) return;

    const now = Date.now();
    const id = makeId();

    const next = [
      {
        id,
        name,
        code,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      ...userScripts,
    ];

    SoundManager.uiClick();
    persist(next);
    ensureScriptInstanceOnEnable(id);

    setScriptName("");
    setScriptCode("");
  }

  function handleToggleScript(id) {
    const current = userScripts.find((s) => s.id === id);
    const nextEnabled = !current?.enabled;

    const next = userScripts.map((s) =>
      s.id === id ? { ...s, enabled: nextEnabled, updatedAt: Date.now() } : s
    );

    SoundManager.uiClick();
    persist(next);

    if (nextEnabled) ensureScriptInstanceOnEnable(id);
    else ensureScriptInstanceOffDisable(id);
  }

  function handleRemoveScript(id) {
    const next = userScripts.filter((s) => s.id !== id);

    SoundManager.uiClick();
    persist(next);
    ensureScriptInstanceOffDisable(id);
  }

  function handleLoadIntoEditor(id) {
    const s = userScripts.find((x) => x.id === id);
    if (!s) return;
    SoundManager.uiClick();
    setScriptName(s.name || "");
    setScriptCode(s.code || "");
    requestAnimationFrame(() => {
      codeRef.current?.focus?.();
    });
  }

  const canShowScriptsUI = ENABLE_SCRIPTS_TAB;

  // ✅ Click outside -> close (capturing) | ignora cliques dentro do painel e dentro do modal
  useEffect(() => {
    function isClickInsideModal(target) {
      // Modal normalmente vai para body/portal e costuma ter backdrop/containers.
      // Sem conhecer o DOM exato, a regra robusta é:
      // - se settingsInst aberto, NÃO fecha por clique fora (evita fechar ao mexer no modal).
      // Isso garante 100% sem quebrar UX.
      if (!settingsInst) return false;
      return true;
    }

    function handlePointerDownCapture(e) {
      // Se tem modal aberto, não fecha no click-outside do painel
      if (isClickInsideModal(e.target)) return;

      const el = panelRef.current;
      if (!el) return;

      // Clique dentro do painel => ignora
      if (el.contains(e.target)) return;

      // ✅ Clique fora => fecha SEM SOM (evita "double click sound")
      onClose?.();
    }

    document.addEventListener("pointerdown", handlePointerDownCapture, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownCapture, true);
    };
  }, [onClose, settingsInst]);

  return (
    <>
      <div className={styles.panelContainer} ref={panelRef}>
        {/* Sidebar Compacta */}
        <div className={styles.sidebar}>
          <div className={styles.header}>
            <span>{t("title")}</span>
            <button
              className={styles.closeBtn}
              onClick={() => {
                SoundManager.uiClick();
                onClose?.();
              }}
              aria-label={t("actions.close")}
              title={t("actions.close")}
            >
              ×
            </button>
          </div>

          <div className={styles.navContent}>
            <button
              className={`${styles.menuBtn} ${activeTab === "list" ? styles.active : ""}`}
              onClick={() => {
                if (activeTab !== "list") SoundManager.uiClick();
                setActiveTab("list");
              }}
            >
              <div className={styles.iconCircle}>
                <span className={styles.dot}></span>
              </div>
              <span className={styles.btnText}>{t("tabs.list")}</span>
            </button>

            <button
              className={`${styles.menuBtn} ${activeTab === "inUse" ? styles.active : ""}`}
              onClick={() => {
                if (activeTab !== "inUse") SoundManager.uiClick();
                setActiveTab("inUse");
              }}
            >
              <div className={styles.iconCircle}>
                <span className={styles.countText}>{inUseCount}</span>
              </div>
              <span className={styles.btnText}>{t("tabs.inUse")}</span>
            </button>

            {/* ✅ Scripts oculto (não removido, só desativado) */}
            {canShowScriptsUI && (
              <button
                className={`${styles.menuBtn} ${activeTab === "scripts" ? styles.active : ""}`}
                onClick={() => {
                  if (activeTab !== "scripts") SoundManager.uiClick();
                  setActiveTab("scripts");
                }}
              >
                <div className={styles.iconCircle}>
                  <span className={styles.countText}>{enabledScriptsCount}</span>
                </div>
                <span className={styles.btnText}>{t("tabs.scripts")}</span>
              </button>
            )}
          </div>
        </div>

        {/* Área de Conteúdo */}
        <div className={styles.contentArea}>
          {activeTab === "list" ? (
            <div className={styles.listWrapper}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder={t("search.placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className={styles.indicatorList}>
                {filteredDefinitions.map((def) => (
                  <button
                    key={def.id}
                    className={styles.indicatorItem}
                    onClick={() => {
                      SoundManager.uiClick();
                      addIndicator(def.id);
                    }}
                  >
                    {def.name}
                  </button>
                ))}
              </div>
            </div>
          ) : activeTab === "inUse" ? (
            instances.length === 0 ? (
              <div className={styles.emptyState}>{t("empty.noIndicators")}</div>
            ) : (
              <div className={styles.listWrapper}>
                <div className={styles.indicatorList}>
                  {instances.map((inst) => (
                    <div key={inst.instanceId} className={styles.indicatorInUseRow}>
                      <div className={styles.indicatorNameCell}>
                        <span className={styles.indicatorName}>{inst.name}</span>
                      </div>

                      <div className={styles.iconActions}>
                        <button
                          type="button"
                          title={inst.visible ? t("actions.hide") : t("actions.show")}
                          onClick={() => {
                            SoundManager.uiClick();
                            toggleIndicatorVisibility(inst.instanceId);
                          }}
                          className={`${styles.iconButton} ${
                            inst.visible ? styles.iconButtonActive : ""
                          }`}
                          aria-label={inst.visible ? t("actions.hide") : t("actions.show")}
                        >
                          <span className={styles.iconGlyph}>👁</span>
                        </button>

                        <button
                          type="button"
                          title={t("actions.settings")}
                          onClick={() => {
                            SoundManager.uiClick();
                            setSettingsInst(inst);
                          }}
                          className={styles.iconButton}
                          aria-label={t("actions.settings")}
                        >
                          <span className={styles.iconGlyph}>⚙</span>
                        </button>

                        <button
                          type="button"
                          title={t("actions.remove")}
                          onClick={() => {
                            SoundManager.uiClick();
                            removeIndicator(inst.instanceId);
                          }}
                          className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                          aria-label={t("actions.remove")}
                        >
                          <span className={styles.iconGlyph}>✕</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            // ✅ Mesmo que alguém force activeTab="scripts", o guard acima joga pra "list".
            <div className={styles.scriptsWrapper}>
              <div className={styles.scriptForm}>
                <div className={styles.scriptField}>
                  <div className={styles.scriptLabel}>{t("form.scriptName.label")}</div>
                  <input
                    type="text"
                    className={styles.scriptInput}
                    placeholder={t("form.scriptName.placeholder")}
                    value={scriptName}
                    onChange={(e) => setScriptName(e.target.value)}
                    maxLength={40}
                  />
                </div>

                <div className={styles.scriptField}>
                  <div className={styles.scriptLabel}>{t("form.scriptCode.label")}</div>
                  <textarea
                    ref={codeRef}
                    className={styles.scriptTextarea}
                    placeholder={t("form.scriptCode.placeholder")}
                    value={scriptCode}
                    onChange={(e) => setScriptCode(e.target.value)}
                    spellCheck={false}
                  />
                </div>

                <div className={styles.scriptToolbar}>
                  <button
                    className={styles.scriptPrimaryBtn}
                    onClick={handleAddScript}
                    disabled={!scriptName.trim() || !scriptCode.trim()}
                    type="button"
                    title={t("tooltips.apply")}
                  >
                    {t("actions.apply")}
                  </button>

                  <button
                    className={styles.scriptGhostBtn}
                    onClick={() => {
                      SoundManager.uiClick();
                      setScriptName("");
                      setScriptCode("");
                      requestAnimationFrame(() => codeRef.current?.focus?.());
                    }}
                    type="button"
                    title={t("tooltips.clear")}
                  >
                    {t("actions.clear")}
                  </button>
                </div>
              </div>

              <div className={styles.scriptList}>
                {userScripts.length === 0 ? (
                  <div className={styles.emptyState}>{t("empty.noScripts")}</div>
                ) : (
                  userScripts.map((s) => (
                    <div key={s.id} className={styles.scriptRow}>
                      <div className={styles.scriptMeta}>
                        <div className={styles.scriptNameRow}>
                          <span className={styles.scriptName}>{s.name}</span>
                          <span
                            className={`${styles.scriptBadge} ${
                              s.enabled ? styles.scriptBadgeOn : styles.scriptBadgeOff
                            }`}
                            title={s.enabled ? t("tooltips.active") : t("tooltips.inactive")}
                          >
                            {s.enabled ? t("badges.active") : t("badges.off")}
                          </span>
                        </div>
                        <div className={styles.scriptHint}>
                          {s.code.slice(0, 80).replace(/\s+/g, " ").trim()}
                          {s.code.length > 80 ? "…" : ""}
                        </div>
                      </div>

                      <div className={styles.scriptActions}>
                        <button
                          className={styles.scriptMiniBtn}
                          type="button"
                          title={t("actions.loadEditor")}
                          onClick={() => handleLoadIntoEditor(s.id)}
                          aria-label={t("actions.loadEditor")}
                        >
                          ✎
                        </button>

                        <button
                          className={`${styles.scriptMiniBtn} ${
                            s.enabled ? styles.scriptMiniBtnOn : ""
                          }`}
                          type="button"
                          title={s.enabled ? t("actions.deactivate") : t("actions.activate")}
                          onClick={() => handleToggleScript(s.id)}
                          aria-label={s.enabled ? t("actions.deactivate") : t("actions.activate")}
                        >
                          ⏻
                        </button>

                        <button
                          className={`${styles.scriptMiniBtn} ${styles.scriptMiniBtnDanger}`}
                          type="button"
                          title={t("actions.remove")}
                          onClick={() => handleRemoveScript(s.id)}
                          aria-label={t("actions.remove")}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className={styles.scriptFooterNote}>{t("footer.note")}</div>
            </div>
          )}
        </div>
      </div>

      {settingsInst && (
        <IndicatorSettingsModal
          instance={settingsInst}
          onClose={() => {
            SoundManager.uiClick();
            setSettingsInst(null);
          }}
          onCancel={() => {
            SoundManager.uiClick();
            setSettingsInst(null);
          }}
          onApply={(nextSettings) => {
            SoundManager.uiClick();
            updateIndicatorSettings(settingsInst.instanceId, nextSettings);
            setSettingsInst(null);
          }}
          onLiveChange={(nextDraft) => {
            updateIndicatorSettings(settingsInst.instanceId, nextDraft);
          }}
        />
      )}
    </>
  );
}