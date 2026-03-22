// src/components/Maintenance/MaintenanceOverlay.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMaintenance } from "@/context/MaintenanceContext";
import SoundManager from "@/sound/SoundManager.js";

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}
function rand(a, b) {
  return a + Math.random() * (b - a);
}

// ✅ raio mais “estiloso”: serrilhado com ramificações
function generateLightningBolt(w, h) {
  const startX = rand(w * 0.15, w * 0.85);
  const startY = -30;

  const endX = startX + rand(-w * 0.10, w * 0.10);
  const endY = rand(h * 0.55, h * 0.95);

  const segs = Math.floor(rand(8, 14));
  const pts = [{ x: startX, y: startY }];

  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const y = startY + (endY - startY) * t;
    const xBase = startX + (endX - startX) * t;

    const amp = w * (0.010 + (1 - t) * 0.018);
    const x = xBase + rand(-amp, amp) * (i % 2 === 0 ? 1 : -1);

    pts.push({ x, y });
  }

  const main = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const branches = [];
  const branchCount = Math.floor(rand(2, 5));

  for (let b = 0; b < branchCount; b++) {
    const anchorIdx = Math.floor(rand(2, pts.length - 3));
    const a = pts[anchorIdx];

    const len = rand(h * 0.05, h * 0.16);
    const dir = Math.random() < 0.5 ? -1 : 1;

    const xEnd = a.x + dir * rand(w * 0.03, w * 0.11);
    const yEnd = a.y + len;

    const midX = (a.x + xEnd) / 2 + dir * rand(w * 0.01, w * 0.04);
    const midY = (a.y + yEnd) / 2;

    branches.push(
      `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${midX.toFixed(1)} ${midY.toFixed(1)} L ${xEnd.toFixed(1)} ${yEnd.toFixed(1)}`
    );
  }

  return { main, branches };
}

