/**
 * Web Audio API Sound Synthesizer
 * Pure procedural audio synthesis for authentic board game tactile feedback.
 * Zero external audio files required!
 */

export class BoardGameAudio {
  private static ctx: AudioContext | null = null;
  private static enabled: boolean = true;

  private static getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public static toggleSound(enabled?: boolean): boolean {
    this.enabled = enabled !== undefined ? enabled : !this.enabled;
    return this.enabled;
  }

  public static isSoundEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Snappy card slide / draw sound
   */
  public static playCardDraw(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.12);
    filter.Q.setValueAtTime(2.0, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
  }

  /**
   * Rattling dice roll on wood table
   */
  public static playDiceRoll(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const hitTimes = [0, 0.07, 0.15, 0.23, 0.32, 0.44];
    hitTimes.forEach((delay, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const pitch = 220 + Math.random() * 140 - idx * 20;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(pitch, ctx.currentTime + delay);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.6, ctx.currentTime + delay + 0.05);

      gain.gain.setValueAtTime(0.2 / (idx + 1), ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.06);
    });
  }

  /**
   * Crisp ceramic chip / gem token clink
   */
  public static playChipClink(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const freqs = [3200, 4800, 6400];
    freqs.forEach(f => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    });
  }

  /**
   * Wood construction placement thud
   */
  public static playBuild(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  /**
   * Eerie gothic low drone when Haunt triggers
   */
  public static playHauntAlarm(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(65, ctx.currentTime); // Low C2
    osc1.frequency.linearRampToValueAtTime(55, ctx.currentTime + 1.2);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(68.5, ctx.currentTime); // Discordant beat note
    osc2.frequency.linearRampToValueAtTime(58, ctx.currentTime + 1.2);

    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 1.5);
    osc2.stop(ctx.currentTime + 1.5);
  }

  /**
   * Cheerful victory chime
   */
  public static playVictoryFanfare(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + idx * 0.12;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.45);
    });
  }
}
