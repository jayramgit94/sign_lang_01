/**
 * useAudioLevel — UI-only audio level meter for active-speaker highlighting.
 */
import { useEffect, useRef, useState } from "react";

const SPEAKING_THRESHOLD = 0.07;
const SMOOTHING = 0.82;
const NOTIFY_INTERVAL_MS = 120;

let sharedAudioContext = null;

const getSharedAudioContext = () => {
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContext();
  }
  return sharedAudioContext;
};

export default function useAudioLevel(
  stream,
  enabled = true,
  tileId = null,
  onLevelChange = null,
) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const levelRef = useRef(0);
  const speakingRef = useRef(false);
  const onLevelChangeRef = useRef(onLevelChange);

  useEffect(() => {
    onLevelChangeRef.current = onLevelChange;
  }, [onLevelChange]);

  useEffect(() => {
    let cancelled = false;
    let rafId;
    let source;
    let analyser;
    let lastNotify = 0;

    const setSpeaking = (value) => {
      if (speakingRef.current === value) return;
      speakingRef.current = value;
      setIsSpeaking(value);
    };

    const scheduleSpeaking = (value) => {
      rafId = requestAnimationFrame(() => {
        if (!cancelled) setSpeaking(value);
      });
    };

    const notifyLevel = (level) => {
      if (!tileId || !onLevelChangeRef.current) return;
      const now = performance.now();
      if (now - lastNotify < NOTIFY_INTERVAL_MS) return;
      lastNotify = now;
      onLevelChangeRef.current(tileId, level);
    };

    if (!enabled || !stream) {
      levelRef.current = 0;
      scheduleSpeaking(false);
      notifyLevel(0);
      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
      };
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack?.enabled) {
      levelRef.current = 0;
      scheduleSpeaking(false);
      notifyLevel(0);
      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
      };
    }

    const start = async () => {
      try {
        const audioContext = getSharedAudioContext();
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.65;
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) sum += data[i];
          const instant = sum / data.length / 255;
          levelRef.current =
            levelRef.current * SMOOTHING + instant * (1 - SMOOTHING);
          setSpeaking(levelRef.current > SPEAKING_THRESHOLD);
          notifyLevel(levelRef.current);
          rafId = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        scheduleSpeaking(false);
        notifyLevel(0);
      }
    };

    start();

    const onEnded = () => {
      scheduleSpeaking(false);
      notifyLevel(0);
    };
    audioTrack.addEventListener("ended", onEnded);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      audioTrack.removeEventListener("ended", onEnded);
      source?.disconnect();
      analyser?.disconnect();
      notifyLevel(0);
    };
  }, [stream, enabled, tileId]);

  return isSpeaking;
}
