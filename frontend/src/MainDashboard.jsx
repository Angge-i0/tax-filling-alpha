import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { apiGet } from './api';
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const MAIN_COLORS = {
  agri: '#22c55e',
  comml: '#fbbf24',
  indl: '#3b82f6',
  res: '#ef4444',
};

function getMapFitOptions(mapSize) {
  if (typeof window !== 'undefined' && window.innerWidth <= 760) {
    return {
      paddingTopLeft: [28, 28],
      paddingBottomRight: [28, 28],
      maxZoom: 15,
    };
  }

  const width = mapSize?.x || 0;
  const height = mapSize?.y || 0;
  const leftInset = Math.max(170, Math.round(width * 0.2));
  const rightInset = Math.max(32, Math.round(width * 0.04));
  const topInset = Math.max(26, Math.round(height * 0.03));
  const bottomInset = Math.max(96, Math.round(height * 0.13));

  return {
    paddingTopLeft: [leftInset, topInset],
    paddingBottomRight: [rightInset, bottomInset],
    maxZoom: 16,
  };
}

const pieCalloutPlugin = {
  id: 'pieCalloutPlugin',
  afterDatasetsDraw(chart) {
    if (chart.config.type !== 'pie') return;

    const dataset = chart.data.datasets?.[0];
    const meta = chart.getDatasetMeta(0);
    if (!dataset || !meta?.data?.length) return;

    const total = dataset.data.reduce((sum, value) => sum + Number(value || 0), 0);
    if (!total) return;

    const { ctx, width } = chart;
    const baseFont = ChartJS.defaults.font.family || "'Plus Jakarta Sans', sans-serif";

    ctx.save();
    ctx.font = `700 11px ${baseFont}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.lineWidth = 2;

    meta.data.forEach((arc, index) => {
      const value = Number(dataset.data[index] || 0);
      if (!value) return;

      const percentageText = `${Math.round((value / total) * 100)}%`;
      const angle = (arc.startAngle + arc.endAngle) / 2;
      const color = Array.isArray(dataset.backgroundColor)
        ? dataset.backgroundColor[index]
        : dataset.backgroundColor;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const startX = arc.x + dirX * (arc.outerRadius - 1);
      const startY = arc.y + dirY * (arc.outerRadius - 1);
      const elbowX = arc.x + dirX * (arc.outerRadius + 12);
      const elbowY = arc.y + dirY * (arc.outerRadius + 12);
      const textWidth = ctx.measureText(percentageText).width;
      const boxWidth = textWidth + 16;
      const boxHeight = 24;
      const isRight = dirX >= 0;
      const rawEndX = elbowX + (isRight ? 18 : -18);
      const unclampedBoxX = isRight ? rawEndX : rawEndX - boxWidth;
      const boxX = Math.min(Math.max(16, unclampedBoxX), width - boxWidth - 16);
      const boxY = elbowY - boxHeight / 2;
      const lineEndX = isRight ? boxX : boxX + boxWidth;

      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(elbowX, elbowY);
      ctx.lineTo(lineEndX, elbowY);
      ctx.stroke();

      ctx.beginPath();
      if (isRight) {
        ctx.moveTo(lineEndX + 4, elbowY);
        ctx.lineTo(lineEndX - 4, elbowY - 3);
        ctx.lineTo(lineEndX - 4, elbowY + 3);
      } else {
        ctx.moveTo(lineEndX - 4, elbowY);
        ctx.lineTo(lineEndX + 4, elbowY - 3);
        ctx.lineTo(lineEndX + 4, elbowY + 3);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(percentageText, boxX + boxWidth / 2, elbowY);
    });

    ctx.restore();
  },
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  ChartDataLabels,
  pieCalloutPlugin
);

const fmtMoney = (value) =>
  `P${Math.abs(Number(value || 0)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function getDominantClass(counts = {}) {
  return ['agri', 'res', 'indl', 'comml'].reduce((best, key) => {
    const bestValue = Number(counts?.[best] || 0);
    const nextValue = Number(counts?.[key] || 0);
    return nextValue > bestValue ? key : best;
  }, 'agri');
}

function getBarangayStyle(summary, classMax, isSelected) {
  if (!summary) {
    return {
      fillColor: '#cbd5e1',
      fillOpacity: 0.2,
      color: '#ffffff',
      weight: isSelected ? 3 : 1.2,
    };
  }

  const dominantClass = getDominantClass(summary.counts);
  const dominantValue = Number(summary.counts?.[dominantClass] || 0);
  const max = Number(classMax?.[dominantClass] || 1);
  return {
    fillColor: dominantValue > 0 ? MAIN_COLORS[dominantClass] : '#cbd5e1',
    fillOpacity: dominantValue > 0 ? 0.35 + 0.45 * (dominantValue / max) : 0.18,
    color: isSelected ? '#0f172a' : '#ffffff',
    weight: isSelected ? 3 : 1.2,
  };
}

function MapControls({ onCenter }) {
  const map = useMap();

  return (
    <div className="custom-map-controls">
      <div className="zoom-group">
        <button className="map-btn" onClick={() => map.zoomIn()}>
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="3" fill="none">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button className="map-btn" onClick={() => map.zoomOut()}>
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="3" fill="none">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <button className="map-btn center-btn" onClick={onCenter}>
        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2.5" fill="none">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function BarangayMapContent({
  geoData,
  summaryByBarangay,
  selectedBarangay,
  onSelectBarangay,
  classMax,
  geoRef,
}) {
  const map = useMap();

  const fitToVisibleMap = () => {
    if (!geoData?.features?.length) return;
    const bounds = geoRef.current?.getBounds?.();
    if (bounds?.isValid?.()) {
      map.fitBounds(bounds, getMapFitOptions(map.getSize()));
    }
  };

  useEffect(() => {
    if (map.zoomControl) map.zoomControl.remove();
    setTimeout(() => map.invalidateSize(), 200);
  }, [map]);

  useEffect(() => {
    fitToVisibleMap();
  }, [geoData, map, geoRef, selectedBarangay]);

  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
      fitToVisibleMap();
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          map.invalidateSize();
          fitToVisibleMap();
        })
      : null;

    const mapContainer = map.getContainer();
    if (resizeObserver && mapContainer?.parentElement) {
      resizeObserver.observe(mapContainer.parentElement);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [map, geoData, selectedBarangay]);

  const onEachFeature = (feature, layer) => {
    const barangay = feature.properties?.ADM4_EN;
    const summary = summaryByBarangay.get(barangay);

    layer.bindTooltip(barangay || 'Barangay', { sticky: true, opacity: 0.95 });
    layer.on('click', () => {
      if (summary) onSelectBarangay(summary);
    });
    layer.on('mouseover', () => {
      layer.setStyle({ weight: 2.6, fillOpacity: 0.82, color: '#0f172a' });
    });
    layer.on('mouseout', () => {
      const isSelected = selectedBarangay === barangay;
      layer.setStyle(getBarangayStyle(summary, classMax, isSelected));
    });
  };

  const style = (feature) => {
    const barangay = feature.properties?.ADM4_EN;
    const summary = summaryByBarangay.get(barangay);
    return getBarangayStyle(summary, classMax, selectedBarangay === barangay);
  };

  return geoData ? (
    <>
      <TileLayer url="http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" subdomains={['mt0', 'mt1', 'mt2', 'mt3']} />
      <GeoJSON
        key={`barangays-${selectedBarangay || 'none'}`}
        ref={geoRef}
        data={geoData}
        onEachFeature={onEachFeature}
        style={style}
        renderer={L.canvas()}
      />
    </>
  ) : null;
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  .dash-root { font-family: 'Plus Jakarta Sans', sans-serif; background: #f1f5f9; display: flex; flex-direction: column; height: 100%; overflow-y: auto; color: #0f172a; padding: 2rem 0 2rem 2rem; position: relative; scrollbar-gutter: stable; }
  .dash-title-block { text-align: center; margin-bottom: 1rem; }
  .dash-title-block h1 { font-family: 'Playfair Display', serif; font-size: 2.22rem; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; margin: 0; }
  .dash-title-block p { font-size: 0.85rem; font-weight: 700; color: #64748b; letter-spacing: 0.1em; margin-top: 0.25rem; }
  .dash-main-container { display: flex; flex-direction: column; gap: 1.4rem; width: calc(100% - 2rem); max-width: 1600px; margin: 0 auto; padding-right: 2rem; box-sizing: border-box; }
  .dash-upper-section { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(20rem, 0.86fr); gap: 1rem; align-items: stretch; }
  .dash-map-stage { display: flex; flex-direction: column; min-height: 100%; }
  .dash-map-panel { position: relative; background: #fff; border-radius: 1rem; border: 1px solid #dce7f4; overflow: hidden; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08); min-height: 32rem; height: 100%; }
  .dash-map-summary { position: absolute; top: 0.9rem; left: 0.9rem; z-index: 1000; background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); border: 1px solid #dbe7f3; border-radius: 0.9rem; padding: 0.8rem; width: 14.5rem; box-shadow: 0 14px 28px rgba(15, 23, 42, 0.14); }
  .dash-map-summary h3 { margin: 0; font-size: 0.95rem; font-weight: 800; color: #16345c; }
  .dash-map-summary p { margin: 0.25rem 0 0.65rem; font-size: 0.72rem; color: #6b7f99; line-height: 1.35; }
  .dash-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.45rem; margin-bottom: 0.65rem; }
  .dash-summary-pill { background: #ffffff; border: 2px solid #dde8f3; border-radius: 0.8rem; padding: 0.55rem 0.6rem; transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
  .dash-summary-pill:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(15, 23, 42, 0.12); }
  .dash-summary-pill label { display: block; font-size: 0.56rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.2rem; }
  .dash-summary-pill strong { font-size: 0.88rem; }
  .dash-summary-value { border-top: 1px solid #e5eef6; padding-top: 0.65rem; margin-top: 0.65rem; display: grid; gap: 0.5rem; }
  .dash-summary-row { display: flex; justify-content: space-between; gap: 0.9rem; align-items: center; }
  .dash-summary-row span { font-size: 0.54rem; font-weight: 800; color: #71839a; letter-spacing: 0.08em; text-transform: uppercase; }
  .dash-summary-row strong { font-size: 0.68rem; color: #102c53; text-align: right; }
  .dash-floating-chart { position: absolute; right: 0.9rem; bottom: 0.9rem; width: min(19rem, calc(100% - 7rem)); background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); border-radius: 0.9rem; padding: 0.8rem 0.9rem; z-index: 1000; border: 1px solid #dce7f4; box-shadow: 0 12px 22px rgba(15, 23, 42, 0.14); }
  .dash-chart-caption { font-size: 0.64rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.55rem; }
  .dash-side-panel { display: flex; flex-direction: column; gap: 1rem; }
  .dash-card { background: #fff; border-radius: 1rem; border: 1px solid #dce7f4; padding: 1rem; display: flex; flex-direction: column; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06); }
  .dash-card-title { font-size: 0.74rem; font-weight: 800; color: #526783; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 0.8rem; }
  .dash-pie-area { position: relative; min-height: 15rem; }
  .dash-signifies { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #ecf2f8; }
  .dash-signifies-title { font-size: 0.7rem; font-weight: 800; color: #526783; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 0.7rem; }
  .dash-signifies-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem 1rem; }
  .dash-signifies-item { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
  .dash-signifies-swatch { width: 0.8rem; height: 0.8rem; border-radius: 0.24rem; flex-shrink: 0; }
  .dash-signifies-name { font-size: 0.82rem; font-weight: 700; color: #133661; }
  .dash-breakdown-list { display: grid; gap: 0.65rem; }
  .dash-breakdown-item { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding-bottom: 0.65rem; border-bottom: 1px solid #ecf2f8; }
  .dash-breakdown-item:last-child { border-bottom: none; padding-bottom: 0; }
  .dash-breakdown-label { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
  .dash-breakdown-dot { width: 0.64rem; height: 0.64rem; border-radius: 0.2rem; flex-shrink: 0; }
  .dash-breakdown-name { font-size: 0.88rem; font-weight: 800; color: #133661; }
  .dash-breakdown-amount { font-size: 0.9rem; font-weight: 800; color: #133661; text-align: right; white-space: nowrap; }
  .dash-assessment-section { background: transparent; border-radius: 1rem; overflow: visible; box-shadow: none; }
  .dash-assessment-header { text-align: center; padding: 0.5rem 1.5rem 1.5rem; }
  .dash-assessment-header h2 { margin: 0; font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 900; letter-spacing: 0.06em; color: #17386b; text-transform: uppercase; }
  .dash-assessment-header p { margin: 0.35rem 0 0; font-size: 0.88rem; font-weight: 700; letter-spacing: 0.12em; color: #526785; text-transform: uppercase; }
  .dash-table-shell { background: #ffffff; border-radius: 1rem; overflow: hidden; border: 1px solid #d8e6f5; box-shadow: 0 12px 30px rgba(30, 58, 95, 0.08); }
  .dash-table-scroll { overflow-x: auto; }
  .dash-full-table { width: 100%; min-width: 980px; border-collapse: collapse; }
  .dash-full-table thead th { text-transform: uppercase; letter-spacing: 0.08em; }
  .dash-full-table thead tr:first-child th { background: #93c8ed; color: #051b3c; font-size: 0.82rem; font-weight: 800; padding: 0.9rem 0.95rem; border: 1px solid rgba(255,255,255,0.18); }
  .dash-full-table thead tr:nth-child(2) th { background: #63aee0; color: #051b3c; font-size: 0.76rem; font-weight: 800; padding: 0.75rem 0.8rem; border: 1px solid rgba(255,255,255,0.18); }
  .dash-full-table thead th:first-child { text-align: left; }
  .dash-full-table td { padding: 0.95rem 0.9rem; font-size: 0.95rem; border-bottom: 1px solid #d5e2ef; color: #0f2a52; }
  .dash-full-table tbody tr:last-child td { border-bottom: none; }
  .dash-full-table tbody td:first-child { font-weight: 700; }
  .dash-full-table tbody tr.selected-row { background: #eef7ff; }
  .dash-full-table tbody td.numeric, .dash-full-table tfoot td.numeric { text-align: center; }
  .dash-full-table tbody td.money, .dash-full-table tfoot td.money { text-align: right; font-weight: 700; }
  .dash-full-table tbody tr:hover { background: #f6fbff; }
  .dash-full-table tfoot td { background: #9ecdee; color: #06224c; font-size: 1rem; font-weight: 800; padding: 1rem 0.95rem; border-top: 2px solid #27588a; }
  .dash-full-table tfoot td:first-child { font-size: 1.08rem; }
  .dash-assessment-note { margin-top: 0.9rem; color: #1f3b63; font-size: 0.92rem; }
  .dash-assessment-note span { color: #c62828; font-weight: 800; }
  .custom-map-controls { position: absolute; top: 1.2rem; right: 1.2rem; display: flex; flex-direction: column; gap: 1rem; z-index: 1000; }
  .zoom-group { background: #ffffff; border-radius: 1rem; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 8px 30px rgba(0,0,0,0.12); border: 1px solid #e2e8f0; }
  .map-btn { width: 3.25rem; height: 3.25rem; background: #ffffff; color: #1e293b; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
  .zoom-group .map-btn:first-child { border-bottom: 1px solid #f1f5f9; }
  .map-btn:hover { background: #f8fafc; color: #3b82f6; }
  .center-btn { background: #ffffff; border-radius: 1rem; box-shadow: 0 8px 30px rgba(0,0,0,0.12); border: 1px solid #e2e8f0; }
  @media (max-width: 1180px) {
    .dash-root { padding: 1.2rem 0 1.4rem 1rem; }
    .dash-main-container { width: calc(100% - 1rem); padding-right: 1rem; }
    .dash-upper-section { grid-template-columns: 1fr; }
    .dash-map-panel { min-height: 34rem; height: 34rem; }
  }
  @media (max-width: 760px) {
    .dash-map-summary { position: static; width: auto; margin: 1rem; }
    .dash-floating-chart { position: static; width: auto; margin: 1rem; }
    .custom-map-controls { top: auto; bottom: 1rem; transform: none; }
    .dash-assessment-header h2 { font-size: 1.55rem; }
    .dash-pie-area { min-height: 17rem; }
    .dash-signifies-list { grid-template-columns: 1fr; }
  }
`;

export default function MainDashboard() {
  const [report, setReport] = useState(null);
  const [barangayGeo, setBarangayGeo] = useState(null);
  const [selectedBarangay, setSelectedBarangay] = useState(null);
  const geoRef = useRef(null);

  useEffect(() => {
    apiGet('/api/dashboard/rpt-report/').then((r) => r.json()).then(setReport);
    apiGet('/api/geojson/').then((r) => r.json()).then(setBarangayGeo);
  }, []);

  const rows = report?.assessment_table?.rows || [];

  const summaryByBarangay = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => map.set(row.barangay, row));
    return map;
  }, [rows]);

  useEffect(() => {
    if (!selectedBarangay && rows.length) {
      setSelectedBarangay(rows[0]);
    }
  }, [rows, selectedBarangay]);

  const classMax = useMemo(() => ({
    agri: Math.max(1, ...rows.map((row) => Number(row.counts?.agri || 0))),
    res: Math.max(1, ...rows.map((row) => Number(row.counts?.res || 0))),
    indl: Math.max(1, ...rows.map((row) => Number(row.counts?.indl || 0))),
    comml: Math.max(1, ...rows.map((row) => Number(row.counts?.comml || 0))),
  }), [rows]);

  const revenueData = useMemo(() => {
    if (!report?.rpt_by_class) return null;
    return {
      labels: report.rpt_by_class.map((item) => item.label.charAt(0) + item.label.slice(1).toLowerCase()),
      datasets: [
        {
          data: report.rpt_by_class.map((item) => item.amount),
          backgroundColor: report.rpt_by_class.map((item) => MAIN_COLORS[item.key] || '#64748b'),
          borderColor: '#ffffff',
          borderWidth: 3,
        },
      ],
    };
  }, [report]);

  const barData = useMemo(() => {
    if (!report?.rpt_by_class) return null;
    return {
      labels: report.rpt_by_class.map((item) => item.label.charAt(0) + item.label.slice(1).toLowerCase()),
      datasets: [
        {
          data: report.rpt_by_class.map((item) => item.amount),
          backgroundColor: report.rpt_by_class.map((item) => MAIN_COLORS[item.key] || '#64748b'),
          borderRadius: 6,
        },
      ],
    };
  }, [report]);

  const pieOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 18, right: 98, bottom: 18, left: 98 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(context) {
            const total = context.dataset.data.reduce((sum, value) => sum + Number(value || 0), 0);
            const value = Number(context.parsed || 0);
            const percent = total ? ((value / total) * 100).toFixed(1) : '0.0';
            return `${percent}%`;
          },
          title() {
            return '';
          },
        },
      },
      datalabels: { display: false },
    },
  }), []);

  const barOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(context) {
            return fmtMoney(context.parsed.y);
          },
        },
      },
      datalabels: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { font: { size: 9 } },
        grid: { color: 'rgba(148, 163, 184, 0.2)' },
      },
      x: {
        ticks: { font: { size: 9, weight: '700' } },
        grid: { display: false },
      },
    },
  }), []);

  const handleCenter = () => {
    if (!geoRef.current) return;
    const bounds = geoRef.current.getBounds();
    const map = geoRef.current._map;
    if (bounds?.isValid?.() && map) {
      map.fitBounds(bounds, getMapFitOptions(map.getSize()));
    }
  };

  return (
    <div className="dash-root">
      <style>{STYLES}</style>
      <div className="dash-title-block">
        <h1>Real Property Tax</h1>
        <p>As of 2026</p>
      </div>

      <div className="dash-main-container">
        <div className="dash-upper-section">
          <div className="dash-map-stage">
            <div className="dash-map-panel">
              <MapContainer style={{ height: '100%', width: '100%' }} center={[13.79, 121.0]} zoom={13} preferCanvas>
                <BarangayMapContent
                  geoData={barangayGeo}
                  summaryByBarangay={summaryByBarangay}
                  selectedBarangay={selectedBarangay?.barangay || null}
                  onSelectBarangay={setSelectedBarangay}
                  classMax={classMax}
                  geoRef={geoRef}
                />
                <MapControls onCenter={handleCenter} />
              </MapContainer>

              <div className="dash-map-summary">
                <h3>{selectedBarangay?.barangay || 'Select a barangay'}</h3>
                <p>
                  {selectedBarangay
                    ? 'Map color is based on whichever parcel type has the greatest count in this barangay.'
                    : 'Click a barangay polygon to see its assessment summary.'}
                </p>
                <div className="dash-summary-grid">
                  <div className="dash-summary-pill" style={{ borderColor: MAIN_COLORS.agri }}>
                    <label style={{ color: MAIN_COLORS.agri }}>Agricultural</label>
                    <strong style={{ color: MAIN_COLORS.agri }}>{selectedBarangay?.counts?.agri ?? 0}</strong>
                  </div>
                  <div className="dash-summary-pill" style={{ borderColor: MAIN_COLORS.res }}>
                    <label style={{ color: MAIN_COLORS.res }}>Residential</label>
                    <strong style={{ color: MAIN_COLORS.res }}>{selectedBarangay?.counts?.res ?? 0}</strong>
                  </div>
                  <div className="dash-summary-pill" style={{ borderColor: MAIN_COLORS.indl }}>
                    <label style={{ color: MAIN_COLORS.indl }}>Industrial</label>
                    <strong style={{ color: MAIN_COLORS.indl }}>{selectedBarangay?.counts?.indl ?? 0}</strong>
                  </div>
                  <div className="dash-summary-pill" style={{ borderColor: MAIN_COLORS.comml }}>
                    <label style={{ color: MAIN_COLORS.comml }}>Commercial</label>
                    <strong style={{ color: MAIN_COLORS.comml }}>{selectedBarangay?.counts?.comml ?? 0}</strong>
                  </div>
                </div>
                <div className="dash-summary-value">
                  <div className="dash-summary-row">
                    <span>Market Value</span>
                    <strong>{fmtMoney(selectedBarangay?.market_value)}</strong>
                  </div>
                  <div className="dash-summary-row">
                    <span>Assessed Value</span>
                    <strong>{fmtMoney(selectedBarangay?.assessed_value)}</strong>
                  </div>
                </div>
              </div>

              <div className="dash-floating-chart">
                <div className="dash-chart-caption">Tax Revenue By Category</div>
                <div style={{ height: '8.5rem' }}>
                  {barData && <Bar data={barData} options={barOptions} />}
                </div>
              </div>
            </div>
          </div>

          <div className="dash-side-panel">
            <div className="dash-card">
              <div className="dash-card-title">Proportional Revenue</div>
              <div className="dash-pie-area">
                {revenueData && <Pie data={revenueData} options={pieOptions} />}
              </div>
              <div className="dash-signifies">
                <div className="dash-signifies-title">Signifies</div>
                <div className="dash-signifies-list">
                  {report?.rpt_by_class?.map((item) => (
                    <div className="dash-signifies-item" key={item.key}>
                      <span
                        className="dash-signifies-swatch"
                        style={{ background: MAIN_COLORS[item.key] || '#64748b' }}
                      />
                      <span className="dash-signifies-name">
                        {item.label.charAt(0) + item.label.slice(1).toLowerCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="dash-card">
              <div className="dash-card-title">Revenue Breakdown</div>
              <div className="dash-breakdown-list">
                {report?.rpt_by_class?.map((item) => (
                  <div className="dash-breakdown-item" key={item.key}>
                    <div className="dash-breakdown-label">
                      <span className="dash-breakdown-dot" style={{ background: MAIN_COLORS[item.key] || '#64748b' }} />
                      <span className="dash-breakdown-name">{item.label.charAt(0) + item.label.slice(1).toLowerCase()}</span>
                    </div>
                    <div className="dash-breakdown-amount">{fmtMoney(item.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="dash-assessment-section">
          <div className="dash-assessment-header">
            <h2>Assessment</h2>
            <p>As of 2026</p>
          </div>
          <div className="dash-table-shell">
            <div className="dash-table-scroll">
              <table className="dash-full-table">
                <thead>
                  <tr>
                    <th rowSpan="2">Barangay</th>
                    <th colSpan="4" style={{ textAlign: 'center' }}>Number of Parcels</th>
                    <th rowSpan="2" style={{ textAlign: 'center' }}>Market Value</th>
                    <th rowSpan="2" style={{ textAlign: 'center' }}>Assessed Value</th>
                  </tr>
                  <tr>
                    <th style={{ textAlign: 'center' }}>Agricultural</th>
                    <th style={{ textAlign: 'center' }}>Residential</th>
                    <th style={{ textAlign: 'center' }}>Industrial</th>
                    <th style={{ textAlign: 'center' }}>Commercial</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.barangay}
                      className={selectedBarangay?.barangay === row.barangay ? 'selected-row' : ''}
                      onClick={() => setSelectedBarangay(row)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{row.barangay}</td>
                      <td className="numeric">{row.counts.agri}</td>
                      <td className="numeric">{row.counts.res}</td>
                      <td className="numeric">{row.counts.indl}</td>
                      <td className="numeric">{row.counts.comml}</td>
                      <td className="money">{fmtMoney(row.market_value)}</td>
                      <td className="money">{fmtMoney(row.assessed_value)}</td>
                    </tr>
                  ))}
                </tbody>
                {report?.assessment_table?.totals && (
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="numeric">{report.assessment_table.totals.counts.agri}</td>
                      <td className="numeric">{report.assessment_table.totals.counts.res}</td>
                      <td className="numeric">{report.assessment_table.totals.counts.indl}</td>
                      <td className="numeric">{report.assessment_table.totals.counts.comml}</td>
                      <td className="money">{fmtMoney(report.assessment_table.totals.market_value)}</td>
                      <td className="money">{fmtMoney(report.assessment_table.totals.assessed_value)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          <div className="dash-assessment-note">
            <span>Note:</span> Only parcels with complete data are included.
          </div>
        </div>
      </div>
    </div>
  );
}
