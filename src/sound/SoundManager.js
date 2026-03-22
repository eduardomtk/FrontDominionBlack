import win01 from "@/assets/sounds/win_01.wav";
import loss01 from "@/assets/sounds/loss_01.wav";

class SoundManager {
  static ctx = null;
  static gainNode = null;
  static winBuffer = null;
  static lossBuffer = null;

  // ✅ Volume global mais adequado para produção
  // Antes: 0.7
  static volume = 0.92;

  // ✅ MUTE GLOBAL (source of truth)
  static muted = false;
  static MUTE_KEY = "tp_muted";

  static unlocked = false;
  static loading = false;

  // ✅ counting soundless (micro tick)
  static lastTickAt = 0;

  // ✅ debounce dos clicks
  static lastUiClickAt = 0;
  static lastTradeClickAt = 0;

  // ✅ garante que não registre listeners/locks repetidos
  static gestureUnlockAttached = false;

  // =========================
  // ✅ Persistência / Helpers
  // =========================
  static getStoredMuted() {
    try {
      return localStorage.getItem(this.MUTE_KEY) === "1";
    } catch {
      return false;
    }
  }

  static applyEffectiveGain() {
    if (!this.gainNode) return;

    const effective = this.muted ? 0 : this.volume;

    try {
      this.gainNode.gain.cancelScheduledValues?.(0);
      this.gainNode.gain.setValueAtTime(
        effective,
        this.ctx?.currentTime ?? 0
      );
    } catch {
      this.gainNode.gain.value = effective;
    }
  }

  static setMuted(nextMuted) {
    const v = !!nextMuted;
    this.muted = v;

    try {
      localStorage.setItem(this.MUTE_KEY, v ? "1" : "0");
    } catch {
      // silencioso
    }

    this.applyEffectiveGain();
  }

  static isMuted() {
    return !!this.muted;
  }

  static canPlay() {
    if (this.muted) return false;
    if (!this.unlocked || !this.ctx || !this.gainNode) return false;
    if (this.ctx.state !== "running") return false;
    return true;
  }

  static async ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (!this.gainNode) {
      this.gainNode = this.ctx.createGain();
      this.gainNode.connect(this.ctx.destination);
    }

    this.applyEffectiveGain();

    if (this.ctx.state === "suspended" || this.ctx.state === "interrupted") {
      try {
        await this.ctx.resume();
      } catch {
        // silencioso
      }
    }

