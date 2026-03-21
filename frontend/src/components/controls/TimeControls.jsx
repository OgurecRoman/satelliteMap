import React, { useEffect, useState } from 'react';
import { formatDateTimeLocalInput, formatTimestamp, parseDateTimeLocalInput } from '../../utils/time';

const SPEED_OPTIONS = [1, 10, 60, 300];

export default function TimeControls({
  currentTime,
  setCurrentTime,
  isPlaying,
  togglePlayback,
  speedMultiplier,
  setSpeedMultiplier,
  resetToNow,
}) {
  const [inputValue, setInputValue] = useState(formatDateTimeLocalInput(currentTime));

  useEffect(() => {
    setInputValue(formatDateTimeLocalInput(currentTime));
  }, [currentTime]);

  const applyCustomTime = () => {
    const parsed = parseDateTimeLocalInput(inputValue);
    if (parsed) {
      setCurrentTime(parsed);
    }
  };

  return (
    <section className="panel-section">
      <div className="section-header">
        <h3>Simulation time</h3>
        <span className="status-pill">{isPlaying ? 'Live playback' : 'Paused'}</span>
      </div>

      <div className="time-display">{formatTimestamp(currentTime)}</div>

      <div className="button-row">
        <button type="button" className="primary-button" onClick={togglePlayback}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="secondary-button" onClick={resetToNow}>
          Now
        </button>
      </div>

      <div className="speed-selector">
        {SPEED_OPTIONS.map((speed) => (
          <button
            type="button"
            key={speed}
            className={speedMultiplier === speed ? 'chip chip-active' : 'chip'}
            onClick={() => setSpeedMultiplier(speed)}
          >
            ×{speed}
          </button>
        ))}
      </div>

      <label className="field-label" htmlFor="custom-time-input">
        Custom timestamp
      </label>
      <div className="inline-form">
        <input
          id="custom-time-input"
          type="datetime-local"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
        />
        <button type="button" className="secondary-button" onClick={applyCustomTime}>
          Apply
        </button>
      </div>
    </section>
  );
}
