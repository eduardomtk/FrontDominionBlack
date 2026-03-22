// src/components/ProfileModal/ProfileModal.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import styles from "./ProfileModal.module.css";
import SoundManager from "@/sound/SoundManager.js";
import { useTradingAuth } from "@/context/TradingAuthContext";
import { supabase } from "@/services/supabaseClient";
// ✅ locale context + helpers
import { useLocale } from "@/context/LocaleContext";
import { localeFromCountry } from "@/i18n/locale";
// ✅ i18n
import { useTranslation } from "react-i18next";

// ✅ eventos globais usados pelos overlays (MESMO barramento do App.jsx)
const OVERLAY_OPEN_EVENT = "tradepro:overlay-open";
const OVERLAY_CLOSE_EVENT = "tradepro:overlay-close";

const KYC_BUCKET = "kyc";
const KYC_MAX_FILES = 2;
const KYC_CACHE_CONTROL = "3600";
const KYC_POLL_MS = 5000;
// ✅ cache local do KYC (SWR)
const KYC_CACHE_VERSION = "v1";
const kycCacheKey = (uid) => `kyc_cache:${KYC_CACHE_VERSION}:${uid}`;
function safeJsonParse(v) {
  try {
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function normCountryCode(v) {
  const s = String(v || "").trim().toUpperCase();
  return s && /^[A-Z]{2}$/.test(s) ? s : null;
}

export default function ProfileModal({
  isOpen,
  initialTab = "perfil",
  onClose,
  user: userProp,
  onSave,
  onComplete,
}) {
  const [tab, setTab] = useState(initialTab);
  const {
    user: authUser,
    profile,
    profileLoading,
    upsertProfile,
    avatarUrl,
    refreshProfile,
  } = useTradingAuth();
  // ✅ locale runtime switch (sem persist duplicado no profile, porque já vamos salvar no payload)
  const { setLocale: setLocaleCtx } = useLocale();
  // ✅ i18n hook
  const { t } = useTranslation(["common", "profile"]);

  const effectiveUser = authUser || userProp || null;

  // ✅ países estratégicos (lista fixa)
  const baseCountries = useMemo(
    () => [
      // Américas
      { code: "BR", name: "Brasil" },
      { code: "US", name: "Estados Unidos" },
      { code: "CA", name: "Canadá" },
      { code: "MX", name: "México" },
      { code: "AR", name: "Argentina" },
      { code: "CL", name: "Chile" },
      { code: "CO", name: "Colômbia" },
      { code: "PE", name: "Peru" },
      // Europa
      { code: "PT", name: "Portugal" },
      { code: "ES", name: "Espanha" },
      { code: "FR", name: "França" },
      { code: "DE", name: "Alemanha" },
      { code: "IT", name: "Itália" },
      { code: "GB", name: "Reino Unido" },
      { code: "IE", name: "Irlanda" },
      // Ásia / Oriente Médio
      { code: "AE", name: "Emirados Árabes Unidos" },
      { code: "IN", name: "Índia" },
      { code: "ID", name: "Indonésia" },
      { code: "PH", name: "Filipinas" },
      { code: "MY", name: "Malásia" },
      { code: "TH", name: "Tailândia" },
      { code: "VN", name: "Vietnã" },
      { code: "SG", name: "Singapura" },
      { code: "HK", name: "Hong Kong" },
      // Oceania
      { code: "AU", name: "Austrália" },
      { code: "NZ", name: "Nova Zelândia" },
    ],
    []
  );

  const countryNameByCode = useMemo(() => {
    const m = new Map();
    for (const c of baseCountries) m.set(String(c.code).toUpperCase(), String(c.name));
    return m;
  }, [baseCountries]);

  // ✅ Detecta country atual do profile (para compatibilidade/migração)
  const profileCountryCode = useMemo(() => {
    const p = profile || {};
    const byCode = normCountryCode(p?.country_code);
    if (byCode) return byCode;
    const name = String(p?.country || "").trim().toLowerCase();
    if (!name) return null;
    // tenta achar pelo nome dentro da lista estratégica
    for (const c of baseCountries) {
      if (String(c.name).trim().toLowerCase() === name) return String(c.code).toUpperCase();
    }
    return null;
  }, [profile, baseCountries]);

  const profileCountryName = useMemo(() => {
    const p = profile || {};
    const name = String(p?.country || "").trim();
    return name || null;
  }, [profile]);

  // ✅ lista final de opções: estratégica + (se necessário) país atual do usuário fora da lista
  const countries = useMemo(() => {
    const list = [...baseCountries];
    const cc = profileCountryCode;
    if (cc && !countryNameByCode.has(cc)) {
      // Se profile tiver code fora da lista, adiciona opção extra para não "sumir" no select
      list.push({ code: cc, name: profileCountryName || cc });
      return list;
    }
    // Se profile tiver só nome fora da lista (sem code), adiciona opção extra "preservada"
    if (!cc && profileCountryName) {
      const existsByName = list.some(
        (x) => String(x.name).trim().toLowerCase() === profileCountryName.trim().toLowerCase()
      );
      if (!existsByName) {
        // usa um code neutro apenas para manter o item selecionável sem quebrar o form
        // (não persistimos esse "XX"; no save, forçamos BR se não for válido)
        list.push({ code: "XX", name: profileCountryName });
      }
    }
    return list;
  }, [baseCountries, profileCountryCode, profileCountryName, countryNameByCode]);

  function toISODate(value) {
    if (!value) return "";
    if (typeof value === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      return value;
    }
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return "";
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return "";
    }
  }

  function explainProfileToForm(p, authU) {
    const email = p?.email || authU?.email || "";
    const first = p?.first_name || "";
    const last = p?.last_name || "";
    const nickname = p?.nickname || "";
    const phone = p?.phone || "";
    const cpf = p?.cpf || "";
    // ✅ agora o form trabalha com country_code (mantendo default visual BR)
    const cc = normCountryCode(p?.country_code) || profileCountryCode || "BR";
    const city = p?.city || "";
    const sex = p?.sex || "Masculino";
    const birth = toISODate(p?.birth_date) || "";
    const ranking = Boolean(p?.ranking_opt_in ?? true);
    return {
      email,
      apelido: nickname,
      nome: first,
      sobrenome: last,
      cpf,
      telefone: phone,
      pais: cc,
      cidade: city,
      sexo: sex,
      nascimento: birth,
      ranking,
    };
  }

  const [form, setForm] = useState(() => explainProfileToForm(profile, effectiveUser));
  const [saveState, setSaveState] = useState("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const saveTimerRef = useRef(null);
  const [passState, setPassState] = useState("idle");
  const [passMsg, setPassMsg] = useState("");
  const passTimerRef = useRef(null);
  const formDirtyRef = useRef(false);
  const lastHydratedUserIdRef = useRef(null);

  // ============================
  // ✅ helpers: barramento global
  // ============================
  const emitOverlayOpen = useCallback((id) => {
    try {
      window.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT, { detail: { id } }));
    } catch {}
  }, []);

  const emitOverlayClose = useCallback((id) => {
    try {
      window.dispatchEvent(new CustomEvent(OVERLAY_CLOSE_EVENT, { detail: { id } }));
    } catch {}
  }, []);

  // ✅ close padronizado (fecha e notifica manager)
  const requestClose = useCallback(() => {
    try {
      emitOverlayClose("profile");
    } catch {}
    onClose?.();
  }, [onClose, emitOverlayClose]);

  // ✅ Mutual exclusion real:
  // - Ao abrir o Profile, ele declara "sou o overlay ativo" => App fecha o Support
  // - Ao abrir qualquer outro overlay enquanto o Profile está aberto, Profile fecha
  useEffect(() => {
    if (!isOpen) return;

    // Declare o Profile como overlay ativo (fecha suporte via App.jsx)
    emitOverlayOpen("profile");

    const onAnyOverlayOpen = (e) => {
      const id = e?.detail?.id;
      if (!id) return;

      // Se abriu outro overlay que não seja "profile", fecha o profile
      if (id !== "profile") {
        requestClose();
      }
    };

    window.addEventListener(OVERLAY_OPEN_EVENT, onAnyOverlayOpen);

    // Cleanup ao fechar/desmontar
    return () => {
      window.removeEventListener(OVERLAY_OPEN_EVENT, onAnyOverlayOpen);
      emitOverlayClose("profile");
    };
  }, [isOpen, emitOverlayOpen, emitOverlayClose, requestClose]);

  useEffect(() => {
    if (!isOpen) return;
    const uid = effectiveUser?.id || null;
    if (lastHydratedUserIdRef.current !== uid) {
      lastHydratedUserIdRef.current = uid;
      formDirtyRef.current = false;
      setForm(explainProfileToForm(profile, effectiveUser));
      setSaveState("idle");
      setSaveMsg("");
      setPassState("idle");
      setPassMsg("");
      return;
    }
    if (formDirtyRef.current) return;
    setForm(explainProfileToForm(profile, effectiveUser));
  }, [isOpen, effectiveUser?.id, profile, effectiveUser?.email]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (passTimerRef.current) clearTimeout(passTimerRef.current);
    };
  }, []);

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const avatarInputRef = useRef(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState("");
  const avatarTimerRef = useRef(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [idOpen, setIdOpen] = useState(false);
  const [idStep, setIdStep] = useState("intro");
  const [idFiles, setIdFiles] = useState([]);
  const idFileInputRef = useRef(null);
  const uploadTimerRef = useRef(null);
  const [kycState, setKycState] = useState("idle");
  const [kycMsg, setKycMsg] = useState("");
  const [kycInfo, setKycInfo] = useState(null);
  const [kycInfoState, setKycInfoState] = useState("idle");
  const kycPollRef = useRef(null);
  // ✅ mantém último kycInfo "bom" por usuário (SWR)
  const kycLastGoodRef = useRef({ uid: null, row: null });
  // ✅ mantém último estado "bom" dos passos (anti-flicker)
  const stepsLastGoodRef = useRef({
    uid: null,
    hasData: false,
    identity: false,
  });

  // ✅ ao abrir, hidrata kyc do cache local instantaneamente
  useEffect(() => {
    if (!isOpen) return;
    const uid = effectiveUser?.id || null;
    if (!uid) return;
    if (kycLastGoodRef.current.uid !== uid) {
      kycLastGoodRef.current = { uid, row: null };
      setKycInfo(null);
      setKycInfoState("idle");
      try {
        const cached = safeJsonParse(localStorage.getItem(kycCacheKey(uid)));
        if (cached) {
          kycLastGoodRef.current = { uid, row: cached };
          setKycInfo(cached);
        }
      } catch {}
    }
  }, [isOpen, effectiveUser?.id]);

  // ✅ Detecta trade e, principalmente, se o host do recorte existe
  const isTradeMode = useMemo(() => {
    if (typeof document === "undefined") return false;
    if (!isOpen) return false;
    let byPath = false;
    try {
      byPath =
        typeof window !== "undefined" &&
        String(window.location?.pathname || "").startsWith("/trade");
    } catch {
      byPath = false;
    }
    const hasHost = Boolean(document.getElementById("trading-overlay-host"));
    return byPath && hasHost;
  }, [isOpen]);

  // ✅ PORTAL TARGET CORRETO:
  const portalTarget = useMemo(() => {
    if (typeof document === "undefined") return null;
    const host = document.getElementById("trading-overlay-host");
    if (isTradeMode && host) return host;
    return document.body;
  }, [isTradeMode]);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        SoundManager.uiClick();
        if (idOpen) {
          setIdOpen(false);
          return;
        }
        requestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, idOpen, requestClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setIdOpen(false);
    setIdStep("intro");
    setIdFiles([]);
    setKycState("idle");
    setKycMsg("");
    if (uploadTimerRef.current) {
      clearInterval(uploadTimerRef.current);
      uploadTimerRef.current = null;
    }
  }, [isOpen]);

  const goTab = (t) => {
    SoundManager.uiClick();
    setTab(t);
  };

  const setField = (k, v) => {
    formDirtyRef.current = true;
    setForm((s) => ({ ...s, [k]: v }));
  };

  const emailConfirmed = Boolean(profile?.email_verified);

  const hasFilledPersonalData = useMemo(() => {
    const p = profile || {};
    const okName =
      (p.first_name && String(p.first_name).trim()) ||
      (p.name && String(p.name).trim());
    const okPhone = p.phone && String(p.phone).trim();
    // ✅ aceita country_code preferencialmente, mas mantém compatibilidade com country (nome)
    const okCountry =
      (p.country_code && String(p.country_code).trim()) ||
      (p.country && String(p.country).trim());
    const okCity = p.city && String(p.city).trim();
    const okSex = p.sex && String(p.sex).trim();
    const okCpf = p.cpf && String(p.cpf).trim();
    const okBirth = Boolean(p.birth_date);
    return Boolean(okName && okPhone && okCountry && okCity && okSex && okCpf && okBirth);
  }, [profile]);

  const kycStatus = kycInfo?.status || null;
  const kycAdminNote =
    kycInfo?.admin_note && String(kycInfo.admin_note).trim()
      ? String(kycInfo.admin_note).trim()
      : "";
  const identityLegacyVerified = Boolean(
    profile?.kyc_verified || profile?.identity_verified || false
  );
  const identityVerified = Boolean(kycStatus === "approved" || identityLegacyVerified);

  // ✅ salva o "último bom"
  useEffect(() => {
    const uid = effectiveUser?.id || null;
    if (!uid) return;
    if (!profileLoading && profile) {
      if (stepsLastGoodRef.current.uid !== uid) {
        stepsLastGoodRef.current.uid = uid;
      }
      stepsLastGoodRef.current.hasData = Boolean(hasFilledPersonalData);
    }
    if (kycInfoState !== "loading") {
      if (stepsLastGoodRef.current.uid !== uid) {
        stepsLastGoodRef.current.uid = uid;
      }
      stepsLastGoodRef.current.identity = Boolean(identityVerified);
    }
  }, [
    effectiveUser?.id,
    profileLoading,
    profile,
    hasFilledPersonalData,
    kycInfoState,
    identityVerified,
  ]);

  const completedCount =
    (emailConfirmed ? 1 : 0) + (hasFilledPersonalData ? 1 : 0) + (identityVerified ? 1 : 0);
  const remainingCount = Math.max(0, 3 - completedCount);
  const cpfLocked = Boolean(profile?.cpf && String(profile.cpf).trim().length > 0);
  const birthLocked = Boolean(profile?.birth_date);

  const fetchLatestKyc = useCallback(async (uid) => {
    if (!uid) return null;
    setKycInfoState("loading");
    try {
      const { data, error } = await supabase
        .from("kyc_requests")
        .select("id,status,admin_note,reviewed_at,submitted_at,created_at")
        .eq("user_id", uid)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = Array.isArray(data) && data.length ? data[0] : null;
      setKycInfo(row || null);
      setKycInfoState("idle");
      kycLastGoodRef.current = { uid, row: row || null };
      try {
        localStorage.setItem(kycCacheKey(uid), JSON.stringify(row || null));
      } catch {}
      return row || null;
    } catch (e) {
      console.warn("[ProfileModal] fetch kyc_requests error:", e?.message || e);
      const last = kycLastGoodRef.current;
      if (last?.uid === uid) {
        setKycInfo(last.row || null);
      }
      setKycInfoState("error");
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const uid = effectiveUser?.id;
    if (!uid) return;
    fetchLatestKyc(uid);
  }, [isOpen, effectiveUser?.id, fetchLatestKyc]);

  useEffect(() => {
    if (!isOpen) return;
    const uid = effectiveUser?.id;
    if (!uid) return;
    if (kycPollRef.current) {
      clearInterval(kycPollRef.current);
      kycPollRef.current = null;
    }
    if (kycStatus !== "pending") return;
    kycPollRef.current = setInterval(() => {
      fetchLatestKyc(uid);
    }, KYC_POLL_MS);
    return () => {
      if (kycPollRef.current) {
        clearInterval(kycPollRef.current);
        kycPollRef.current = null;
      }
    };
  }, [isOpen, effectiveUser?.id, kycStatus, fetchLatestKyc]);

  const doSave = async () => {
    SoundManager.uiClick();
    if (saveState === "saving") return;
    setSaveState("saving");
    setSaveMsg(t("profile:actions.saving"));
    const first_name = (form.nome || "").trim();
    const last_name = (form.sobrenome || "").trim();
    const nickname = (form.apelido || "").trim();
    const phone = (form.telefone || "").trim();
    // ✅ country_code é a fonte de verdade agora
    const rawCode = String(form.pais || "").trim().toUpperCase();
    const country_code = normCountryCode(rawCode) ? rawCode : "BR";
    // ✅ country (nome) derivado do code (não é mais texto solto)
    const country =
      countryNameByCode.get(country_code) ||
      countries.find((c) => String(c.code).toUpperCase() === country_code)?.name ||
      "Brasil";
    const city = (form.cidade || "").trim();
    const sex = (form.sexo || "Masculino").trim();
    // ✅ locale baseado no country_code
    const locale = localeFromCountry(country_code);
    const birth_date_input = (form.nascimento || "").trim();
    const canSendBirth =
      !profileLoading &&
      !birthLocked &&
      !profile?.birth_date &&
      Boolean(birth_date_input);
    const cpfValue = (form.cpf || "").trim();
    const cpfToSend = cpfLocked ? undefined : cpfValue.length ? cpfValue : null;
    const ranking_opt_in = Boolean(form.ranking);
    const fullName = `${first_name} ${last_name}`.trim();
    const payload = {
      first_name,
      last_name,
      nickname,
      phone,
      // ✅ padronização
      country_code,
      country,
      city,
      sex,
      ranking_opt_in,
      name: fullName,
      ...(cpfToSend !== undefined ? { cpf: cpfToSend } : {}),
      ...(canSendBirth ? { birth_date: birth_date_input } : {}),
      // ✅ CRÍTICO: garantir que o profile tenha locale pra login trocar idioma corretamente
      ...(locale ? { locale } : {}),
    };
    const { error } = await upsertProfile(payload);
    if (error) {
      console.warn("[ProfileModal] save error:", error.message || error);
      setSaveState("error");
      setSaveMsg(t("profile:actions.error"));
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveState("idle");
        setSaveMsg("");
      }, 1800);
      return;
    }
    // ✅ aplica no runtime/storage agora (sem duplicar persist no profile, pq já foi no payload)
    if (locale) {
      try {
        await setLocaleCtx(locale, { persistProfile: false });
      } catch {}
      // ✅ atualiza tp_prefs pra evitar herdar prefs do usuário anterior
      try {
        const prev = safeJsonParse(localStorage.getItem("tp_prefs")) || {};
        localStorage.setItem("tp_prefs", JSON.stringify({ ...prev, country: country_code }));
      } catch {}
    }
    await refreshProfile?.();
    formDirtyRef.current = false;
    setSaveState("success");
    setSaveMsg(t("profile:actions.done"));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaveState("idle");
      setSaveMsg("");
    }, 1400);
    onSave?.(form);
    onComplete?.();
  };

  const canChangePassword = Boolean(oldPass && newPass && newPass2 && newPass === newPass2);

  const doChangePassword = async () => {
    SoundManager.uiClick();
    if (!canChangePassword) return;
    if (passState === "saving") return;
    const email = effectiveUser?.email || "";
    if (!email) return;
    setPassState("saving");
    setPassMsg(t("profile:security.changing"));
    try {
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email,
        password: oldPass,
      });
      if (reauthErr) {
        console.warn("[ProfileModal] old password invalid:", reauthErr.message);
        setPassState("error");
        setPassMsg(t("profile:security.invalid_current_password"));
        if (passTimerRef.current) clearTimeout(passTimerRef.current);
        passTimerRef.current = setTimeout(() => {
          setPassState("idle");
          setPassMsg("");
        }, 2000);
        return;
      }
      const { error: upErr } = await supabase.auth.updateUser({ password: newPass });
      if (upErr) {
        console.warn("[ProfileModal] update password error:", upErr.message);
        setPassState("error");
        setPassMsg(t("profile:actions.error"));
        if (passTimerRef.current) clearTimeout(passTimerRef.current);
        passTimerRef.current = setTimeout(() => {
          setPassState("idle");
          setPassMsg("");
        }, 1800);
        return;
      }
      setOldPass("");
      setNewPass("");
      setNewPass2("");
      setPassState("success");
      setPassMsg(t("profile:actions.done"));
      if (passTimerRef.current) clearTimeout(passTimerRef.current);
      passTimerRef.current = setTimeout(() => {
        setPassState("idle");
        setPassMsg("");
      }, 1400);
    } catch (e) {
      console.warn("[ProfileModal] change password exception:", e?.message || e);
      setPassState("error");
      setPassMsg(t("profile:actions.error"));
      if (passTimerRef.current) clearTimeout(passTimerRef.current);
      passTimerRef.current = setTimeout(() => {
        setPassState("idle");
        setPassMsg("");
      }, 1800);
    }
  };

  const openAvatarPicker = () => {
    SoundManager.uiClick();
    avatarInputRef.current?.click();
  };

  const readImageToJpegBlob = async (file, maxSize = 512, quality = 0.9) => {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxSize / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(img, 0, 0, tw, th);
      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
      });
      if (!blob) throw new Error(t("profile:messages.image_conversion_failed"));
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const avatarCacheControl = useMemo(() => {
    try {
      return import.meta?.env?.DEV ? "1" : "3600";
    } catch {
      return "3600";
    }
  }, []);

  const avatarBust = useMemo(() => {
    const base = avatarUrl || "";
    if (!base) return "";
    const v = profile?.updated_at || profile?.avatar_updated_at || avatarVersion || Date.now();
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}v=${encodeURIComponent(v)}`;
  }, [avatarUrl, profile?.updated_at, profile?.avatar_updated_at, avatarVersion]);

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const uid = effectiveUser?.id;
    if (!uid) return;
    setAvatarBusy(true);
    setAvatarMsg(t("profile:actions.sending"));
    try {
      const jpegBlob = await readImageToJpegBlob(file, 512, 0.9);
      const path = `${uid}/avatar.jpg`;
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, jpegBlob, {
        upsert: true,
        contentType: "image/jpeg",
        cacheControl: avatarCacheControl,
      });
      if (uploadErr) {
        console.warn("[ProfileModal] avatar upload error:", uploadErr.message);
        setAvatarMsg(t("profile:actions.error"));
        if (avatarTimerRef.current) clearTimeout(avatarTimerRef.current);
        avatarTimerRef.current = setTimeout(() => setAvatarMsg(""), 1600);
        return;
      }
      const { error: saveErr } = await upsertProfile({ avatar_path: path });
      if (saveErr) {
        console.warn("[ProfileModal] avatar save error:", saveErr.message);
        setAvatarMsg(t("profile:actions.error"));
        if (avatarTimerRef.current) clearTimeout(avatarTimerRef.current);
        avatarTimerRef.current = setTimeout(() => setAvatarMsg(""), 1600);
        return;
      }
      setAvatarVersion(Date.now());
      await refreshProfile?.();
      setAvatarMsg(t("profile:actions.done"));
      if (avatarTimerRef.current) clearTimeout(avatarTimerRef.current);
      avatarTimerRef.current = setTimeout(() => setAvatarMsg(""), 1400);
    } catch (err) {
      console.warn("[ProfileModal] avatar exception:", err?.message || err);
      setAvatarMsg(t("profile:actions.error"));
      if (avatarTimerRef.current) clearTimeout(avatarTimerRef.current);
      avatarTimerRef.current = setTimeout(() => setAvatarMsg(""), 1600);
    } finally {
      setAvatarBusy(false);
    }
  };

  // ====== RESTANTE DO TEU ARQUIVO (SEM ALTERAÇÃO DE LAYOUT) ======
  const openIdentity = () => {
    SoundManager.uiClick();
    setIdOpen(true);
    setIdStep("intro");
    setKycState("idle");
    setKycMsg("");
  };
  const closeIdentity = () => {
    SoundManager.uiClick();
    if (kycState === "sending") return;
    setIdOpen(false);
    setIdStep("intro");
    setKycState("idle");
    setKycMsg("");
  };
  const startIdentity = () => {
    SoundManager.uiClick();
    setIdStep("upload");
    setKycState("idle");
    setKycMsg("");
  };
  const addFiles = () => {
    SoundManager.uiClick();
    idFileInputRef.current?.click();
  };
  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setIdFiles((prev) => {
      const next = [...prev];
      for (const f of picked) {
        if (next.length >= 10) break;
        const id =
          (typeof crypto !== "undefined" && crypto?.randomUUID?.()) ||
          `f_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        next.push({ id, file: f, progress: 0, status: "uploading" });
      }
      return next;
    });
    e.target.value = "";
  };

  useEffect(() => {
    if (!idOpen || idStep !== "upload") return;
    const hasUploading = idFiles.some((x) => x.status === "uploading");
    if (!hasUploading) {
      if (uploadTimerRef.current) {
        clearInterval(uploadTimerRef.current);
        uploadTimerRef.current = null;
      }
      return;
    }
    if (uploadTimerRef.current) return;
    uploadTimerRef.current = setInterval(() => {
      setIdFiles((prev) => {
        let changed = false;
        const next = prev.map((x) => {
          if (x.status !== "uploading") return x;
          const inc = 7 + Math.floor(Math.random() * 9);
          const p = Math.min(100, (x.progress || 0) + inc);
          changed = true;
          return {
            ...x,
            progress: p,
            status: p >= 100 ? "done" : "uploading",
          };
        });
        return changed ? next : prev;
      });
    }, 130);
    return () => {
      if (uploadTimerRef.current) {
        clearInterval(uploadTimerRef.current);
        uploadTimerRef.current = null;
      }
    };
  }, [idFiles, idOpen, idStep]);

  const removePicked = (id) => {
    SoundManager.uiClick();
    if (kycState === "sending") return;
    setIdFiles((prev) => prev.filter((x) => x.id !== id));
  };
  const doneFiles = useMemo(() => idFiles.filter((x) => x.status === "done"), [idFiles]);
  const isUploading = useMemo(() => idFiles.some((x) => x.status === "uploading"), [idFiles]);
  const overallProgress = useMemo(() => {
    const uploading = idFiles.filter((x) => x.status === "uploading");
    if (!uploading.length) return 0;
    const sum = uploading.reduce((acc, x) => acc + (Number(x.progress) || 0), 0);
    return Math.round(sum / uploading.length);
  }, [idFiles]);

  const canSend = doneFiles.length > 0 && kycState !== "sending";

  async function upsertKycRequest({ user_id, front_path, back_path }) {
    const { data: existing, error: findErr } = await supabase
      .from("kyc_requests")
      .select("id,status")
      .eq("user_id", user_id)
      .in("status", ["pending", "resubmit_required"])
      .order("submitted_at", { ascending: false })
      .limit(1);
    if (findErr) throw findErr;
    const row = Array.isArray(existing) && existing.length ? existing[0] : null;
    if (row?.id) {
      const { error: upErr } = await supabase
        .from("kyc_requests")
        .update({
          front_path,
          back_path,
          status: "pending",
          admin_note: null,
          reviewed_at: null,
          submitted_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (upErr) throw upErr;
      return row.id;
    }
    const { data: ins, error: insErr } = await supabase
      .from("kyc_requests")
      .insert({
        user_id,
        status: "pending",
        front_path,
        back_path,
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return ins?.id || null;
  }

  const sendToReview = async () => {
    SoundManager.uiClick();
    if (!canSend) return;
    const uid = effectiveUser?.id;
    if (!uid) return;
    setKycState("sending");
    setKycMsg(t("profile:actions.sending"));
    try {
      const picked = doneFiles.slice(0, KYC_MAX_FILES).map((x) => x.file).filter(Boolean);
      if (picked.length === 0) {
        setKycState("error");
        setKycMsg(t("profile:messages.min_one_file"));
        setTimeout(() => {
          setKycState("idle");
          setKycMsg("");
        }, 1600);
        return;
      }
      const [frontFile, backFile] = [picked[0], picked[1]];
      const baseDir = `${uid}`;
      const frontPath = `${baseDir}/front.jpg`;
      const backPath = backFile ? `${baseDir}/back.jpg` : null;
      const frontBlob = await readImageToJpegBlob(frontFile, 1400, 0.9);
      const { error: upFrontErr } = await supabase.storage.from(KYC_BUCKET).upload(frontPath, frontBlob, {
        upsert: true,
        contentType: "image/jpeg",
        cacheControl: KYC_CACHE_CONTROL,
      });
      if (upFrontErr) throw upFrontErr;
      let finalBackPath = null;
      if (backFile) {
        const backBlob = await readImageToJpegBlob(backFile, 1400, 0.9);
        const { error: upBackErr } = await supabase.storage.from(KYC_BUCKET).upload(backPath, backBlob, {
          upsert: true,
          contentType: "image/jpeg",
          cacheControl: KYC_CACHE_CONTROL,
        });
        if (upBackErr) throw upBackErr;
        finalBackPath = backPath;
      }
      await upsertKycRequest({
        user_id: uid,
        front_path: frontPath,
        back_path: finalBackPath,
      });
      await fetchLatestKyc(uid);
      setKycState("sent");
      setKycMsg(t("profile:actions.sent"));
      setTimeout(() => {
        setIdOpen(false);
        setIdStep("intro");
        setIdFiles([]);
        setKycState("idle");
        setKycMsg("");
      }, 650);
      await refreshProfile?.();
    } catch (e) {
      console.warn("[ProfileModal] kyc send error:", e?.message || e);
      setKycState("error");
      setKycMsg(t("profile:actions.error"));
      setTimeout(() => {
        setKycState("idle");
        setKycMsg("");
      }, 1800);
    }
  };

  const [emailState, setEmailState] = useState("idle");
  const emailTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
      if (avatarTimerRef.current) clearTimeout(avatarTimerRef.current);
    };
  }, []);

  const sendEmailConfirmation = useCallback(async () => {
    SoundManager.uiClick();
    if (emailConfirmed) return;
    setEmailState("sending");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || "";
      if (!token) {
        console.warn("[ProfileModal] send-email-verification: missing session token");
        setEmailState("error");
        if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
        emailTimerRef.current = setTimeout(() => setEmailState("idle"), 1600);
        return;
      }
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
      if (!SUPABASE_URL) {
        console.warn("[ProfileModal] send-email-verification: VITE_SUPABASE_URL missing");
        setEmailState("error");
        if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
        emailTimerRef.current = setTimeout(() => setEmailState("idle"), 1600);
        return;
      }
      const url = `${String(SUPABASE_URL).replace(/\/$/, "")}/functions/v1/send-email-verification`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
        },
        body: JSON.stringify({}),
      });
      const text = await res.text().catch(() => "");
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      if (!res.ok) {
        const msg =
          parsed?.message || parsed?.error || parsed?.detail || text || `HTTP ${res.status}`;
        console.warn("[ProfileModal] send-email-verification error:", msg, {
          status: res.status,
          payload: parsed || text,
        });
        setEmailState("error");
        if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
        emailTimerRef.current = setTimeout(() => setEmailState("idle"), 1600);
        return;
      }
      if (parsed && parsed.ok === false) {
        const msg = parsed?.message || t("profile:messages.email_send_failed");
        console.warn("[ProfileModal] send-email-verification returned ok:false:", msg, parsed);
        setEmailState("error");
        if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
        emailTimerRef.current = setTimeout(() => setEmailState("idle"), 1600);
        return;
      }
      setEmailState("sent");
      if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
      emailTimerRef.current = setTimeout(() => setEmailState("idle"), 1400);
    } catch (e) {
      console.warn("[ProfileModal] send-email-verification exception:", e?.message || e, e);
      setEmailState("error");
      if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
      emailTimerRef.current = setTimeout(() => setEmailState("idle"), 1600);
    }
  }, [emailConfirmed, t]);

  useEffect(() => {
    if (!isOpen) return;
    refreshProfile?.();
  }, [isOpen, refreshProfile]);

  if (!isOpen) return null;
  if (!portalTarget) return null;

  // ✅ skeleton só quando "já estava concluído" e estamos esperando snapshot.
  const uidNow = effectiveUser?.id || null;
  const lastGoodSameUser = Boolean(uidNow && stepsLastGoodRef.current.uid === uidNow);
  const showDataSkeleton = Boolean(
    profileLoading && !profile && lastGoodSameUser && stepsLastGoodRef.current.hasData
  );
  const showIdentitySkeleton = Boolean(
    kycInfoState === "loading" && !kycInfo && lastGoodSameUser && stepsLastGoodRef.current.identity
  );
  const dataButtonText = showDataSkeleton
    ? null
    : hasFilledPersonalData
    ? t("profile:actions.done")
    : t("profile:actions.fill");
  const dataSubText = showDataSkeleton
    ? null
    : hasFilledPersonalData
    ? t("profile:actions.done")
    : t("profile:verification.steps.data_sub");

  const emailButtonText = emailConfirmed
    ? t("profile:actions.done")
    : emailState === "sending"
    ? t("profile:actions.sending")
    : emailState === "sent"
    ? t("profile:actions.sent")
    : emailState === "error"
    ? t("profile:actions.error")
    : t("profile:actions.send_confirmation");

  const emailSubText = emailConfirmed
    ? t("profile:verification.steps.email_done")
    : t("profile:verification.steps.email_sub");

  const identityButtonText =
    showIdentitySkeleton
      ? null
      : identityVerified
      ? t("profile:actions.done")
      : kycStatus === "pending"
      ? t("profile:verification.steps.pending")
      : kycStatus === "resubmit_required"
      ? t("profile:verification.steps.resubmit")
      : kycStatus === "rejected"
      ? t("profile:verification.steps.resubmit")
      : t("profile:actions.fill");

  const identitySubText =
    showIdentitySkeleton
      ? null
      : identityVerified
      ? t("profile:verification.steps.identity_done")
      : kycStatus === "pending"
      ? t("profile:verification.steps.pending")
      : kycStatus === "resubmit_required"
      ? t("profile:verification.steps.resubmit")
      : kycStatus === "rejected"
      ? t("profile:verification.steps.rejected")
      : t("profile:verification.steps.identity_sub");

  const identityActionDisabled = Boolean(
    identityVerified || kycStatus === "pending" || kycInfoState === "loading"
  );

  return createPortal(
    <div className={`${styles.backdrop} ${isTradeMode ? styles.backdropTrade : ""}`} style={{ pointerEvents: "auto" }}>
      <div className={`${styles.modal} ${isTradeMode ? styles.modalTrade : ""}`}>
        <div className={`${styles.topBar} ${isTradeMode ? styles.topBarTrade : ""}`}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tabBtn} ${tab === "perfil" ? styles.active : ""}`}
              onClick={() => goTab("perfil")}
              type="button"
            >
              {t("profile:tabs.perfil")}
            </button>
            <button
              className={`${styles.tabBtn} ${tab === "dados" ? styles.active : ""}`}
              onClick={() => goTab("dados")}
              type="button"
            >
              {t("profile:tabs.dados")}
            </button>
            <button
              className={`${styles.tabBtn} ${tab === "seguranca" ? styles.active : ""}`}
              onClick={() => goTab("seguranca")}
              type="button"
            >
              {t("profile:tabs.seguranca")}
            </button>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => {
              SoundManager.uiClick();
              requestClose();
            }}
            aria-label={t("profile:identity.close")}
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {tab === "perfil" && (
            <div className={`${styles.profileWrap} ${styles.profileWrapTop}`}>
              <div className={styles.profileGrid}>
                <div className={styles.profileCard}>
                  <div className={styles.cardTitle}>{t("profile:avatar.title")}</div>
                  <div className={styles.profileAvatar}>
                    <div
                      className={styles.profileAvatarInner}
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "10px",
                        backgroundImage: `url(${avatarBust || ""})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                      }}
                      aria-label={t("profile:avatar.title")}
                      title={t("profile:avatar.title")}
                    />
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={onPickAvatar}
                  />
                  <button
                    type="button"
                    className={styles.btnPrimaryWide}
                    onClick={openAvatarPicker}
                    disabled={avatarBusy}
                    aria-busy={avatarBusy ? "true" : "false"}
                  >
                    {avatarBusy && <span className={styles.spinner} aria-hidden="true" />}
                    {avatarBusy ? (avatarMsg || t("profile:actions.sending")) : (avatarMsg || t("profile:avatar.upload"))}
                  </button>
                </div>
                <div className={styles.profileCard}>
                  <div className={styles.profileTitleRow}>
                    <div className={styles.profileTitle}>{t("profile:verification.title")}</div>
                    <div className={styles.profileHint}>{t("profile:verification.remaining", { count: remainingCount })}</div>
                  </div>
                  <div className={styles.profileSteps}>
                    <div className={styles.profileStep}>
                      <div className={styles.profileStepLeft}>
                        <span className={`${styles.profileMarker} ${emailConfirmed ? styles.profileMarkerDone : ""}`}>
                          <span className={styles.profileDot} />
                        </span>
                        <div className={styles.profileStepText}>
                          <div className={styles.profileStepName}>{t("profile:verification.steps.email_title")}</div>
                          <div className={styles.profileStepSub}>{emailSubText}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.btnStepAction}
                        onClick={sendEmailConfirmation}
                        disabled={emailConfirmed || emailState === "sending"}
                      >
                        {emailState === "sending" && <span className={styles.spinnerSmall} aria-hidden="true" />}
                        <span className={styles.btnStepActionLine}>{emailButtonText}</span>
                      </button>
                    </div>
                    <div className={styles.profileStep}>
                      <div className={styles.profileStepLeft}>
                        <span className={`${styles.profileMarker} ${hasFilledPersonalData ? styles.profileMarkerDone : ""}`}>
                          <span className={styles.profileDot} />
                        </span>
                        <div className={styles.profileStepText}>
                          <div className={styles.profileStepName}>{t("profile:verification.steps.data_title")}</div>
                          <div className={styles.profileStepSub}>
                            {dataSubText ?? <span className={styles.skelLine} />}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.btnGreenSmall}
                        onClick={() => goTab("dados")}
                        disabled={hasFilledPersonalData}
                      >
                        {dataButtonText ?? <span className={styles.skelLineBtn} />}
                      </button>
                    </div>
                    <div className={styles.profileStep}>
                      <div className={styles.profileStepLeft}>
                        <span className={`${styles.profileMarker} ${identityVerified ? styles.profileMarkerDone : ""}`}>
                          <span className={styles.profileDot} />
                        </span>
                        <div className={styles.profileStepText}>
                          <div className={styles.profileStepName}>{t("profile:verification.steps.identity_title")}</div>
                          <div className={styles.profileStepSub}>
                            {identitySubText ?? <span className={styles.skelLine} />}
                          </div>
                          {!identityVerified && (kycStatus === "rejected" || kycStatus === "resubmit_required") && kycAdminNote ? (
                            <div className={styles.profileStepSub} style={{ marginTop: 4, opacity: 0.9 }}>
                              {kycAdminNote}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.btnGreenSmall}
                        onClick={openIdentity}
                        disabled={identityActionDisabled}
                      >
                        {identityButtonText ?? <span className={styles.skelLineBtn} />}
                      </button>
                    </div>
                  </div>
                  <div className={styles.profileDivider} />
                  <div className={styles.profileTitle}>{t("profile:security.title")}</div>
                  <div className={styles.profileMuted}>{t("profile:security.recommendation")}</div>
                  <button type="button" className={styles.btnGreenSmall} onClick={() => goTab("seguranca")}>
                    {t("profile:security.change_btn")}
                  </button>
                </div>
              </div>
              {idOpen && (
                <div className={styles.identityOverlay} role="dialog" aria-modal="true">
                  <div className={styles.identityModal}>
                    <div className={styles.identityHeader}>
                      <div className={styles.identityTitle}>{t("profile:identity.title")}</div>
                      <button
                        type="button"
                        className={styles.identityClose}
                        onClick={closeIdentity}
                        aria-label={t("profile:identity.close")}
                        disabled={kycState === "sending"}
                      >
                        ✕
                      </button>
                    </div>
                    {idStep === "intro" && (
                      <div className={styles.identityBody}>
                        <div className={styles.identityText}>
                          {t("profile:identity.instructions")}
                        </div>
                        <div className={styles.identityTextMuted}>
                          {t("profile:identity.warning")}
                        </div>
                        <div className={styles.identityPreviewBox}>
                          <div className={styles.identityPreviewItem}>
                            <div className={styles.identityBadgeGood}>{t("profile:identity.preview.good")}</div>
                            <div className={styles.identityDoc}>
                              <div className={styles.identityDocPhoto} />
                              <div className={styles.identityDocLine} />
                              <div className={styles.identityDocLineShort} />
                              <div className={styles.identityDocDivider} />
                              <div className={styles.identityDocLine2} />
                              <div className={styles.identityDocLine2Short} />
                              <div className={styles.identityDocStamp} />
                              <div className={styles.identityCornersGood} />
                            </div>
                          </div>
                          <div className={styles.identityPreviewItem}>
                            <div className={styles.identityBadgeBad}>{t("profile:identity.preview.bad")}</div>
                            <div className={`${styles.identityDoc} ${styles.identityDocBad}`}>
                              <div className={styles.identityDocPhoto} />
                              <div className={styles.identityDocLine} />
                              <div className={styles.identityDocLineShort} />
                              <div className={styles.identityDocDivider} />
                              <div className={styles.identityDocLine2} />
                              <div className={styles.identityDocLine2Short} />
                              <div className={styles.identityDocStamp} />
                              <div className={styles.identityCornersBad} />
                            </div>
                          </div>
                        </div>
                        <button type="button" className={styles.identityBtnStart} onClick={startIdentity}>
                          {t("profile:actions.start_verification")}
                        </button>
                      </div>
                    )}
                    {idStep === "upload" && (
                      <div className={styles.identityBody}>
                        <div className={styles.identityUploadTop}>
                          {doneFiles.length === 0 ? (
                            <div className={styles.identityUploadTitle}>{t("profile:identity.upload.none")}</div>
                          ) : (
                            <div className={styles.identityUploadedTitle}>{t("profile:identity.upload.list_title")}</div>
                          )}
                          {doneFiles.length > 0 && (
                            <div className={styles.identityUploadedList}>
                              {doneFiles.map((x) => (
                                <div key={x.id} className={styles.identityUploadedRow}>
                                  <div className={styles.identityUploadedLeft}>
                                    <span className={styles.identityClip}>📎</span>
                                    <span className={styles.identityUploadedName}>{x.file?.name || t("profile:identity.upload.file")}</span>
                                  </div>
                                  <button
                                    type="button"
                                    className={styles.identityTrashRed}
                                    onClick={() => removePicked(x.id)}
                                    aria-label={t("profile:avatar.removing")}
                                    title={t("profile:avatar.removing")}
                                    disabled={kycState === "sending"}
                                  >
                                    🗑
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className={styles.identityUploadHint}>
                            {t("profile:identity.upload.hint")}
                          </div>
                          {isUploading && (
                            <div className={styles.identityProgressWrap} aria-label={t("profile:identity.upload.progress")}>
                              <div className={styles.identityProgressBar}>
                                <div
                                  className={styles.identityProgressFill}
                                  style={{ width: `${overallProgress}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {kycMsg ? (
                            <div style={{ marginTop: 10, fontSize: 12, color: kycState === "error" ? "#ffb4b4" : "#b7f7c0" }}>
                              {kycMsg}
                            </div>
                          ) : null}
                        </div>
                        <input
                          ref={idFileInputRef}
                          type="file"
                          className={styles.identityHiddenInput}
                          onChange={onPickFiles}
                          multiple
                          accept="image/*"
                        />
                        <div className={styles.identityUploadActions}>
                          <button
                            type="button"
                            className={styles.identityBtnBlue}
                            onClick={addFiles}
                            disabled={kycState === "sending"}
                          >
                            {t("profile:actions.add_file")}
                          </button>
                          <button
                            type="button"
                            className={`${styles.identityBtnGreen} ${!canSend ? styles.disabled : ""}`}
                            onClick={sendToReview}
                            disabled={!canSend}
                          >
                            {kycState === "sending" ? t("profile:actions.sending") : kycState === "sent" ? t("profile:actions.sent") : t("profile:actions.send_review")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === "dados" && (
            <div className={styles.profileWrap}>
              <div className={styles.dataCard}>
                <div className={styles.dataGrid}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t("profile:form.email")}</label>
                    <input className={styles.input} value={form.email} readOnly disabled />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t("profile:form.nickname")}</label>
                    <input className={styles.input} value={form.apelido} onChange={(e) => setField("apelido", e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t("profile:form.first_name")}</label>
                    <input className={styles.input} value={form.nome} onChange={(e) => setField("nome", e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t("profile:form.last_name")}</label>
                    <input className={styles.input} value={form.sobrenome} onChange={(e) => setField("sobrenome", e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t("profile:form.cpf")}</label>
                    <input className={styles.input} value={form.cpf} onChange={(e) => setField("cpf", e.target.value)} disabled={cpfLocked} readOnly={cpfLocked} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t("profile:form.phone")}</label>
                    <input className={styles.input} value={form.telefone} onChange={(e) => setField("telefone", e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t("profile:form.country")}</label>
                    <select
                      className={`${styles.input} ${styles.selectBlue}`}
                      value={form.pais}
                      onChange={(e) => setField("pais", e.target.value)}
                    >
                      {countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t("profile:form.city")}</label>
                    <input className={styles.input} value={form.cidade} onChange={(e) => setField("cidade", e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t("profile:form.sex")}</label>
                    <select className={`${styles.input} ${styles.selectBlue}`} value={form.sexo} onChange={(e) => setField("sexo", e.target.value)}>
                      <option value="Masculino">{t("profile:options.sex.male")}</option>
                      <option value="Feminino">{t("profile:options.sex.female")}</option>
                      <option value="Outro">{t("profile:options.sex.other")}</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t("profile:form.birth_date")}</label>
                    <input className={styles.input} type="date" value={form.nascimento} onChange={(e) => setField("nascimento", e.target.value)} disabled={birthLocked} readOnly={birthLocked} />
                  </div>
                </div>
                <div className={styles.dataFooter}>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={form.ranking} onChange={(e) => setField("ranking", Boolean(e.target.checked))} />
                    <span>{t("profile:form.ranking_label")}</span>
                  </label>
                  <button type="button" className={styles.btnPrimaryWide} onClick={doSave} disabled={profileLoading || saveState === "saving"}>
                    {saveState === "saving" && <span className={styles.spinner} aria-hidden="true" />}
                    {saveState === "saving" ? t("profile:actions.saving") : saveState === "success" ? t("profile:actions.done") : saveState === "error" ? t("profile:actions.error") : t("profile:actions.save")}
                  </button>
                </div>
              </div>
            </div>
          )}
          {tab === "seguranca" && (
            <div className={`${styles.profileWrap} ${styles.securityWrap}`}>
              <div className={styles.securityCard}>
                <div className={styles.field}>
                  <label className={styles.label}>{t("profile:security.old_password")}</label>
                  <input className={styles.input} type="password" value={oldPass} onChange={(e) => setOldPass(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>{t("profile:security.new_password")}</label>
                  <input className={styles.input} type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>{t("profile:security.confirm_password")}</label>
                  <input className={styles.input} type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} />
                </div>
                <button
                  type="button"
                  className={`${styles.btnPrimaryWide} ${!canChangePassword ? styles.disabled : ""}`}
                  onClick={doChangePassword}
                  disabled={!canChangePassword || passState === "saving"}
                >
                  {passState === "saving" && <span className={styles.spinner} aria-hidden="true" />}
                  {passState === "saving"
                    ? t("profile:security.changing")
                    : passState === "success"
                    ? t("profile:actions.done")
                    : passState === "error"
                    ? t("profile:actions.error")
                    : t("profile:security.change_btn")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    portalTarget
  );
}