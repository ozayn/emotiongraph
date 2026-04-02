/**
 * Lightweight client-side check: decode recorded audio and measure peak / RMS.
 * Skips a round-trip to STT when the clip is clearly silent (saves latency and API calls).
 * Returns null if decoding fails (e.g. unsupported container) — caller should proceed with upload.
 */
const PEAK_SILENCE_MAX = 0.012;
const RMS_SILENCE_MAX = 0.004;

function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

export async function blobFailsMinimumSpeechEnergy(blob: Blob): Promise<boolean | null> {
  const AC = getAudioContextClass();
  if (!AC || blob.size < 80) {
    return null;
  }
  let ctx: AudioContext | null = null;
  try {
    ctx = new AC();
    const ab = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(ab.slice(0));
    const frames = audio.length;
    const nCh = audio.numberOfChannels;
    if (frames === 0 || nCh === 0) {
      return true;
    }
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < frames; i++) {
      let acc = 0;
      for (let c = 0; c < nCh; c++) {
        const v = audio.getChannelData(c)[i];
        const a = Math.abs(v);
        if (a > peak) peak = a;
        acc += v;
      }
      const mono = acc / nCh;
      sumSq += mono * mono;
    }
    const rms = Math.sqrt(sumSq / frames);
    if (peak < PEAK_SILENCE_MAX && rms < RMS_SILENCE_MAX) {
      return true;
    }
    return false;
  } catch {
    return null;
  } finally {
    if (ctx) {
      void ctx.close();
    }
  }
}
