import React from 'react';
import { formatCoordinate } from '../../utils/coordinates';
import { formatTimestamp } from '../../utils/time';

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

export default function SatelliteDetailsPanel({ satelliteCard, selectedPoint, loading, error }) {
  if (!satelliteCard) {
    return (
      <section className="panel-section">
        <div className="section-header"><h3>Satellite card</h3></div>
        <p className="muted-text">Click a satellite in 3D mode to load its card, track, footprint and next pass data.</p>
      </section>
    );
  }

  const { current_position: position, next_pass_over_point: nextPass } = satelliteCard;

  return (
    <section className="panel-section">
      <div className="section-header">
        <h3>Satellite card</h3>
        {loading ? <span className="status-pill">Loading…</span> : null}
      </div>
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="satellite-title-block">
        <h2>{satelliteCard.name}</h2>
        <p>NORAD {satelliteCard.norad_id}</p>
      </div>

      <div className="detail-grid">
        <DetailRow label="Country" value={satelliteCard.country} />
        <DetailRow label="Operator" value={satelliteCard.operator} />
        <DetailRow label="Orbit" value={satelliteCard.orbit_type} />
        <DetailRow label="Purpose" value={satelliteCard.purpose} />
        <DetailRow label="Altitude" value={satelliteCard.approx_altitude_km ? `${satelliteCard.approx_altitude_km} km` : '—'} />
        <DetailRow label="Period" value={satelliteCard.period_minutes ? `${satelliteCard.period_minutes} min` : '—'} />
        <DetailRow label="Speed" value={`${formatCoordinate(position?.velocity?.speed_km_s)} km/s`} />
        <DetailRow label="TLE epoch" value={satelliteCard.latest_tle_epoch ? formatTimestamp(satelliteCard.latest_tle_epoch) : '—'} />
      </div>

      {position?.geodetic ? (
        <div className="info-card compact-card">
          <h4>Current coordinates</h4>
          <p>Lat {formatCoordinate(position.geodetic.lat)}°, Lon {formatCoordinate(position.geodetic.lon)}°, Alt {formatCoordinate(position.geodetic.alt_km)} km</p>
          <p className="muted-text">Timestamp: {formatTimestamp(position.timestamp)}</p>
        </div>
      ) : null}

      <div className="info-card compact-card">
        <h4>Next pass over selected point</h4>
        {selectedPoint && nextPass ? (
          <>
            <p>Point: {formatCoordinate(selectedPoint.lat)}°, {formatCoordinate(selectedPoint.lon)}°</p>
            <p>Enter: {formatTimestamp(nextPass.enter_time)}</p>
            <p>Peak: {formatTimestamp(nextPass.peak_time)}</p>
            <p>Exit: {formatTimestamp(nextPass.exit_time)}</p>
            <p>Min distance: {formatCoordinate(nextPass.min_distance_km)} km</p>
          </>
        ) : (
          <p className="muted-text">Select a point on the globe to request next-pass information.</p>
        )}
      </div>
    </section>
  );
}
