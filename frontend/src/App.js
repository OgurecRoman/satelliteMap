import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  getSatelliteTrack,
  getSatelliteVisibility,
} from './api/satellites';
import { runCompareGroups, runPointPassAnalysis, runRegionPassAnalysis } from './api/analysis';
import { createSubscription, listSubscriptions } from './api/notifications';

const INITIAL_FILTERS = { country: '', operator: '', orbit_type: '', purpose: '', search: '' };
const POSITION_REFRESH_SIM_MS = 90 * 1000;
const CARD_REFRESH_SIM_MS = 20 * 1000;
const SCRUB_REFRESH_DEBOUNCE_MS = 350;

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
  const [loadingState, setLoadingState] = useState({ filters: false, positions: false, card: false, analysis: false, subscriptions: false });
  const [errorState, setErrorState] = useState({ positions: '', card: '', analysis: '' });
  const [lastPositionsFetchTime, setLastPositionsFetchTime] = useState(null);
  const [lastCardFetchTime, setLastCardFetchTime] = useState(null);

  const positionsRequestIdRef = useRef(0);
  const cardRequestIdRef = useRef(0);

  const { currentTime, setCurrentTime, isPlaying, togglePlayback, speedMultiplier, setSpeedMultiplier, resetToNow } = useSimulationClock();
  const currentTimeRef = useRef(currentTime);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    let ignore = false;
    setLoadingState((prev) => ({ ...prev, filters: true }));
    getSatelliteFilters()
      .then((data) => { if (!ignore) setFilterOptions(data); })
      .catch((error) => { if (!ignore) setErrorState((prev) => ({ ...prev, analysis: formatApiError(error, 'Не удалось загрузить наборы фильтров.') })); })
      .finally(() => { if (!ignore) setLoadingState((prev) => ({ ...prev, filters: false })); });
    return () => { ignore = true; };
  }, []);

  const loadPositions = useCallback(async (timestamp) => {
    const requestId = ++positionsRequestIdRef.current;
    setLoadingState((prev) => ({ ...prev, positions: true }));
    setErrorState((prev) => ({ ...prev, positions: '' }));
    try {
      const data = await getSatellitePositions({ ...sanitizeFilters(filters), timestamp: timestamp.toISOString() });
      if (positionsRequestIdRef.current !== requestId) return;
      setPositions(data || []);
      setLastPositionsFetchTime(new Date(timestamp));
    } catch (error) {
      if (positionsRequestIdRef.current !== requestId) return;
      setErrorState((prev) => ({ ...prev, positions: formatApiError(error, 'Не удалось загрузить текущие позиции спутников.') }));
    } finally {
      if (positionsRequestIdRef.current === requestId) {
        setLoadingState((prev) => ({ ...prev, positions: false }));
      }
    }
  }, [filters]);

  useEffect(() => {
    if (activeView !== '3d') return;
    setLastPositionsFetchTime(null);
    loadPositions(currentTimeRef.current);
  }, [activeView, filters, loadPositions]);

  useEffect(() => {
    if (activeView !== '3d') return undefined;
    if (!lastPositionsFetchTime) return undefined;

    const driftMs = Math.abs(currentTime.getTime() - lastPositionsFetchTime.getTime());
    if (isPlaying) {
      if (!loadingState.positions && driftMs >= POSITION_REFRESH_SIM_MS) {
        loadPositions(currentTime);
      }
      return undefined;
    }

    if (driftMs < 5000) return undefined;
    const timer = window.setTimeout(() => {
      loadPositions(currentTime);
    }, SCRUB_REFRESH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [activeView, currentTime, isPlaying, lastPositionsFetchTime, loadPositions, loadingState.positions]);

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

  const loadSelectedSatelliteData = useCallback(async (timestamp) => {
    if (!selectedSatelliteId) return;

    const requestId = ++cardRequestIdRef.current;
    setLoadingState((prev) => ({ ...prev, card: true }));
    setErrorState((prev) => ({ ...prev, card: '' }));

    const pointParams = selectedPoint ? { point_lat: selectedPoint.lat, point_lon: selectedPoint.lon } : {};
    const startTime = new Date(timestamp.getTime() - 45 * 60 * 1000);
    const endTime = new Date(timestamp.getTime() + 90 * 60 * 1000);

    try {
      const [cardData, trackData, visibilityData, coverageData] = await Promise.all([
        getSatelliteCard(selectedSatelliteId, { timestamp: timestamp.toISOString(), ...pointParams }),
        getSatelliteTrack(selectedSatelliteId, { start_time: startTime.toISOString(), end_time: endTime.toISOString(), step_seconds: 60 }),
        getSatelliteVisibility(selectedSatelliteId, { timestamp: timestamp.toISOString() }),
        getSatelliteCoverage(selectedSatelliteId, { timestamp: timestamp.toISOString() }),
      ]);

      if (cardRequestIdRef.current !== requestId) return;
      setSatelliteCard(cardData);
      setTrack(trackData);
      setVisibilityFootprint(visibilityData);
      setCoverageFootprint(coverageData);
      setLastCardFetchTime(new Date(timestamp));
    } catch (error) {
      if (cardRequestIdRef.current !== requestId) return;
      setErrorState((prev) => ({ ...prev, card: formatApiError(error, 'Не удалось загрузить данные выбранного спутника.') }));
    } finally {
      if (cardRequestIdRef.current === requestId) {
        setLoadingState((prev) => ({ ...prev, card: false }));
      }
    }
  }, [selectedPoint, selectedSatelliteId]);

  useEffect(() => {
    if (!selectedSatelliteId || activeView !== '3d') {
      setSatelliteCard(null);
      setTrack(null);
      setVisibilityFootprint(null);
      setCoverageFootprint(null);
      setErrorState((prev) => ({ ...prev, card: '' }));
      setLastCardFetchTime(null);
      return;
    }

    setLastCardFetchTime(null);
    loadSelectedSatelliteData(currentTimeRef.current);
  }, [activeView, selectedSatelliteId, selectedPoint, loadSelectedSatelliteData]);

  useEffect(() => {
    if (activeView !== '3d' || !selectedSatelliteId || !lastCardFetchTime) return undefined;

    const driftMs = Math.abs(currentTime.getTime() - lastCardFetchTime.getTime());
    if (isPlaying) {
      if (!loadingState.card && driftMs >= CARD_REFRESH_SIM_MS) {
        loadSelectedSatelliteData(currentTime);
      }
      return undefined;
    }

    if (driftMs < 5000) return undefined;
    const timer = window.setTimeout(() => {
      loadSelectedSatelliteData(currentTime);
    }, SCRUB_REFRESH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [activeView, currentTime, isPlaying, lastCardFetchTime, loadSelectedSatelliteData, loadingState.card, selectedSatelliteId]);

  const satellitesFor3D = useMemo(() => positions.filter((item) => item.geodetic || item.ecef), [positions]);

  const selectedSatellitePreview = useMemo(() => {
    if (!selectedSatelliteId) return null;
    return satellitesFor3D.find((item) => item.satellite_id === selectedSatelliteId) || null;
  }, [satellitesFor3D, selectedSatelliteId]);

  const selectedSatelliteVisual = selectedSatellitePreview || satelliteCard?.current_position || null;

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
          </div>
        ) : (
          <div className="view-layer view-layer-3d">
            <Earth3D
              satellites={satellitesFor3D}
              currentTime={currentTime}
              isPlaying={isPlaying}
              speedMultiplier={speedMultiplier}
              selectedSatellite={selectedSatelliteVisual}
              selectedSatelliteId={selectedSatelliteId}
              onSelectSatellite={setSelectedSatelliteId}
              onSelectPoint={setSelectedPoint}
              selectedPoint={selectedPoint}
              track={track}
              visibilityFootprint={visibilityFootprint}
              coverageFootprint={coverageFootprint}
            />
            <aside className="side-panel left-panel">
              <TimeControls currentTime={currentTime} setCurrentTime={setCurrentTime} isPlaying={isPlaying} togglePlayback={togglePlayback} speedMultiplier={speedMultiplier} setSpeedMultiplier={setSpeedMultiplier} resetToNow={resetToNow} />
              <FiltersPanel filters={filters} onFiltersChange={setFilters} filterOptions={filterOptions} positionsCount={satellitesFor3D.length} />
              <SatellitePickerPanel satellites={satellitesFor3D} selectedSatelliteId={selectedSatelliteId} onSelectSatellite={setSelectedSatelliteId} />
            </aside>
            <aside className="side-panel right-panel">
              <SatelliteDetailsPanel satelliteCard={satelliteCard} selectedPoint={selectedPoint} selectedSatellitePreview={selectedSatellitePreview} track={track} visibilityFootprint={visibilityFootprint} coverageFootprint={coverageFootprint} loading={loadingState.card} error={errorState.card} />
              <AnalysisPanel currentTime={currentTime} selectedPoint={selectedPoint} selectedSatelliteId={selectedSatelliteId} activeFilters={sanitizeFilters(filters)} onRunPointAnalysis={runPointAnalysis} onRunRegionAnalysis={runRegionAnalysis} onRunCompareGroups={runGroupCompare} onCreateSubscription={handleCreateSubscription} subscriptions={subscriptions} filterOptions={filterOptions} results={{ point: pointAnalysisResult, region: regionAnalysisResult, compare: compareResult }} loading={loadingState.analysis || loadingState.subscriptions} error={errorState.analysis} />
            </aside>
            <div className="floating-note bottom-note">
              <div>
                <strong>3D-режим</strong>
                <p>Оранжевая линия — трек, зелёная — радиовидимость, фиолетовая — покрытие. Сначала идёт выбор спутника, затем — постановка точки на Земле.</p>
              </div>
              {loadingState.positions ? <span className="status-pill">Обновляем опорные позиции…</span> : null}
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
