export interface AudioEffect {
  id: string;
  name: string;
  description: string;
  apply: (context: AudioContext, source: AudioNode) => AudioNode;
}

export const AUDIO_EFFECTS_REGISTRY: Record<string, AudioEffect> = {
  none: {
    id: "none",
    name: "Normal",
    description: "No audio effect applied",
    apply: (context, source) => source,
  },

  bassBoost: {
    id: "bassBoost",
    name: "Bass Boost",
    description: "Bass booster",
    apply: (context, source) => {
      const filter = context.createBiquadFilter();
      filter.type = "lowshelf";
      filter.frequency.value = 200;
      filter.gain.value = 10;
      source.connect(filter);
      return filter;
    },
  },

  nightMode: {
    id: "nightMode",
    name: "Night Mode",
    description: "Compress the dynamix (clear voices, reduced explosions)",
    apply: (context, source) => {
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -30;
      compressor.knee.value = 12;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      source.connect(compressor);
      return compressor;
    },
  },
};