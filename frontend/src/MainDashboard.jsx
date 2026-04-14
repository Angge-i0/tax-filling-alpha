import { useState, useEffect, useRef, useMemo } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { apiGet } from './api';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

/* ── Classification Colors ─────────────────────────────── */
const COMBO_MAP = {
  'AGRI': { hex: '#22c55e', label: 'AGRICULTURE' },
  'COMM': { hex: '#fbbf24', label: 'COMMERCIAL' },
  'INDUSTRIAL': { hex: '#3b82f6', label: 'INDUSTRIAL' },
  'RES': { hex: '#ef4444', label: 'RESIDENTIAL' },
  'AGRI_RES': { hex: '#a855f7', label: 'AGRI + RES' },
  'AGRI_COMM': { hex: '#a3e635', label: 'AGRI + COMM' },
  'AGRI_INDUSTRIAL': { hex: '#06b6d4', label: 'AGRI + INDUSTRIAL' },
  'COMM_RES': { hex: '#f97316', label: 'COMM + RES' },
  'COMM_INDUSTRIAL': { hex: '#ec4899', label: 'COMM + INDUSTRIAL' },
  'INDUSTRIAL_RES': { hex: '#94a3b8', label: 'INDUSTRIAL + RES' },
  'AGRI_COMM_RES': { hex: '#92400e', label: 'AGRI + COMM + RES' },
  'AGRI_COMM_INDUSTRIAL': { hex: '#0d9488', label: 'AGRI + COMM + INDUSTRIAL' },
  'AGRI_INDUSTRIAL_RES': { hex: '#7f1d1d', label: 'AGRI + INDUSTRIAL + RES' },
  'COMM_INDUSTRIAL_RES': { hex: '#eab308', label: 'COMM + INDUSTRIAL + RES' },
  'AGRI_COMM_INDUSTRIAL_RES': { hex: '#000000', label: 'MULTIPLE CLASSIFICATION' },
  'UNCLASSIFIED': { hex: '#ff00ff', label: 'UNCLASSIFIED / NO DATA' } 
};

function getLotComboKey(props) {
  const types = [];
  const agri = parseFloat(props.area_agri || 0);
  const comm = parseFloat(props.area_comml || 0);
  const indl = parseFloat(props.area_indl || 0);
  const res = parseFloat(props.area_res || 0);
  if (agri > 0) types.push('AGRI');
  if (comm > 0) types.push('COMM');
  if (indl > 0) types.push('INDUSTRIAL');
  if (res > 0) types.push('RES');
  if (types.length === 0) return 'UNCLASSIFIED';
  return types.sort().join('_');
}

function getLotColor(props) {
  const key = getLotComboKey(props);
  return COMBO_MAP[key]?.hex || '#ff00ff';
}

const MAIN_COLORS = { agri: '#22c55e', comml: '#fbbf24', indl: '#3b82f6', res: '#ef4444' };

const fmtFull = (val) => {
  const num = Number(val || 0);
  return (
    <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700 }}>
      {num < 0 ? '- ₱' : '₱'}
      {Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
};

/* ── Custom Map Controls ────────────────────────────────── */
function MapControls({ onCenter }) {
  const map = useMap();
  
  return (
    <div className="custom-map-controls">
      <div className="zoom-group">
        <button className="map-btn" onClick={() => map.zoomIn()}>
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="3" fill="none"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button className="map-btn" onClick={() => map.zoomOut()}>
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="3" fill="none"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
      <button className="map-btn center-btn" onClick={onCenter}>
        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2.5" fill="none">
          <circle cx="12" cy="12" r="10"></circle>
          <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
          <line x1="12" y1="2" x2="12" y2="6"></line>
          <line x1="12" y1="18" x2="12" y2="22"></line>
          <line x1="2" y1="12" x2="6" y2="12"></line>
          <line x1="18" y1="12" x2="22" y2="12"></line>
        </svg>
      </button>
    </div>
  );
}

