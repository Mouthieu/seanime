import { MKVParser_TrackInfo } from "@/api/generated/types"
import { nativePlayer_stateAtom } from "@/app/(main)/_features/native-player/native-player.atoms"
import { vc_audioManager } from "@/app/(main)/_features/video-core/video-core"

import { vc_isFullscreen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_miniPlayer } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_videoElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_containerElement } from "@/app/(main)/_features/video-core/video-core-atoms"
// Import de ton nouvel atome pour l'effet audio
import { vc_selectedAudioEffect } from "@/app/(main)/_features/video-core/video-core-atoms" 
// Import de ton registre d'effets audio
import { AUDIO_EFFECTS_REGISTRY } from "@/app/(main)/_features/video-core/video-core-audio-effects" 

import { VideoCoreControlButtonIcon } from "@/app/(main)/_features/video-core/video-core-control-bar"
import { HlsAudioTrack, vc_hlsAudioTracks, vc_hlsCurrentAudioTrack } from "@/app/(main)/_features/video-core/video-core-hls"
import { VideoCoreMenu, VideoCoreMenuBody, VideoCoreMenuTitle, VideoCoreSettingSelect } from "@/app/(main)/_features/video-core/video-core-menu"
import { vc_dispatchAction } from "@/app/(main)/_features/video-core/video-core.utils"
import { useAtomValue, useAtom } from "jotai" // Ajout de useAtom pour lire/écrire l'effet
import { useSetAtom } from "jotai/react"
import React from "react"
import { LuHeadphones } from "react-icons/lu"

export function VideoCoreAudioMenu() {
    const action = useSetAtom(vc_dispatchAction)
    const isMiniPlayer = useAtomValue(vc_miniPlayer)
    const state = useAtomValue(nativePlayer_stateAtom)
    const audioManager = useAtomValue(vc_audioManager)
    const videoElement = useAtomValue(vc_videoElement)
    const isFullscreen = useAtomValue(vc_isFullscreen)
    const containerElement = useAtomValue(vc_containerElement)
    const [selectedTrack, setSelectedTrack] = React.useState<number | null>(null)
    
    // Branchement de ton état d'effet audio
    const [selectedEffect, setSelectedEffect] = useAtom(vc_selectedAudioEffect)

    // Get MKV audio tracks
    const mkvAudioTracks = state.playbackInfo?.mkvMetadata?.audioTracks

    // Get HLS audio tracks
    const hlsAudioTracks = useAtomValue(vc_hlsAudioTracks)
    const hlsCurrentAudioTrack = useAtomValue(vc_hlsCurrentAudioTrack)

    // Determine which audio tracks to use
    const audioTracks = mkvAudioTracks || (hlsAudioTracks.length > 0 ? hlsAudioTracks : null)
    const isHls = !mkvAudioTracks && hlsAudioTracks.length > 0

    function onAudioChange() {
        setSelectedTrack(audioManager?.getSelectedTrackNumberOrNull?.() ?? null)
    }

    React.useEffect(() => {
        if (!videoElement || !audioManager) return

        videoElement?.audioTracks?.addEventListener?.("change", onAudioChange)
        return () => {
            videoElement?.audioTracks?.removeEventListener?.("change", onAudioChange)
        }
    }, [videoElement, audioManager])

    React.useEffect(() => {
        onAudioChange()
    }, [audioManager])

    // Update selected track when HLS audio track changes
    React.useEffect(() => {
        if (isHls && hlsCurrentAudioTrack !== -1) {
            setSelectedTrack(hlsCurrentAudioTrack)
        }
    }, [hlsCurrentAudioTrack, isHls])

    // CORRECTION ICI : On ne bloque plus si audioTracks.length === 1 pour permettre le choix des effets
    if (isMiniPlayer) return null

    return (
        <VideoCoreMenu
            name="audio"
            trigger={<VideoCoreControlButtonIcon
                icons={[
                    ["default", LuHeadphones],
                ]}
                state="default"
                className="text-2xl"
                onClick={() => {}}
            />}
        >
            <VideoCoreMenuTitle>Audio</VideoCoreMenuTitle>
            <VideoCoreMenuBody>
                {/* 1. SELECTION DE LA PISTE AUDIO (Affichée uniquement s'il y a plusieurs pistes) */}
                {audioTracks && audioTracks.length > 1 && (
                    <div className="flex flex-col gap-1.5 mb-4">
                        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-1">
                            Pistes Audio
                        </span>
                        <VideoCoreSettingSelect
                            isFullscreen={isFullscreen}
                            containerElement={containerElement}
                            options={audioTracks.map(track => {
                                if (isHls) {
                                    const hlsTrack = track as HlsAudioTrack
                                    return {
                                        label: hlsTrack.name || hlsTrack.language?.toUpperCase() || `Track ${hlsTrack.id + 1}`,
                                        value: hlsTrack.id,
                                        moreInfo: hlsTrack.language?.toUpperCase(),
                                    }
                                } else {
                                    const eventTrack = track as MKVParser_TrackInfo
                                    return {
                                        label: `${eventTrack.name || eventTrack.language?.toUpperCase() || eventTrack.languageIETF?.toUpperCase()}`,
                                        value: eventTrack.number,
                                        moreInfo: eventTrack.language?.toUpperCase(),
                                    }
                                }
                            })}
                            onValueChange={(value: number) => {
                                audioManager?.selectTrack(value)
                                action({ type: "seek", payload: { time: -1 } })
                            }}
                            value={selectedTrack || 0}
                        />
                    </div>
                )}

                {/* 2. SELECTION DE L'EFFET AUDIO (Toujours disponible) */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-1">
                        Effets Audio
                    </span>
                    <VideoCoreSettingSelect
                        isFullscreen={isFullscreen}
                        containerElement={containerElement}
                        options={Object.values(AUDIO_EFFECTS_REGISTRY).map(effect => ({
                            label: effect.name,
                            value: effect.id, // Transmis sous forme de string
                            moreInfo: effect.description,
                        }))}
                        onValueChange={(value: any) => {
                            setSelectedEffect(value)
                        }}
                        value={selectedEffect}
                    />
                </div>
            </VideoCoreMenuBody>
        </VideoCoreMenu>
    )
}