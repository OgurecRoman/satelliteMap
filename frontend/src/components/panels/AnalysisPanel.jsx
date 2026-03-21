import React, { useEffect, useState } from 'react';
import { formatCoordinate } from '../../utils/coordinates';
import { formatTimestamp } from '../../utils/time';

const DEFAULT_REGION = { min_lat: 50, min_lon: 30, max_lat: 60, max_lon: 40 };
const DEFAULT_GROUP_A = { name: 'Group A', country: '', operator: '', orbit_type: 'LEO', purpose: '' };
const DEFAULT_GROUP_B = { name: 'Group B', country: '', operator: '', orbit_type: '', purpose: 'Earth observation' };

export default function AnalysisPanel({
  currentTime,
  selectedPoint,
  selectedSatelliteId,
  activeFilters,
  onRunPointAnalysis,
  onRunRegionAnalysis,
  onRunCompareGroups,
  onCreateSubscription,
  subscriptions,
  filterOptions,
  results,
  loading,
  error,
}) {
  const [pointForm, setPointForm] = useState({ lat: 55.75, lon: 37.62, horizon_hours: 24, step_seconds: 300 });
  const [regionForm, setRegionForm] = useState({ ...DEFAULT_REGION, horizon_hours: 24, step_seconds: 600 });
  const [groupA, setGroupA] = useState(DEFAULT_GROUP_A);
  const [groupB, setGroupB] = useState(DEFAULT_GROUP_B);
  const [subscriptionForm, setSubscriptionForm] = useState({
    name: 'Pass alert',
    target_type: 'point',
    contact_email: '',
    note: '',
    horizon_hours: 24,
    step_seconds: 300,
  });

  useEffect(() => {
    if (selectedPoint) {
      setPointForm((prev) => ({
        ...prev,
        lat: Number(selectedPoint.lat.toFixed(4)),
        lon: Number(selectedPoint.lon.toFixed(4)),
      }));
    }
  }, [selectedPoint]);

  const pointValues = { lat: pointForm.lat, lon: pointForm.lon };

  const buildFilters = (group) => {
    return Object.fromEntries(
      Object.entries({
        country: group.country,
        operator: group.operator,
        orbit_type: group.orbit_type,
        purpose: group.purpose,
      }).filter(([, value]) => value)
    );
  };

  const submitPointAnalysis = () => {
    onRunPointAnalysis({
      lat: Number(pointValues.lat),
      lon: Number(pointValues.lon),
      from_time: currentTime.toISOString(),
      horizon_hours: Number(pointForm.horizon_hours),
      step_seconds: Number(pointForm.step_seconds),
      filters: activeFilters,
    });
  };

  const submitRegionAnalysis = () => {
    onRunRegionAnalysis({
      region: {
        type: 'bbox',
        min_lat: Number(regionForm.min_lat),
        min_lon: Number(regionForm.min_lon),
        max_lat: Number(regionForm.max_lat),
        max_lon: Number(regionForm.max_lon),
      },
      from_time: currentTime.toISOString(),
      horizon_hours: Number(regionForm.horizon_hours),
      step_seconds: Number(regionForm.step_seconds),
      filters: activeFilters,
    });
  };

  const submitCompareGroups = () => {
    onRunCompareGroups({
      groups: [
        { name: groupA.name || 'Group A', filters: buildFilters(groupA) },
        { name: groupB.name || 'Group B', filters: buildFilters(groupB) },
      ],
    });
  };

  const submitSubscription = () => {
    const payload = {
      name: subscriptionForm.name,
      target_type: subscriptionForm.target_type,
      satellite_id: selectedSatelliteId || null,
      contact_email: subscriptionForm.contact_email || null,
      note: subscriptionForm.note || null,
      horizon_hours: Number(subscriptionForm.horizon_hours),
      step_seconds: Number(subscriptionForm.step_seconds),
      filters: activeFilters,
    };

    if (subscriptionForm.target_type === 'point') {
      payload.point_lat = Number(pointValues.lat);
      payload.point_lon = Number(pointValues.lon);
    } else {
      payload.region = {
        type: 'bbox',
        min_lat: Number(regionForm.min_lat),
        min_lon: Number(regionForm.min_lon),
        max_lat: Number(regionForm.max_lat),
        max_lon: Number(regionForm.max_lon),
      };
    }

    onCreateSubscription(payload);
  };

  return (
    <section className="panel-section">
      <div className="section-header">
        <h3>Analytics & alerts</h3>
        {loading ? <span className="status-pill">Working…</span> : null}
      </div>
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="stack-card">
        <h4>Point pass analysis</h4>
        <p className="muted-text">Use the point selected on the globe or override the coordinates below.</p>
        <div className="field-grid two-columns">
          <div>
            <label className="field-label">Latitude</label>
            <input type="number" value={pointValues.lat} onChange={(event) => setPointForm((prev) => ({ ...prev, lat: event.target.value }))} />
          </div>
          <div>
            <label className="field-label">Longitude</label>
            <input type="number" value={pointValues.lon} onChange={(event) => setPointForm((prev) => ({ ...prev, lon: event.target.value }))} />
          </div>
          <div>
            <label className="field-label">Horizon (hours)</label>
            <input type="number" value={pointForm.horizon_hours} onChange={(event) => setPointForm((prev) => ({ ...prev, horizon_hours: event.target.value }))} />
          </div>
          <div>
            <label className="field-label">Step (sec)</label>
            <input type="number" value={pointForm.step_seconds} onChange={(event) => setPointForm((prev) => ({ ...prev, step_seconds: event.target.value }))} />
          </div>
        </div>
        <button type="button" className="primary-button full-width" onClick={submitPointAnalysis}>Run point analysis</button>
        {results.point ? (
          <div className="result-box">
            <strong>{results.point.matches.length}</strong> matches found
            <div className="result-list">
              {results.point.matches.slice(0, 5).map((item) => (
                <div key={`${item.satellite.id}-${item.next_pass.enter_time}`} className="result-item">
                  <div>
                    <strong>{item.satellite.name}</strong>
                    <p>{item.satellite.operator}</p>
                  </div>
                  <div>
                    <p>{formatTimestamp(item.next_pass.enter_time)}</p>
                    <p className="muted-text">Min distance {formatCoordinate(item.next_pass.min_distance_km)} km</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="stack-card">
        <h4>Region pass analysis</h4>
        <div className="field-grid two-columns">
          {Object.keys(DEFAULT_REGION).map((key) => (
            <div key={key}>
              <label className="field-label">{key.replace('_', ' ')}</label>
              <input type="number" value={regionForm[key]} onChange={(event) => setRegionForm((prev) => ({ ...prev, [key]: event.target.value }))} />
            </div>
          ))}
          <div>
            <label className="field-label">Horizon (hours)</label>
            <input type="number" value={regionForm.horizon_hours} onChange={(event) => setRegionForm((prev) => ({ ...prev, horizon_hours: event.target.value }))} />
          </div>
          <div>
            <label className="field-label">Step (sec)</label>
            <input type="number" value={regionForm.step_seconds} onChange={(event) => setRegionForm((prev) => ({ ...prev, step_seconds: event.target.value }))} />
          </div>
        </div>
        <button type="button" className="secondary-button full-width" onClick={submitRegionAnalysis}>Run region analysis</button>
        {results.region ? <div className="result-box"><strong>{results.region.matches.length}</strong> satellites intersect the region</div> : null}
      </div>

      <div className="stack-card">
        <h4>Compare groups</h4>
        <div className="field-grid two-columns">
          <GroupEditor title="Group A" value={groupA} onChange={setGroupA} filterOptions={filterOptions} />
          <GroupEditor title="Group B" value={groupB} onChange={setGroupB} filterOptions={filterOptions} />
        </div>
        <button type="button" className="secondary-button full-width" onClick={submitCompareGroups}>Compare groups</button>
        {results.compare ? (
          <div className="result-list">
            {results.compare.groups.map((group) => (
              <div key={group.name} className="result-item compact">
                <div>
                  <strong>{group.name}</strong>
                  <p>{group.count} satellites</p>
                </div>
                <div>
                  <p>Avg alt {formatCoordinate(group.avg_altitude_km)} km</p>
                  <p className="muted-text">Avg period {formatCoordinate(group.avg_period_minutes)} min</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="stack-card">
        <h4>Subscriptions</h4>
        <div className="field-grid two-columns">
          <div>
            <label className="field-label">Name</label>
            <input type="text" value={subscriptionForm.name} onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, name: event.target.value }))} />
          </div>
          <div>
            <label className="field-label">Target type</label>
            <select value={subscriptionForm.target_type} onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, target_type: event.target.value }))}>
              <option value="point">Point</option>
              <option value="region">Region</option>
            </select>
          </div>
          <div>
            <label className="field-label">Contact email</label>
            <input type="email" value={subscriptionForm.contact_email} onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, contact_email: event.target.value }))} />
          </div>
          <div>
            <label className="field-label">Selected satellite</label>
            <input type="text" value={selectedSatelliteId || 'Any'} readOnly />
          </div>
        </div>
        <label className="field-label">Note</label>
        <textarea value={subscriptionForm.note} rows={2} onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, note: event.target.value }))} />
        <button type="button" className="primary-button full-width" onClick={submitSubscription}>Create subscription</button>
        <div className="result-box">
          <strong>{subscriptions.length}</strong> saved subscriptions
          <div className="result-list">
            {subscriptions.slice(0, 5).map((item) => (
              <div key={item.id} className="result-item compact">
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.target_type}</p>
                </div>
                <div>
                  <p>{item.is_active ? 'Active' : 'Inactive'}</p>
                  <p className="muted-text">{item.contact_email || 'No email'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GroupEditor({ title, value, onChange, filterOptions }) {
  const update = (key, nextValue) => onChange((prev) => ({ ...prev, [key]: nextValue }));

  return (
    <div className="info-card compact-card">
      <h5>{title}</h5>
      <label className="field-label">Name</label>
      <input type="text" value={value.name} onChange={(event) => update('name', event.target.value)} />
      <label className="field-label">Country</label>
      <select value={value.country} onChange={(event) => update('country', event.target.value)}>
        <option value="">Any</option>
        {(filterOptions.countries || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <label className="field-label">Operator</label>
      <select value={value.operator} onChange={(event) => update('operator', event.target.value)}>
        <option value="">Any</option>
        {(filterOptions.operators || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <label className="field-label">Orbit</label>
      <select value={value.orbit_type} onChange={(event) => update('orbit_type', event.target.value)}>
        <option value="">Any</option>
        {(filterOptions.orbit_types || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <label className="field-label">Purpose</label>
      <select value={value.purpose} onChange={(event) => update('purpose', event.target.value)}>
        <option value="">Any</option>
        {(filterOptions.purposes || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}
