import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import React, { useEffect, useRef, useState } from "react"
import { LuActivity, LuRotateCcw, LuPlay, LuPause } from "react-icons/lu"
import { Modal } from "@/components/ui/modal"
import { cn } from "@/components/ui/core/styling"
import { vc_dispatchAction } from "./video-core.utils"
import { 
  vc_containerElement, 
  vc_isFullscreen, 
  vc_selectedAudioEffect,
  vc_paused,
  vc_analyserNode,
  vc_eqGains
} from "./video-core-atoms"

export interface AudioEffect {
  id: string
  name: string
  description: string
  gains: number[]
  apply: (context: AudioContext, source: AudioNode) => AudioNode
}

export const audioEffectsModalAtom = atom(false)

const EQ_BANDS = [
  { label: "60Hz", sub: "Deep bass", freq: 60 },
  { label: "230Hz", sub: "Bass / Medium", freq: 230 },
  { label: "910Hz", sub: "Voices / Medium", freq: 910 },
  { label: "3.6kHz", sub: "High pitch", freq: 3600 },
  { label: "14kHz", sub: "Brilliance", freq: 14000 },
]

export const AUDIO_EFFECTS_REGISTRY: Record<string, AudioEffect> = {
  none: {
    id: "none",
    name: "Normal",
    description: "No audio effect applied",
    gains: [0, 0, 0, 0, 0],
    apply: (context, source) => source,
  },
  bassBoost: {
    id: "bassBoost",
    name: "Bass Boost",
    description: "Bass booster",
    gains: [6, 4, 0, 0, 0],
    apply: (context, source) => {
      const filter = context.createBiquadFilter()
      filter.type = "lowshelf"
      filter.frequency.value = 200
      filter.gain.value = 6
      source.connect(filter)
      return filter
    },
  },
  nightMode: {
    id: "nightMode",
    name: "Night Mode",
    description: "Compress the dynamics (clear voices, reduced explosions)",
    gains: [-4, -2, 4, 1, -3],
    apply: (context, source) => {
      const compressor = context.createDynamicsCompressor()
      compressor.threshold.value = -30
      compressor.knee.value = 12
      compressor.ratio.value = 8
      compressor.attack.value = 0.003
      compressor.release.value = 0.25
      source.connect(compressor)
      return compressor
    },
  },
  custom: {
    id: "custom",
    name: "Custom",
    description: "Personnalized",
    gains: [0, 0, 0, 0, 0],
    apply: (context, source) => source,
  },
}

// Check if two configurations are the same
function areGainsEqual(a: number[], b: number[]) {
  if (!a || !b || a.length !== b.length) return false
  return a.every((val, index) => val === b[index])
}

