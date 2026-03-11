/**
 * useNetworkQuality — Monitor WebRTC connection quality via RTCPeerConnection stats.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CONNECTION_QUALITY } from "../utils/constants";

const useNetworkQuality = (connectionsRef) => {
  const [quality, setQuality] = useState(CONNECTION_QUALITY.GOOD);
  const [stats, setStats] = useState({
    rtt: 0,
    packetLoss: 0,
    bandwidth: 0,
  });
  const intervalRef = useRef(null);

  const measureQuality = useCallback(async () => {
    const connections = connectionsRef?.current;
    if (!connections || connections.size === 0) {
      setQuality(CONNECTION_QUALITY.GOOD);
      return;
    }

    let totalRtt = 0;
    let rttCount = 0;
    let totalPacketsLost = 0;
    let totalPacketsReceived = 0;
    let totalBandwidth = 0;

    for (const pc of connections.values()) {
      if (pc.connectionState !== "connected") continue;

      try {
        const report = await pc.getStats();
        report.forEach((stat) => {
          if (stat.type === "candidate-pair" && stat.state === "succeeded") {
            totalRtt += stat.currentRoundTripTime || 0;
            rttCount++;
          }
          if (stat.type === "inbound-rtp" && stat.kind === "video") {
            totalPacketsLost += stat.packetsLost || 0;
            totalPacketsReceived += stat.packetsReceived || 0;
            totalBandwidth += stat.bytesReceived || 0;
          }
        });
      } catch {
        // Stats may not be available
      }
    }

    if (rttCount === 0) return;

    const avgRtt = (totalRtt / rttCount) * 1000; // Convert to ms
    const totalPackets = totalPacketsLost + totalPacketsReceived;
    const lossPercent =
      totalPackets > 0 ? (totalPacketsLost / totalPackets) * 100 : 0;

    setStats({
      rtt: Math.round(avgRtt),
      packetLoss: Math.round(lossPercent * 10) / 10,
      bandwidth: totalBandwidth,
    });

    // Classify quality
    if (avgRtt < 100 && lossPercent < 2) {
      setQuality(CONNECTION_QUALITY.EXCELLENT);
    } else if (avgRtt < 200 && lossPercent < 5) {
      setQuality(CONNECTION_QUALITY.GOOD);
    } else if (avgRtt < 400 && lossPercent < 10) {
      setQuality(CONNECTION_QUALITY.FAIR);
    } else {
      setQuality(CONNECTION_QUALITY.POOR);
    }
  }, [connectionsRef]);

  useEffect(() => {
    intervalRef.current = setInterval(measureQuality, 5000);
    return () => clearInterval(intervalRef.current);
  }, [measureQuality]);

  return { quality, stats };
};

export default useNetworkQuality;
