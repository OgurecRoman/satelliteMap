import { useCallback, useEffect, useState } from 'react';

export default function useSimulationClock() {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(10);

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setCurrentTime((prev) => new Date(prev.getTime() + 1000 * speedMultiplier));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isPlaying, speedMultiplier]);

  const resetToNow = useCallback(() => {
    setCurrentTime(new Date());
  }, []);

  const togglePlayback = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  return {
    currentTime,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    togglePlayback,
    speedMultiplier,
    setSpeedMultiplier,
    resetToNow,
  };
}