    return this.ctx;
  }

  static async init() {
    if (this.loading) return;
    this.loading = true;

    try {
      // ✅ lê persistência uma vez na inicialização
      this.muted = this.getStoredMuted();

      await this.ensureContext();

      // ✅ Carrega WAVs (win/loss) a partir de src/assets (bundler gera a URL)
      this.winBuffer = await this.safeLoad(win01);
      this.lossBuffer = await this.safeLoad(loss01);

      if (this.ctx?.state === "running") {
        this.unlocked = true;
      }

      // ✅ importante no mobile: já deixa os listeners de unlock prontos
      this.attachGestureUnlock();

      console.log("🔊 SoundManager PREMIUM pronto");
    } catch (err) {
      console.warn("🔇 Audio indisponível:", err);
    } finally {
      this.loading = false;
    }
  }

  // ✅ chamado por gesto do usuário (pointerdown/keydown/touchstart)
  // reforçado para mobile
  static async unlockFromUserGesture() {
    try {
      if (this.ctx == null || this.gainNode == null) {
        this.muted = this.getStoredMuted();
      }

      await this.ensureContext();

      // ✅ priming inaudível pra destravar iOS/Android
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(80, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.00001, this.ctx.currentTime);

      osc.connect(gain);
      gain.connect(this.gainNode);

      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.015);

      // alguns browsers mobile precisam de uma nova tentativa de resume
      if (this.ctx.state === "suspended" || this.ctx.state === "interrupted") {
        try {
          await this.ctx.resume();
        } catch {
          // silencioso
        }
      }

      if (this.ctx.state === "running") {
        this.unlocked = true;
      }

      // ✅ carrega buffers sem travar interação
      if (!this.winBuffer) {
        this.safeLoad(win01).then((b) => {
          this.winBuffer = b;
        });
      }

      if (!this.lossBuffer) {
        this.safeLoad(loss01).then((b) => {
          this.lossBuffer = b;
        });
      }
    } catch {
      // silencioso
    }
  }

  static attachGestureUnlock() {
    if (this.gestureUnlockAttached) return;
    this.gestureUnlockAttached = true;

    const once = () => {
      this.unlockFromUserGesture();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        this.unlockFromUserGesture();
      }
    };

    // ✅ capture=true pra pegar antes de tudo
    window.addEventListener("pointerdown", once, true);
    window.addEventListener("mousedown", once, true);
    window.addEventListener("touchstart", once, true);
    window.addEventListener("touchend", once, true);
    window.addEventListener("click", once, true);
    window.addEventListener("keydown", once, true);
    document.addEventListener("visibilitychange", onVisibility, true);
  }

  static async safeLoad(url) {
    try {
      if (!this.ctx) return null;

      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) throw new Error("Audio fetch failed");

      const buffer = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(buffer.slice(0));
    } catch (err) {
      console.warn(`⚠️ Falha ao carregar som: ${url}`);
      return null;
    }
  }

  static async beforePlay() {
    if (this.muted) return false;

    try {
      await this.ensureContext();

      if (this.ctx?.state === "running") {
        this.unlocked = true;
        return true;
      }
    } catch {
      // silencioso
    }

    return false;
  }

  static async play(buffer) {
    if (!buffer) return;
    const ok = await this.beforePlay();
    if (!ok) return;

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);
      source.start();
    } catch {
      // silencioso
    }
  }

  static playWin() {
    this.play(this.winBuffer);
  }

  // ✅ LOSS um pouco mais presente, mas ainda profissional
  static async playLoss() {
    if (!this.lossBuffer) return;

    const ok = await this.beforePlay();
    if (!ok) return;

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = this.lossBuffer;

      const lossGain = this.ctx.createGain();
      // antes: 0.55
      lossGain.gain.value = 0.82;

      source.connect(lossGain);
      lossGain.connect(this.gainNode);

      source.start();
    } catch {
      // silencioso
    }
  }

  static setVolume(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return;

    this.volume = Math.max(0, Math.min(1, num));
    this.applyEffectiveGain();
  }

  // ==================================================
  // ✅ Counting Soundless: micro "tick" curtinho e discreto
  // ==================================================
  static async tickSoft() {
    const now = performance.now();
    if (now - this.lastTickAt < 120) return;
    this.lastTickAt = now;

    const ok = await this.beforePlay();
    if (!ok) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = 920;

      // antes: 0.015
      const base = 0.03;

      gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(base, this.ctx.currentTime + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.045);

      osc.connect(gain);
      gain.connect(this.gainNode);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {
      // silencioso
    }
  }

  // ==================================================
  // ✅ UI Click (global) — mais natural no mobile
  // ==================================================
  static async uiClick() {
    const now = performance.now();
    if (now - this.lastUiClickAt < 70) return;
    this.lastUiClickAt = now;

    const ok = await this.beforePlay();
    if (!ok) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(900, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(980, this.ctx.currentTime + 0.012);

      // antes: 0.070
      const base = 0.14;

      gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(base, this.ctx.currentTime + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.040);

      osc.connect(gain);
      gain.connect(this.gainNode);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {
      // silencioso
    }
  }

  // ==================================================
  // ✅ Trade Click (CALL/PUT) — forte, mas sem exagero
  // ==================================================
  static async tradeClick() {
    const now = performance.now();
    if (now - this.lastTradeClickAt < 160) return;
    this.lastTradeClickAt = now;

    const ok = await this.beforePlay();
    if (!ok) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";

      osc.frequency.setValueAtTime(820, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1120, this.ctx.currentTime + 0.012);

      // antes: 0.250
      const base = 0.22;

      gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(base, this.ctx.currentTime + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.070);

      osc.connect(gain);
      gain.connect(this.gainNode);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // silencioso
    }
  }
}

export default SoundManager;