// Spectrum + Equalizer
export function AudioSpectrumEqualizer() {
  const [selectedEffect, setSelectedEffect] = useAtom(vc_selectedAudioEffect)

  // Getting analyserNode from Jotai
  const analyserNode = useAtomValue(vc_analyserNode)

  // Getting the player's state
  const paused = useAtomValue(vc_paused)
  const dispatch = useSetAtom(vc_dispatchAction)

  // Equalizer's variables
  // const [gains, setGains] = useState<number[]>([0, 0, 0, 0, 0])
  const [gains, setGains] = useAtom(vc_eqGains)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const gainsRef = useRef(gains)
  useEffect(() => {
    gainsRef.current = gains
  }, [gains])

  // Handling when two configurations are the same
  const updatePresetFromGains = (newGains: number[]) => {
    // Look for a predefined preset with the same gains
    const matchingPreset = Object.values(AUDIO_EFFECTS_REGISTRY).find(
      (effect) => effect.id !== "custom" && areGainsEqual(effect.gains, newGains)
    )

    if (matchingPreset) {
      setSelectedEffect(matchingPreset.id)
    } else {
      setSelectedEffect("custom")
      AUDIO_EFFECTS_REGISTRY.custom.gains = newGains
    }
  }

  // Handling the reset of the equalizer
  const handleReset = () => {
    const nextGains = [0, 0, 0, 0, 0]
    setGains(nextGains)
    updatePresetFromGains(nextGains)
  }

  // Handling the equalizer's modifications
  const handleGainChange = (index: number, value: number) => {
    const currentGains = gains || [0, 0, 0, 0, 0]
    const nextGains = [...currentGains]
    nextGains[index] = value

    setGains(nextGains)
    updatePresetFromGains(nextGains)
  }

  const currentAnimatedGains = useRef<number[]>([0, 0, 0, 0, 0])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationFrameId: number

    const render = () => {
      const activeGains = gainsRef.current || [0, 0, 0, 0, 0]

      // Linear Interpolation
      currentAnimatedGains.current = currentAnimatedGains.current.map((current, idx) => {
        const target = activeGains[idx] ?? 0
        return current + (target - current) * 0.15 // Translation speed
      })

      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      // Central line 0dB
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()

      // Handling real audio data vs simulation
      const bufferLength = analyserNode ? analyserNode.frequencyBinCount : 32
      const dataArray = analyserNode ? new Uint8Array(bufferLength) : null
      
      let hasRealAudioSignal = false
      const isAudioContextRunning = analyserNode?.context?.state === "running"
      if (analyserNode && dataArray && isAudioContextRunning && !paused) {
        analyserNode.getByteFrequencyData(dataArray)

        // Check if no sound is played
        const totalEnergy = dataArray.reduce((acc, val) => acc + val, 0)
        hasRealAudioSignal = totalEnergy > 0
      }

      const barWidth = width / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        let barHeight = 0

        if (hasRealAudioSignal && dataArray) {
          // Displaying the spectrum of the player's audio
          barHeight = (dataArray[i] / 255) * (height * 0.85)
        } else {
          // If no sound is played, then display a stylish sinewave because I'm cool
          barHeight =
            Math.sin(Date.now() * 0.0025 + i * 0.3) * (height * 0.2) +
            height * 0.25
        }

        const gradient = ctx.createLinearGradient(0, height, 0, 0)
        gradient.addColorStop(0, "rgba(99, 102, 241, 0.05)")
        gradient.addColorStop(1, "rgba(168, 85, 247, 0.35)")

        ctx.fillStyle = gradient
        ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight)
        x += barWidth
      }

      // Displaying the curve of the equalizer
      ctx.beginPath()
      ctx.strokeStyle = "#818cf8"
      ctx.lineWidth = 3

      const step = width / (EQ_BANDS.length - 1)
      EQ_BANDS.forEach((_, idx) => {
        const gainVal = currentAnimatedGains.current[idx] ?? 0
        const y = height / 2 - (gainVal / 12) * (height / 2.5)
        const posX = idx * step

        if (idx === 0) {
          ctx.moveTo(posX, y)
        } else {
          const prevX = (idx - 1) * step
          const prevGain = currentAnimatedGains.current[idx - 1] || 0
          const prevY = height / 2 - (prevGain / 12) * (height / 2.5)
          const cpX = (prevX + posX) / 2
          ctx.bezierCurveTo(cpX, prevY, cpX, y, posX, y)
        }
      })
      ctx.stroke()

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => cancelAnimationFrame(animationFrameId)
  }, [analyserNode, gains])

  return (
    <div className="space-y-3">
      {/* Play/Pause button and Reset button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-neutral-400 font-medium">
          <LuActivity className="text-indigo-400 animate-pulse text-sm" />
          Parametric Equalizer & Spectrum
        </div>

        {/* Play / Pause button */}
        <button
          type="button"
          onClick={() => dispatch({ type: "togglePlay" })}
          className="flex items-center gap-1.5 text-xs font-medium text-neutral-200 hover:text-white transition-colors bg-indigo-600/80 hover:bg-indigo-600 px-2.5 py-1 rounded-md cursor-pointer"
          title={paused ? "Play" : "Pause"}
        >
          {paused ? (
            <>
              <LuPlay className="text-xs fill-current" />
              Play
            </>
          ) : (
            <>
              <LuPause className="text-xs fill-current" />
              Pause
            </>
          )}
        </button>

        {/* Reset button (0db) */}
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors bg-neutral-800/60 hover:bg-neutral-800 px-2.5 py-1 rounded-md border border-neutral-700/50 cursor-pointer"
        >
          <LuRotateCcw className="text-xs" />
          Reset (0 dB)
        </button>
      </div>

      {/* Unified canva */}
      <div className="relative w-full h-60 bg-neutral-950/80 rounded-2xl border border-neutral-800/80 overflow-hidden p-6 flex items-center">
        <canvas
          ref={canvasRef}
          width={700}
          height={240}
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
        />

        <div className="relative z-10 w-full h-full flex justify-between items-center gap-4">
          {EQ_BANDS.map((band, idx) => {
            const currentGain = gains ? gains[idx] : 0
            return (
              <div
                key={band.label}
                className="flex-1 h-full flex flex-col items-center justify-between group"
              >
                <span
                  className={`text-xs font-mono font-semibold transition-colors ${
                    currentGain > 0
                      ? "text-indigo-400"
                      : currentGain < 0
                      ? "text-rose-400"
                      : "text-neutral-500"
                  }`}
                >
                  {currentGain > 0 ? `+${currentGain}` : currentGain} dB
                </span>

                <div className="h-32 flex items-center justify-center py-2">
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={currentGain}
                    onChange={(e) =>
                      handleGainChange(idx, parseFloat(e.target.value))
                    }
                    className="h-28 w-1.5 accent-indigo-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer [writing-mode:vertical-lr] [direction:rtl]"
                  />
                </div>

                <div className="text-center space-y-0.5">
                  <p className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                    {band.label}
                  </p>
                  <p className="text-[10px] text-neutral-500 hidden md:block">
                    {band.sub}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------
export function VideoCoreAudioEffectsModal({ isWebPlayer }: { isWebPlayer: boolean }) {
  const isFullscreen = useAtomValue(vc_isFullscreen)
  const containerElement = useAtomValue(vc_containerElement)
  const [eqGains, setEqGains] = useAtom(vc_eqGains)

  const [selectedEffect, setSelectedEffect] = useAtom(vc_selectedAudioEffect)
  const [open, setOpen] = useAtom(audioEffectsModalAtom)

  const handleSelectPreset = (effect: AudioEffect) => {
    setSelectedEffect(effect.id)
    setEqGains(effect.gains)
  }

  return (
    <Modal
      title="Audio Effects & Equalizer"
      open={open}
      onOpenChange={setOpen}
      contentClass="max-w-3xl focus:outline-none focus-visible:outline-none outline-none bg-[--background] backdrop-blur-sm z-[101]"
      overlayClass="z-[150] bg-black/50"
      portalContainer={isFullscreen ? containerElement || undefined : undefined}
    >
      <div className="space-y-6">
        {/* Unified bloc Spectrum + Equalizer */}
        <AudioSpectrumEqualizer />

        {/* Preset's list */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-neutral-400 font-medium">
            Presets
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.values(AUDIO_EFFECTS_REGISTRY).map((effect) => {
              const isActive = selectedEffect === effect.id
              return (
                <button
                  key={effect.id}
                  type="button"
                  onClick={() => handleSelectPreset(effect)}
                  className={cn(
                    "flex flex-col text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer",
                    isActive
                      ? "bg-indigo-600/15 border-indigo-500/50 text-white shadow-md shadow-indigo-500/10"
                      : "bg-neutral-900/40 border-neutral-800 text-neutral-300 hover:bg-neutral-800/50 hover:border-neutral-700"
                  )}
                >
                  <span className="font-semibold text-sm mb-1">{effect.name}</span>
                  <span className="text-xs text-neutral-400 line-clamp-2">
                    {effect.description}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}