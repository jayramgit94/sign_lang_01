/**
 * useMediaDevices — Enumerate and manage media devices.
 */
import { useCallback, useEffect, useState } from "react";

const useMediaDevices = () => {
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState("");
  const [selectedAudioInput, setSelectedAudioInput] = useState("");
  const [selectedAudioOutput, setSelectedAudioOutput] = useState("");
  const [permissionsGranted, setPermissionsGranted] = useState(false);

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      setVideoDevices(devices.filter((d) => d.kind === "videoinput"));
      setAudioInputDevices(devices.filter((d) => d.kind === "audioinput"));
      setAudioOutputDevices(devices.filter((d) => d.kind === "audiooutput"));
      setPermissionsGranted(true);
    } catch (err) {
      console.error("[MediaDevices] Enumeration failed:", err);
    }
  }, []);

  // Request permissions and enumerate
  const requestPermissions = useCallback(async () => {
    try {
      // Request a stream just to get permission, then stop it
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.getTracks().forEach((t) => t.stop());
      await enumerateDevices();
      return true;
    } catch (err) {
      console.error("[MediaDevices] Permission denied:", err);
      return false;
    }
  }, [enumerateDevices]);

  // Listen for device changes (e.g., plug/unplug webcam)
  useEffect(() => {
    navigator.mediaDevices?.addEventListener("devicechange", enumerateDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        enumerateDevices,
      );
    };
  }, [enumerateDevices]);

  return {
    videoDevices,
    audioInputDevices,
    audioOutputDevices,
    selectedVideoDevice,
    selectedAudioInput,
    selectedAudioOutput,
    setSelectedVideoDevice,
    setSelectedAudioInput,
    setSelectedAudioOutput,
    permissionsGranted,
    requestPermissions,
    enumerateDevices,
  };
};

export default useMediaDevices;