/* ── Modal Component ────────────────────────────────────── */
function LotAttributesModal({ lot, onClose }) {
  if (!lot) return null;
  const fields = [
    { k: 'address', l: 'address' }, { k: 'area_agri', l: 'area_agri' }, { k: 'area_comml', l: 'area_comml' },
    { k: 'area_exempt', l: 'area_exempt' }, { k: 'area_indl', l: 'area_indl' }, { k: 'area_res', l: 'area_res' },
    { k: 'area_rrw', l: 'area_rrw' }, { k: 'arp_no', l: 'arp_no' }, { k: 'barangay', l: 'barangay' },
    { k: 'has_enlargement', l: 'has_enlargement' }, { k: 'Name of Owner', l: 'Name of Owner' },
    { k: 'owner', l: 'owner' }, { k: 'pin', l: 'PIN' }, { k: 'prev_arp_no', l: 'prev_arp_no' },
    { k: 'section_number', l: 'section_number' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Lot Attributes</h2>
          <button className="modal-close-btn" onClick={onClose}>CLOSE</button>
        </div>
        <div className="modal-subheader">PIN: {lot.pin || lot.PIN || 'N/A'} {lot.has_enlargement && <span style={{color:'#ef4444', marginLeft:'1rem'}}> (Has Enlargement Data)</span>}</div>
        <div className="modal-body">
          <table className="modal-table">
            <tbody>
              {fields.map(f => (
                <tr key={f.k}>
                  <td className="field-label">{f.l}</td>
                  <td className="field-value">{lot[f.k] !== undefined && lot[f.k] !== null ? String(lot[f.k]) : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Map Content ─────────────────────────────────────────── */
function LotMapContent({ geoData, onLotClick, geoRef }) {
  const map = useMap();

  useEffect(() => {
    if (map.zoomControl) map.zoomControl.remove();
    setTimeout(() => map.invalidateSize(), 200);
  }, [map]);

  const onEach = (feature, layer) => {
    const props = feature.properties || {};
    const fillCol = getLotColor(props);
    layer.setStyle({ fillColor: fillCol, fillOpacity: 0.85, color: '#ffffff', weight: 0.6 });
    layer.on('click', () => onLotClick(props.pin || props.PIN));
    layer.bindTooltip(`Lot ${props.pin || 'N/A'}`, { sticky: true, opacity: 0.95 });
    layer.on('mouseover', () => layer.setStyle({ fillOpacity: 1, weight: 1.5, color: '#000' }));
    layer.on('mouseout', () => layer.setStyle({ fillOpacity: 0.85, weight: 0.6, color: '#ffffff' }));
  };

  return (geoData && (
    <>
      <TileLayer url="http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" subdomains={['mt0', 'mt1', 'mt2', 'mt3']} />
      <GeoJSON key={`map-${geoData.features.length}`} ref={geoRef} data={geoData} onEachFeature={onEach} style={{ renderer: L.canvas() }} />
    </>
  ));
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  .dash-root { font-family: 'Plus Jakarta Sans', sans-serif; background: #f1f5f9; display: flex; flex-direction: column; height: 100%; overflow-y: auto; color: #0f172a; padding: 2rem; position: relative; }
  .dash-title-block { text-align: center; margin-bottom: 2rem; }
  .dash-title-block h1 { font-family: 'Playfair Display', serif; font-size: 2.22rem; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; margin: 0; }
  .dash-title-block p { font-size: 0.85rem; font-weight: 700; color: #64748b; letter-spacing: 0.1em; margin-top: 0.25rem; }
  .dash-main-container { display: flex; flex-direction: column; gap: 2rem; width: 100%; max-width: 1600px; margin: 0 auto; }
  .dash-upper-section { display: flex; gap: 2rem; min-height: 650px; }
  .dash-map-panel { flex: 1.8; position: relative; background: #fff; border-radius: 1rem; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
  .dash-map-legend { position: absolute; top: 1rem; left: 1rem; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(8px); padding: 1.25rem; border-radius: 0.75rem; z-index: 1000; border: 1px solid #e2e8f0; max-height: 90%; overflow-y: auto; width: 240px; }
  .legend-title { font-size: 0.75rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.1em; margin-bottom: 0.75rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem; }
  .legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 0.68rem; font-weight: 700; color: #475569; }
  .legend-swatch { width: 14px; height: 14px; border-radius: 4px; }
  .dash-floating-chart { position: absolute; bottom: 1rem; right: 1rem; width: 320px; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(8px); border-radius: 1.1rem; padding: 1.25rem; z-index: 1000; border: 1px solid #e2e8f0; }
  .dash-side-panel { flex: 1; display: flex; flex-direction: column; gap: 1.5rem; }
  .dash-card { background: #fff; border-radius: 1rem; border: 1px solid #e2e8f0; padding: 1.25rem; flex: 1; display: flex; flex-direction: column; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
  .dash-card-title { font-size: 0.75rem; font-weight: 800; color: #64748b; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 1rem; }
  .dash-stats-table td { padding: 0.7rem 0; font-size: 0.75rem; font-weight: 700; border-bottom: 1px solid #f1f5f9; }
  .dash-stats-table td:last-child { text-align: right; }
  .dash-assessment-section { background: #fff; border-radius: 1rem; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
  .dash-assessment-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid #f1f5f9; }
  .dash-full-table th { background: #f8fafc; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; padding: 1.1rem; text-align: left; }
  .dash-full-table td { padding: 0.9rem 1.1rem; font-size: 0.8rem; border-bottom: 1px solid #f1f5f9; }
  .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10000; }
  .modal-card { background: #fff; width: 620px; max-width: 90%; border-radius: 1.5rem; box-shadow: 0 25px 60px rgba(0,0,0,0.2); }
  .modal-header { padding: 1.5rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
  .modal-close-btn { background: #bae6fd; color: #0369a1; border: none; padding: 0.6rem 1.4rem; border-radius: 0.6rem; font-size: 0.85rem; font-weight: 800; cursor: pointer; }
  .modal-body { padding: 1.25rem 1.5rem; overflow-y: auto; max-height: 65vh; }
  .modal-table { width: 100%; border-collapse: collapse; }
  .modal-table td { padding: 0.85rem 0; border-bottom: 1px dashed #e2e8f0; }

  /* Custom Map UI Controls */
  .custom-map-controls {
    position: absolute;
    top: 50%;
    right: 1.5rem;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    z-index: 1000;
  }
  .zoom-group {
    background: #ffffff;
    border-radius: 1rem;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 30px rgba(0,0,0,0.12);
    border: 1px solid #e2e8f0;
  }
  .map-btn {
    width: 52px;
    height: 52px;
    background: #ffffff;
    color: #1e293b; 
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  .zoom-group .map-btn:first-child { border-bottom: 1px solid #f1f5f9; }
  .map-btn:hover { background: #f8fafc; color: #3b82f6; }
  .center-btn {
    background: #ffffff;
    border-radius: 1rem;
    box-shadow: 0 8px 30px rgba(0,0,0,0.12);
    border: 1px solid #e2e8f0;
  }

`;

export default function MainDashboard() {
  const [report, setReport] = useState(null);
  const [lotGeo, setLotGeo] = useState(null);
  const [selectedLot, setSelectedLot] = useState(null);
  const geoRef = useRef(null);

  useEffect(() => {
    apiGet('/api/dashboard/rpt-report/').then(r => r.json()).then(setReport);
    apiGet('/api/dashboard/lots-geojson/').then(r => r.json()).then(setLotGeo);
  }, []);

  const handleLotClick = async (pin) => {
    if (!pin) return;
    try {
      const resp = await apiGet(`/api/pim/lots/${encodeURIComponent(pin)}/details/`);
      if (resp.ok) setSelectedLot(await resp.json());
    } catch (err) { console.error(err); }
  };

  const handleCenter = () => {
    if (geoRef.current) {
      const bounds = geoRef.current.getBounds();
      if (bounds && bounds.isValid()) {
        const map = geoRef.current._map;
        if (map) map.fitBounds(bounds, { padding: [20, 20] });
      }
    }
  };

  const revenueData = useMemo(() => {
    if (!report?.rpt_by_class) return null;
    return {
      labels: report.rpt_by_class.map(c => c.label),
      datasets: [{
        data: report.rpt_by_class.map(c => c.amount),
        backgroundColor: report.rpt_by_class.map(c => MAIN_COLORS[c.key] || '#64748b'),
        borderRadius: 4
      }]
    };
  }, [report]);

  return (
    <div className="dash-root">
      <style>{STYLES}</style>
      <div className="dash-title-block"><h1>REAL PROPERTY TAX</h1><p>AS OF 2026</p></div>
      <div className="dash-main-container">
        <div className="dash-upper-section">
          <div className="dash-map-panel">
            <MapContainer style={{ height: '100%', width: '100% '}} center={[13.79, 121.0]} zoom={14} preferCanvas={true}>
              <LotMapContent geoData={lotGeo} onLotClick={handleLotClick} geoRef={geoRef} />
              <MapControls onCenter={handleCenter} />
            </MapContainer>
            <div className="dash-map-legend">
              <div className="legend-title">CLASSIFICATION LEGEND</div>
              {Object.entries(COMBO_MAP).map(([key, cfg]) => (
                <div key={key} className="legend-item"><span className="legend-swatch" style={{ background: cfg.hex }} />{cfg.label}</div>
              ))}
            </div>
            <div className="dash-floating-chart">
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem' }}>TAX REVENUE BY CATEGORY</div>
              <div style={{ height: '140px' }}>
                {revenueData && <Bar data={revenueData} options={{ responsive:true, maintainAspectRatio:false, plugins: { legend: { display:false } }, scales: { y: { beginAtZero:true, ticks:{ font:{size:8} } }, x: { ticks:{ font:{size:8, weight:'700'} } } } }} />}
              </div>
            </div>
          </div>
          <div className="dash-side-panel">
            <div className="dash-card"><div className="dash-card-title">PROPORTIONAL REVENUE</div><div className="dash-pie-area">{revenueData && <Pie data={revenueData} options={{ responsive:true, maintainAspectRatio:false, plugins: { legend: { position: 'right', labels:{ boxWidth:10, font:{size:10,weight:'700'} } } } }} />}</div></div>
            <div className="dash-card"><div className="dash-card-title">REVENUE BREAKDOWN</div><div style={{ flex:1, overflowY:'auto' }}>
                <table className="dash-stats-table"><tbody>{report?.rpt_by_class?.map(item => (<tr key={item.key}><td><span style={{ display:'inline-block', width:8, height:8, borderRadius:2, background:MAIN_COLORS[item.key], marginRight:8 }} />{item.label}</td><td>{fmtFull(item.amount)}</td></tr>))}</tbody></table>
              </div></div>
          </div>
        </div>
        <div className="dash-assessment-section"><div className="dash-assessment-header"><h2>Barangay Assessment Analysis</h2></div><div style={{ overflowX:'auto' }}><table className="dash-full-table"><thead><tr><th>Barangay</th><th style={{textAlign:'center'}}>Agri</th><th style={{textAlign:'center'}}>Res</th><th style={{textAlign:'center'}}>Comm</th><th style={{textAlign:'center'}}>Ind</th><th style={{textAlign:'right'}}>Market Value</th></tr></thead><tbody>{report?.assessment_table?.rows?.map(row => (
                  <tr key={row.barangay}><td style={{ fontWeight: 700 }}>{row.barangay}</td><td style={{textAlign:'center'}}>{row.counts.agri}</td><td style={{textAlign:'center'}}>{row.counts.res}</td><td style={{textAlign:'center'}}>{row.counts.comml}</td><td style={{textAlign:'center'}}>{row.counts.indl}</td><td style={{textAlign:'right', fontWeight:700}}>{fmtFull(row.market_value)}</td></tr>))}</tbody></table></div></div>
      </div>
      <LotAttributesModal lot={selectedLot} onClose={() => setSelectedLot(null)} />
    </div>
  );
}
