import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import SatelliteTracker from './components/SatelliteTracker';
import Earth3D from './components/Earth3D';
import TimeControls from './components/controls/TimeControls';
import FiltersPanel from './components/panels/FiltersPanel';
import SatellitePickerPanel from './components/panels/SatellitePickerPanel';
import SatelliteDetailsPanel from './components/panels/SatelliteDetailsPanel';
import AnalysisPanel from './components/panels/AnalysisPanel';
import useSimulationClock from './hooks/useSimulationClock';
import {
  getSatelliteCard,
  getSatelliteCoverage,
  getSatelliteFilters,
  getSatellitePositions,
  getSatellites,
  getSatelliteTrack,
  getSatelliteVisibility,
} from './api/satellites';
import { runCompareGroups, runPointPassAnalysis, runRegionPassAnalysis } from './api/analysis';
import { createSubscription, listSubscriptions } from './api/notifications';

const INITIAL_FILTERS = { country: '', operator: '', orbit_type: '', purpose: '', search: '' };

function sanitizeFilters(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
}

function formatApiError(error, fallbackMessage) {
  return error?.response?.data?.detail || error?.message || fallbackMessage;
}

function App() {
  const [activeView, setActiveView] = useState('2d');
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ countries: [], operators: [], orbit_types: [], purposes: [] });
  const [satellitesMeta, setSatellitesMeta] = useState([]);
  const [positions, setPositions] = useState([]);
  const [selectedSatelliteId, setSelectedSatelliteId] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [satelliteCard, setSatelliteCard] = useState(null);
  const [track, setTrack] = useState(null);
  const [visibilityFootprint, setVisibilityFootprint] = useState(null);
  const [coverageFootprint, setCoverageFootprint] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [pointAnalysisResult, setPointAnalysisResult] = useState(null);
  const [regionAnalysisResult, setRegionAnalysisResult] = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [loadingState, setLoadingState] = useState({ filters: false, metadata: false, positions: false, card: false, analysis: false, subscriptions: false });
  const [errorState, setErrorState] = useState({ positions: '', card: '', analysis: '' });

  const { currentTime, setCurrentTime, isPlaying, togglePlayback, speedMultiplier, setSpeedMultiplier, resetToNow } = useSimulationClock();

  useEffect(() => {
    let ignore = false;
    setLoadingState((prev) => ({ ...prev, filters: true }));
    getSatelliteFilters()
      .then((data) => { if (!ignore) setFilterOptions(data); })
      .catch((error) => { if (!ignore) setErrorState((prev) => ({ ...prev, analysis: formatApiError(error, 'Не удалось загрузить наборы фильтров.') })); })
      .finally(() => { if (!ignore) setLoadingState((prev) => ({ ...prev, filters: false })); });
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (activeView !== '3d') return undefined;
    let ignore = false;
    setLoadingState((prev) => ({ ...prev, metadata: true }));
    getSatellites(sanitizeFilters(filters))
      .then((data) => { if (!ignore) setSatellitesMeta(data.items || []); })
      .catch((error) => { if (!ignore) setErrorState((prev) => ({ ...prev, positions: formatApiError(error, 'Не удалось загрузить метаданные спутников.') })); })
      .finally(() => { if (!ignore) setLoadingState((prev) => ({ ...prev, metadata: false })); });
    return () => { ignore = true; };
  }, [activeView, filters]);

  useEffect(() => {
    if (activeView !== '3d') return undefined;
    let ignore = false;
    setLoadingState((prev) => ({ ...prev, positions: true }));
    setErrorState((prev) => ({ ...prev, positions: '' }));
    getSatellitePositions({ ...sanitizeFilters(filters), timestamp: currentTime.toISOString() })
      .then((data) => { if (!ignore) setPositions(data || []); })
      .catch((error) => { if (!ignore) setErrorState((prev) => ({ ...prev, positions: formatApiError(error, 'Не удалось загрузить текущие позиции спутников.') })); })
      .finally(() => { if (!ignore) setLoadingState((prev) => ({ ...prev, positions: false })); });
    return () => { ignore = true; };
  }, [activeView, currentTime, filters]);

  useEffect(() => {
    if (activeView !== '3d') return undefined;
    let ignore = false;
    setLoadingState((prev) => ({ ...prev, subscriptions: true }));
    listSubscriptions()
      .then((data) => { if (!ignore) setSubscriptions(data || []); })
      .catch(() => { if (!ignore) setSubscriptions([]); })
      .finally(() => { if (!ignore) setLoadingState((prev) => ({ ...prev, subscriptions: false })); });
    return () => { ignore = true; };
  }, [activeView]);

  useEffect(() => {
    if (!selectedSatelliteId || activeView !== '3d') {
      setSatelliteCard(null);
      setTrack(null);
      setVisibilityFootprint(null);
      setCoverageFootprint(null);
      setErrorState((prev) => ({ ...prev, card: '' }));
      return undefined;
    }

    let ignore = false;
    setLoadingState((prev) => ({ ...prev, card: true }));
    setErrorState((prev) => ({ ...prev, card: '' }));

    const pointParams = selectedPoint ? { point_lat: selectedPoint.lat, point_lon: selectedPoint.lon } : {};
    const startTime = new Date(currentTime.getTime() - 45 * 60 * 1000);
    const endTime = new Date(currentTime.getTime() + 90 * 60 * 1000);

    Promise.all([
      getSatelliteCard(selectedSatelliteId, { timestamp: currentTime.toISOString(), ...pointParams }),
      getSatelliteTrack(selectedSatelliteId, { start_time: startTime.toISOString(), end_time: endTime.toISOString(), step_seconds: 180 }),
      getSatelliteVisibility(selectedSatelliteId, { timestamp: currentTime.toISOString() }),
      getSatelliteCoverage(selectedSatelliteId, { timestamp: currentTime.toISOString() }),
    ])
      .then(([cardData, trackData, visibilityData, coverageData]) => {
        if (!ignore) {
          setSatelliteCard(cardData);
          setTrack(trackData);
          setVisibilityFootprint(visibilityData);
          setCoverageFootprint(coverageData);
        }
      })
      .catch((error) => { if (!ignore) setErrorState((prev) => ({ ...prev, card: formatApiError(error, 'Не удалось загрузить данные выбранного спутника.') })); })
      .finally(() => { if (!ignore) setLoadingState((prev) => ({ ...prev, card: false })); });

    return () => { ignore = true; };
  }, [activeView, currentTime, selectedPoint, selectedSatelliteId]);

  const metaById = useMemo(() => satellitesMeta.reduce((accumulator, item) => {
    accumulator[item.id] = item;
    return accumulator;
  }, {}), [satellitesMeta]);

  const satellitesFor3D = useMemo(() => positions.filter((item) => item.geodetic).map((item) => ({ ...item, meta: metaById[item.satellite_id] || null })), [metaById, positions]);

  useEffect(() => {
    if (!selectedSatelliteId) return;
    const stillVisible = satellitesFor3D.some((item) => item.satellite_id === selectedSatelliteId);
    if (!stillVisible) setSelectedSatelliteId(null);
  }, [satellitesFor3D, selectedSatelliteId]);

  const runPointAnalysis = async (payload) => {
    try {
      setLoadingState((prev) => ({ ...prev, analysis: true }));
      setErrorState((prev) => ({ ...prev, analysis: '' }));
      const data = await runPointPassAnalysis(payload);
      setPointAnalysisResult(data);
    } catch (error) {
      setErrorState((prev) => ({ ...prev, analysis: formatApiError(error, 'Не удалось выполнить анализ пролётов над точкой.') }));
    } finally {
      setLoadingState((prev) => ({ ...prev, analysis: false }));
    }
  };

  const runRegionAnalysis = async (payload) => {
    try {
      setLoadingState((prev) => ({ ...prev, analysis: true }));
      setErrorState((prev) => ({ ...prev, analysis: '' }));
      const data = await runRegionPassAnalysis(payload);
      setRegionAnalysisResult(data);
    } catch (error) {
      setErrorState((prev) => ({ ...prev, analysis: formatApiError(error, 'Не удалось выполнить анализ пролётов над регионом.') }));
    } finally {
      setLoadingState((prev) => ({ ...prev, analysis: false }));
    }
  };

  const runGroupCompare = async (payload) => {
    try {
      setLoadingState((prev) => ({ ...prev, analysis: true }));
      setErrorState((prev) => ({ ...prev, analysis: '' }));
      const data = await runCompareGroups(payload);
      setCompareResult(data);
    } catch (error) {
      setErrorState((prev) => ({ ...prev, analysis: formatApiError(error, 'Не удалось сравнить группировки.') }));
    } finally {
      setLoadingState((prev) => ({ ...prev, analysis: false }));
    }
  };

  const handleCreateSubscription = async (payload) => {
    try {
      setLoadingState((prev) => ({ ...prev, analysis: true }));
      setErrorState((prev) => ({ ...prev, analysis: '' }));
      const created = await createSubscription(payload);
      setSubscriptions((prev) => [created, ...prev]);
    } catch (error) {
      setErrorState((prev) => ({ ...prev, analysis: formatApiError(error, 'Не удалось создать подписку.') }));
    } finally {
      setLoadingState((prev) => ({ ...prev, analysis: false }));
    }
  };

  const hasNo3DData = activeView === '3d' && !loadingState.positions && satellitesFor3D.length === 0;

  return (
    <div className="app-shell">
      <header className="app-header-bar">
        <div className="brand-block">
          <div className="brand-mark">🛰️</div>
          <div>
            <p className="eyebrow">Хакатон MVP</p>
            <h1>Платформа мониторинга пролётов спутников</h1>
          </div>
        </div>

        <div className="mode-toggle" role="tablist" aria-label="Переключатель режима отображения">
          <button type="button" className={activeView === '2d' ? 'toggle-button toggle-active' : 'toggle-button'} onClick={() => setActiveView('2d')}>2D-карта</button>
          <button type="button" className={activeView === '3d' ? 'toggle-button toggle-active' : 'toggle-button'} onClick={() => setActiveView('3d')}>3D-глобус</button>
        </div>
      </header>

      <main className="app-content">
        {activeView === '2d' ? (
          <div className="view-layer view-layer-2d">
            <SatelliteTracker />
            <div className="floating-note left-note">
              <strong>2D-режим сохранён</strong>
              <p>Существующая Leaflet-реализация не переписывалась. Добавлены только общая оболочка приложения и переключатель режимов.</p>
            </div>
          </div>
        ) : (
          <div className="view-layer view-layer-3d">
            <Earth3D satellites={satellitesFor3D} selectedSatelliteId={selectedSatelliteId} onSelectSatellite={setSelectedSatelliteId} onSelectPoint={setSelectedPoint} selectedPoint={selectedPoint} track={track} visibilityFootprint={visibilityFootprint} coverageFootprint={coverageFootprint} />
            <aside className="side-panel left-panel">
              <TimeControls currentTime={currentTime} setCurrentTime={setCurrentTime} isPlaying={isPlaying} togglePlayback={togglePlayback} speedMultiplier={speedMultiplier} setSpeedMultiplier={setSpeedMultiplier} resetToNow={resetToNow} />
              <FiltersPanel filters={filters} onFiltersChange={setFilters} filterOptions={filterOptions} positionsCount={satellitesFor3D.length} />
              <SatellitePickerPanel satellites={satellitesFor3D} selectedSatelliteId={selectedSatelliteId} onSelectSatellite={setSelectedSatelliteId} />
            </aside>
            <aside className="side-panel right-panel">
              <SatelliteDetailsPanel satelliteCard={satelliteCard} selectedPoint={selectedPoint} loading={loadingState.card} error={errorState.card} />
              <AnalysisPanel currentTime={currentTime} selectedPoint={selectedPoint} selectedSatelliteId={selectedSatelliteId} activeFilters={sanitizeFilters(filters)} onRunPointAnalysis={runPointAnalysis} onRunRegionAnalysis={runRegionAnalysis} onRunCompareGroups={runGroupCompare} onCreateSubscription={handleCreateSubscription} subscriptions={subscriptions} filterOptions={filterOptions} results={{ point: pointAnalysisResult, region: regionAnalysisResult, compare: compareResult }} loading={loadingState.analysis || loadingState.subscriptions} error={errorState.analysis} />
            </aside>
            <div className="floating-note bottom-note">
              <div>
                <strong>3D-режим</strong>
                <p>Оранжевая линия — трек, зелёная — радиовидимость, фиолетовая — покрытие. Точка на Земле ставится только левым кликом.</p>
              </div>
              {loadingState.positions ? <span className="status-pill">Обновляем позиции…</span> : null}
            </div>
            {errorState.positions ? <div className="floating-error">{errorState.positions}</div> : null}
            {hasNo3DData ? (
              <div className="empty-state-overlay">
                <h2>По текущим фильтрам спутники не найдены</h2>
                <p>Сбросьте фильтры или проверьте, что backend запущен и в нём есть загруженные TLE-данные.</p>
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
