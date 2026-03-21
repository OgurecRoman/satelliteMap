import React, { useEffect, useState } from 'react';
import { formatDateTimeLocalInput, formatTimestamp, parseDateTimeLocalInput } from '../../utils/time';
const SPEED_OPTIONS = [1, 10, 60];
export default function TimeControls({ currentTime, setCurrentTime, isPlaying, togglePlayback, speedMultiplier, setSpeedMultiplier, resetToNow }) {
  const [inputValue, setInputValue] = useState(formatDateTimeLocalInput(currentTime));
  useEffect(() => { setInputValue(formatDateTimeLocalInput(currentTime)); }, [currentTime]);
  const applyCustomTime = () => { const parsed = parseDateTimeLocalInput(inputValue); if (parsed) setCurrentTime(parsed); };
  return <section className="panel-section"><div className="section-header"><h3>Время симуляции</h3><span className="status-pill">{isPlaying ? 'Воспроизведение' : 'Пауза'}</span></div><div className="time-display">{formatTimestamp(currentTime)}</div><div className="button-row"><button type="button" className="primary-button" onClick={togglePlayback}>{isPlaying ? 'Пауза' : 'Пуск'}</button><button type="button" className="secondary-button" onClick={resetToNow}>Сейчас</button></div><div className="speed-selector">{SPEED_OPTIONS.map((speed) => <button type="button" key={speed} className={speedMultiplier === speed ? 'chip chip-active' : 'chip'} onClick={() => setSpeedMultiplier(speed)}>×{speed}</button>)}</div><label className="field-label" htmlFor="custom-time-input">Пользовательская дата и время</label><div className="inline-form"><input id="custom-time-input" style={{ width: '60%' }} type="datetime-local" value={inputValue} onChange={(event) => setInputValue(event.target.value)} /><button type="button" className="secondary-button" style={{ marginRight: '8px' }} onClick={applyCustomTime}>Применить</button></div></section>;
}