export default function MaintenanceOverlay() {
  const { overlayVisible, message, updated_at } = useMaintenance();

  const rainEnabled = (import.meta.env.VITE_MAINTENANCE_RAIN ?? "1") !== "0";
  const rainAudioEnabled = (import.meta.env.VITE_MAINTENANCE_RAIN_AUDIO ?? "1") !== "0";
  const thunderEnabled = (import.meta.env.VITE_MAINTENANCE_THUNDER ?? "1") !== "0";

  // ✅ volumes
  const rainVolume = clamp(Number(import.meta.env.VITE_MAINTENANCE_RAIN_VOLUME ?? "0.08"), 0, 1);
  const thunderVolume = clamp(Number(import.meta.env.VITE_MAINTENANCE_THUNDER_VOLUME ?? "0.32"), 0, 1);

  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  // ✅ tamanho do overlay (pra viewBox nunca “travar”)
  const [overlaySize, setOverlaySize] = useState(() => ({
    w: window.innerWidth || 1200,
    h: window.innerHeight || 800,
  }));

  // ⚡ event: flash / bolt
  const [flashKey, setFlashKey] = useState(0);

  // bolt com fases (show -> fade -> gone)
  const [boltData, setBoltData] = useState(null);
  const [boltPhase, setBoltPhase] = useState("OFF"); // OFF | ON | FADE
  const [boltKey, setBoltKey] = useState(0);

  // 🔊 chuva nodes
  const rainNodeRef = useRef({
    src: null,
    gain: null,
    filterLo: null,
    filterHi: null,
    trem: null,
    tremGain: null,
  });

  const timersRef = useRef({
    lightning: null,
    boltFade: null,
    boltOff: null,
    thunder: null,
  });

  const safeMsg = String(
    message ||
      "Estamos em manutenção no momento. O gráfico permanece disponível, mas novas operações estão temporariamente bloqueadas."
  );

  const updatedLabel = useMemo(() => {
    if (!updated_at) return "";
    try {
      const d = new Date(updated_at);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString();
    } catch {
      return "";
    }
  }, [updated_at]);

  // ✅ mantém size atualizado
  useEffect(() => {
    if (!overlayVisible) return;

    const onResize = () => {
      setOverlaySize({
        w: window.innerWidth || 1200,
        h: window.innerHeight || 800,
      });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [overlayVisible]);

  // ===========================
  // 🌧️ CANVAS: CHUVA
  // ===========================
  useEffect(() => {
    if (!overlayVisible) return;
    if (!rainEnabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const density = 1000;
    const wind = 0;

    const drops = Array.from({ length: density }).map(() => {
      const z = Math.random();
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        len: 6 + z * 10,
        sp: 520 + z * 620,
        a: 0.08 + z * 0.10,
        lw: 0.5 + z * 0.5,
      };
    });

    let last = performance.now();

    const step = (now) => {
      const dt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
      last = now;

      ctx.clearRect(0, 0, w, h);

      for (const d of drops) {
        const dy = d.sp * dt;
        const dx = dy * wind;

        ctx.beginPath();
        ctx.globalAlpha = d.a;
        ctx.lineWidth = d.lw;
        ctx.strokeStyle = "rgba(220, 240, 255, 1)";
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + dx, d.y + d.len);
        ctx.stroke();

        d.x += dx;
        d.y += dy;

        if (d.y > h + 20) {
          d.y = -20 - Math.random() * 120;
          d.x = Math.random() * w;
        }
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [overlayVisible, rainEnabled]);

  // ==========================================
  // 🔊 AUDIO: chuva melhor (brown + tremolo leve)
  // ==========================================
  useEffect(() => {
    if (!overlayVisible) return;

    SoundManager.attachGestureUnlock();
    SoundManager.unlockFromUserGesture?.();

    const shouldPlayRain = rainEnabled && rainAudioEnabled;

    const stopRain = () => {
      const n = rainNodeRef.current;
      try {
        if (n?.src) {
          n.src.stop?.();
          n.src.disconnect?.();
        }
      } catch {}
      try {
        n?.filterLo?.disconnect?.();
        n?.filterHi?.disconnect?.();
        n?.gain?.disconnect?.();
        n?.trem?.disconnect?.();
        n?.tremGain?.disconnect?.();
      } catch {}
      rainNodeRef.current = { src: null, gain: null, filterLo: null, filterHi: null, trem: null, tremGain: null };
    };

    const startRain = async () => {
      if (!SoundManager?.ctx || !SoundManager?.gainNode) {
        await SoundManager.init?.().catch(() => {});
      }
      if (!SoundManager?.ctx || !SoundManager?.gainNode) return;

      // se ainda não desbloqueou, não toca (evita "silêncio bugado")
      if (!SoundManager.unlocked) return;

      if (rainNodeRef.current?.src) return;

      const ctx = SoundManager.ctx;

      const seconds = 3.0;
      const length = Math.floor(ctx.sampleRate * seconds);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let lastOut = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.0;
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const hi = ctx.createBiquadFilter();
      hi.type = "highpass";
      hi.frequency.value = 200;

      const lo = ctx.createBiquadFilter();
      lo.type = "lowpass";
      lo.frequency.value = 4200;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(clamp(rainVolume, 0, 1), ctx.currentTime);

      const trem = ctx.createOscillator();
      trem.type = "sine";
      trem.frequency.value = 0.18;

      const tremGain = ctx.createGain();
      tremGain.gain.value = 0.018;

      trem.connect(tremGain);
      tremGain.connect(gain.gain);

      src.connect(hi);
      hi.connect(lo);
      lo.connect(gain);
      gain.connect(SoundManager.gainNode);

      try {
        trem.start();
        src.start();
        rainNodeRef.current = { src, gain, filterLo: lo, filterHi: hi, trem, tremGain };
      } catch {}
    };

    if (shouldPlayRain) startRain();
    else stopRain();

    return () => stopRain();
  }, [overlayVisible, rainEnabled, rainAudioEnabled, rainVolume]);

  // ==========================================
  // 🔊 TROVÃO: REALISTA (rumble + body + eco + variação)
  // ==========================================
  async function playThunder() {
    if (!thunderEnabled) return;

    SoundManager.attachGestureUnlock();
    SoundManager.unlockFromUserGesture?.();

    if (!SoundManager?.ctx || !SoundManager?.gainNode) {
      await SoundManager.init?.().catch(() => {});
    }

    try {
      if (SoundManager?.ctx?.state === "suspended") {
        await SoundManager.ctx.resume();
      }
    } catch {}

    if (!SoundManager?.ctx || !SoundManager?.gainNode) return;
    if (!SoundManager.unlocked) return;

    const ctx = SoundManager.ctx;
    const master = SoundManager.gainNode;

    // intensidade dinâmica (fraco -> forte)
    const intensity = clamp(0.35 + Math.random() * 0.65, 0.35, 1);
    const dur = 2.8 + Math.random() * 3.6; // 2.8s .. 6.4s
    const hasCrack = Math.random() < (0.18 * intensity);

    const vol = clamp(thunderVolume * (0.65 + intensity * 0.85), 0, 1);

    const t0 = ctx.currentTime;

    // bus de saída
    const out = ctx.createGain();
    out.gain.setValueAtTime(vol, t0);

    // eco leve (delay + feedback + lowpass)
    const delay = ctx.createDelay(2.5);
    delay.delayTime.setValueAtTime(0.18 + Math.random() * 0.10, t0);

    const fb = ctx.createGain();
    fb.gain.setValueAtTime(0.22 + intensity * 0.18, t0);

    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.setValueAtTime(1600 + intensity * 900, t0);

    delay.connect(fb);
    fb.connect(damp);
    damp.connect(delay);

    const wet = ctx.createGain();
    wet.gain.setValueAtTime(0.18 + intensity * 0.22, t0);

    out.connect(delay);
    delay.connect(wet);

    // =======================
    // SUB RUMBLE (grave longo)
    // =======================
    const sub = ctx.createOscillator();
    sub.type = "sine";

    const f0 = 32 + Math.random() * 16; // 32..48
    const f1 = 55 + Math.random() * 18; // 55..73
    sub.frequency.setValueAtTime(f0, t0);
    sub.frequency.exponentialRampToValueAtTime(f1, t0 + 1.4);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t0);
    subGain.gain.exponentialRampToValueAtTime(0.55 * intensity, t0 + 0.55);
    subGain.gain.exponentialRampToValueAtTime(0.28 * intensity, t0 + 1.8);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    sub.connect(subGain);
    subGain.connect(out);

    // =======================
    // BODY NOISE (corpo grosso)
    // =======================
    const seconds = Math.max(2.0, dur);
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // brown-ish noise (mais grave, natural)
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.setValueAtTime(520 + intensity * 520, t0);

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(180 + Math.random() * 140, t0);
    band.Q.setValueAtTime(0.55, t0);

    // modulação lenta no band (vida)
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.setValueAtTime(0.12 + Math.random() * 0.10, t0);

    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(70 + intensity * 120, t0);

    mod.connect(modGain);
    modGain.connect(band.frequency);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, t0);
    bodyGain.gain.exponentialRampToValueAtTime(0.85 * intensity, t0 + 0.25);
    bodyGain.gain.exponentialRampToValueAtTime(0.40 * intensity, t0 + 1.4);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    noise.connect(low);
    low.connect(band);
    band.connect(bodyGain);
    bodyGain.connect(out);

    // =======================
    // crack opcional (bem baixo)
    // =======================
    let crack = null;
    let crackGain = null;
    let crackFilt = null;

    if (hasCrack) {
      const crackLen = Math.floor(ctx.sampleRate * 0.12);
      const crackBuf = ctx.createBuffer(1, crackLen, ctx.sampleRate);
      const cd = crackBuf.getChannelData(0);
      for (let i = 0; i < crackLen; i++) cd[i] = (Math.random() * 2 - 1) * 0.95;

      crack = ctx.createBufferSource();
      crack.buffer = crackBuf;

      crackFilt = ctx.createBiquadFilter();
      crackFilt.type = "highpass";
      crackFilt.frequency.setValueAtTime(800, t0);

      crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0.0001, t0);
      crackGain.gain.exponentialRampToValueAtTime(0.22 * intensity, t0 + 0.012);
      crackGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);

      crack.connect(crackFilt);
      crackFilt.connect(crackGain);
      crackGain.connect(out);
    }

    // saídas
    out.connect(master);
    wet.connect(master);

    // start/stop + cleanup
    const startDelay = 0.03 + Math.random() * 0.06; // distância
    try {
      mod.start(t0);
      sub.start(t0);
      noise.start(t0 + startDelay);
      if (crack) crack.start(t0);

      sub.stop(t0 + dur + 0.05);
      noise.stop(t0 + dur + 0.10);
      mod.stop(t0 + dur + 0.05);
      if (crack) crack.stop(t0 + 0.14);
    } catch {}

    setTimeout(() => {
      try {
        sub.disconnect();
        subGain.disconnect();
        noise.disconnect();
        low.disconnect();
        band.disconnect();
        bodyGain.disconnect();
        mod.disconnect();
        modGain.disconnect();

        if (crack) crack.disconnect();
        if (crackFilt) crackFilt.disconnect();
        if (crackGain) crackGain.disconnect();

        delay.disconnect();
        fb.disconnect();
        damp.disconnect();
        wet.disconnect();
        out.disconnect();
      } catch {}
    }, Math.ceil((dur + 1.0) * 1000));
  }

  // ==========================================
  // ⚡ scheduler: relâmpago / raio / trovão realistas
  // ==========================================
  useEffect(() => {
    if (!overlayVisible) return;

    const clearTimers = () => {
      const t = timersRef.current;
      if (t.lightning) clearTimeout(t.lightning);
      if (t.boltFade) clearTimeout(t.boltFade);
      if (t.boltOff) clearTimeout(t.boltOff);
      if (t.thunder) clearTimeout(t.thunder);
      timersRef.current = { lightning: null, boltFade: null, boltOff: null, thunder: null };
    };

    const fireFlash = () => {
      setFlashKey((k) => k + 1);
    };

    const fireBolt = () => {
      const { w, h } = overlaySize;
      setBoltData(generateLightningBolt(w, h));
      setBoltPhase("ON");
      setBoltKey((k) => k + 1);

      // ✅ some SEMPRE (fade -> off)
      if (timersRef.current.boltFade) clearTimeout(timersRef.current.boltFade);
      if (timersRef.current.boltOff) clearTimeout(timersRef.current.boltOff);

      timersRef.current.boltFade = setTimeout(() => {
        setBoltPhase("FADE");
      }, Math.floor(rand(140, 240)));

      timersRef.current.boltOff = setTimeout(() => {
        setBoltPhase("OFF");
        setBoltData(null);
      }, Math.floor(rand(320, 520)));
    };

    const scheduleNext = () => {
      clearTimeout(timersRef.current.lightning);

      const nextMs = Math.floor(rand(9000, 24000)); // frequência
      timersRef.current.lightning = setTimeout(async () => {
        if (!rainEnabled) return;

        // modos:
        // 0) só relâmpago
        // 1) relâmpago + trovão (sem raio)
        // 2) relâmpago + raio + trovão
        const r = Math.random();
        const mode = r < 0.55 ? 0 : r < 0.80 ? 1 : 2;

        // relâmpago sempre
        fireFlash();

        // bolt às vezes
        if (mode === 2) {
          fireBolt();
        }

        // trovão em (1 e 2), às vezes também no 0 (raramente)
        const shouldThunder = mode === 1 || mode === 2 ? true : Math.random() < 0.18;

        if (shouldThunder && thunderEnabled) {
          const delay = Math.floor(rand(260, 1200));
          if (timersRef.current.thunder) clearTimeout(timersRef.current.thunder);
          timersRef.current.thunder = setTimeout(() => {
            playThunder();
          }, delay);
        }

        scheduleNext();
      }, nextMs);
    };

    if (rainEnabled) scheduleNext();

    return () => clearTimers();
  }, [overlayVisible, rainEnabled, thunderEnabled, overlaySize]);

  if (!overlayVisible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* fundo leve */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.10))",
        }}
      />

      {/* ⚡ RAIOS (SVG) — some sempre por fase + animação */}
      {boltData && boltPhase !== "OFF" ? (
        <svg
          key={boltKey}
          width="100%"
          height="100%"
          viewBox={`0 0 ${overlaySize.w} ${overlaySize.h}`}
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            pointerEvents: "none",
            opacity: boltPhase === "FADE" ? 0 : 1,
            transition: "opacity 220ms ease-out",
          }}
        >
          <defs>
            <filter id="tpBoltGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.8" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="
                  1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 8 -2"
                result="glow"
              />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* halo (mais fino) */}
          <path
            d={boltData.main}
            fill="none"
            stroke="rgba(200,230,255,0.30)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#tpBoltGlow)"
          />

          {/* núcleo (bem mais fino) */}
          <path
            d={boltData.main}
            fill="none"
            stroke="rgba(255,255,255,0.95)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* ramificações */}
          {boltData.branches.map((d, idx) => (
            <path
              key={idx}
              d={d}
              fill="none"
              stroke="rgba(240,250,255,0.85)"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
            />
          ))}
        </svg>
      ) : null}

      {/* flash (relâmpago) — separado do raio */}
      <div
        key={flashKey}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          background: "rgba(255,255,255,0.0)",
          animation: "tp_lightning 520ms ease-out",
          pointerEvents: "none",
          mixBlendMode: "screen",
        }}
      />

      {/* chuva */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 3,
          pointerEvents: "none",
          display: "block",
          opacity: 0.9,
        }}
      />

      {/* card */}
      <div
        style={{
          position: "relative",
          zIndex: 4,
          width: "min(640px, 100%)",
          marginTop: 72,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(10,14,20,0.72)",
          padding: 12,
          color: "#e5e7eb",
          boxShadow: "0 14px 55px rgba(0,0,0,0.55)",
          overflow: "hidden",
          animation: "tp_maint_in 180ms ease-out",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "#fbbf24",
                  boxShadow: "0 0 18px rgba(251,191,36,0.55)",
                  display: "inline-block",
                }}
              />
              Manutenção
            </span>

            {updatedLabel ? (
              <span style={{ fontSize: 12, color: "#9aa4b2" }}>
                Atualizado: <b style={{ color: "#cbd5e1" }}>{updatedLabel}</b>
              </span>
            ) : null}
          </div>

          <span
            style={{
              fontSize: 12,
              color: "#9aa4b2",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.18)",
              padding: "5px 10px",
              borderRadius: 999,
            }}
          >
            Operações bloqueadas
          </span>
        </div>

        <div style={{ marginTop: 8, fontSize: 13, color: "#cbd5e1", lineHeight: 1.45 }}>{safeMsg}</div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#9aa4b2" }}>
          Você pode continuar analisando o gráfico normalmente durante a manutenção.
        </div>
      </div>

      <style>{`
        @keyframes tp_maint_in {
          from { opacity: 0; transform: translateY(-5px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* flash bonito e rápido */
        @keyframes tp_lightning {
          0%   { background: rgba(255,255,255,0); }
          12%  { background: rgba(255,255,255,0.12); }
          18%  { background: rgba(255,255,255,0.02); }
          26%  { background: rgba(255,255,255,0.18); }
          34%  { background: rgba(255,255,255,0.03); }
          100% { background: rgba(255,255,255,0); }
        }
      `}</style>
    </div>
  );
}
