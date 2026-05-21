/**
 * Shared AudioContext to prevent latency when playing sounds.
 * Browsers require user interaction to resume the audio context,
 * but initializing it only once avoids the 100ms+ delay on each sound play.
 */

let sharedAudioContext: AudioContext | null = null;

export const getAudioContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;

    if (!sharedAudioContext) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
                sharedAudioContext = new AudioCtx();
            }
        } catch (e) {
            console.warn('AudioContext not supported or failed to initialize', e);
            return null;
        }
    }

    // Resume the context if it's suspended (e.g. browser autoplay policy)
    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume().catch(e => console.warn('Could not resume AudioContext', e));
    }

    return sharedAudioContext;
};
