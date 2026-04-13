import { useState, useEffect } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { Search } from 'lucide-react';
import { apiGet } from './api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

/* ── Consistent category colours ─────────────────────────── */
const CAT_COLORS = {
  AGRICULTURAL: '#4caf50',   // green
  RESIDENTIAL: '#2196f3',   // blue
  COMMERCIAL: '#ffc107',   // yellow
  INDUSTRIAL: '#9c27b0',   // purple
};
const FALLBACK = ['#4caf50', '#2196f3', '#ffc107', '#9c27b0', '#94a3b8'];

const color = (label, i) =>
  CAT_COLORS[label?.toUpperCase()] ?? FALLBACK[i % FALLBACK.length];

/* ── Money formatters ─────────────────────────────────────── */
const fmtFull = (val) => {
  const num = Number(val || 0);
  const neg = num < 0;
  return (
    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
      {neg ? '- ₱' : '₱'}
      {Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
};

/* ── Styles (scoped to .dash-root) ────────────────────────── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');

  .dash-root {
    font-family: 'Plus Jakarta Sans', sans-serif;
    background: #eef2f7;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    color: #0f1d35;
    box-sizing: border-box;
    margin: -0.75rem -2rem;   /* cancel content-container padding */
    width: calc(100% + 4rem); /* compensate horizontal */
    /* Firefox */
    scrollbar-width: thin;
    scrollbar-color: #b0bec5 transparent;
  }
  .dash-root * { box-sizing: border-box; }

  /* ── Thin right-edge scrollbar (WebKit) ── */
  .dash-root::-webkit-scrollbar {
    width: 5px;
  }
  .dash-root::-webkit-scrollbar-track {
    background: transparent;
  }
  .dash-root::-webkit-scrollbar-thumb {
    background-color: #b0bec5;
    border-radius: 10px;
    border: none;
  }
  .dash-root::-webkit-scrollbar-thumb:hover {
    background-color: #90a4ae;
  }
  .dash-root::-webkit-scrollbar-corner {
    background: transparent;
  }

  /* ── Main viewport section ── */
  .dash-fold {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 0.75rem 2rem 0.8rem;
    min-height: 100%;
  }

  /* ── Page title ── */
  .dash-title-block {
    text-align: center;
    flex-shrink: 0;
  }
  .dash-title-block h1 {
    font-family: 'Playfair Display', serif;
    font-size: 2.1rem;
    font-weight: 900;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #0f1d35;
    margin: 0 0 0.25rem;
    line-height: 1;
  }
  .dash-title-block p {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.8rem;
    font-weight: 500;
    color: #64748b;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0;
  }

  /* ── Stale banner ── */
  .dash-stale {
    background: #fef9c3;
    border: 1px solid #fde68a;
    border-radius: 0.5rem;
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: #92400e;
  }
  .dash-stale button {
    margin-left: auto;
    background: #0f1d35;
    color: #fff;
    border: none;
    padding: 0.28rem 0.75rem;
    border-radius: 0.35rem;
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif;
  }

  /* ── Charts row ── */
  .dash-charts-row {
    display: flex;
    gap: 1.1rem;
    flex: 1;
    min-height: 0;
  }

  /* ── Generic card ── */
  .dash-card {
    background: #ffffff;
    border-radius: 0.8rem;
    box-shadow: 0 4px 12px rgba(15,29,53,0.1);
    border: 1px solid #e4eaf2;
    padding: 1rem 1.1rem 0.9rem;
  }
  .dash-card-title {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #64748b;
    margin: 0 0 0.75rem;
  }

  /* ── Bar card (left, larger) ── */
  .dash-bar-card {
    flex: 1.55;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .dash-bar-area {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  /* ── Right panel ── */
  .dash-right-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    min-width: 0;
  }

  /* ── Pie card ── */
  .dash-pie-card {
    flex: 65;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .dash-pie-area {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  /* ── Category / Value table card ── */
  .dash-cat-card {
    flex: 35;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding-top: 0.5rem; /* pull content up */
  }
  .dash-cat-table {
    width: 100%;
    border-collapse: collapse;
  }
  .dash-cat-table thead th {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: #94a3b8;
    text-transform: uppercase;
    padding-bottom: 0.45rem;
    border-bottom: 1px solid #e2e8f0;
  }
  .dash-cat-table thead th:last-child { text-align: right; }
  .dash-cat-table tbody tr {
    border-bottom: 1px solid #f1f5f9;
  }
  .dash-cat-table tbody tr:last-child { border-bottom: none; }
  .dash-cat-table tbody td {
    font-family: 'Plus Jakarta Sans', sans-serif;
    padding: 0.35rem 0;
    font-size: 0.77rem;
    font-weight: 600;
    color: #0f1d35;
    vertical-align: middle;
  }
  .dash-cat-table tbody td:last-child {
    text-align: right;
    font-family: 'DM Mono', monospace;
    font-size: 0.76rem;
  }
  .dash-cat-name {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .dash-cat-swatch {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  /* ── Assessment section ── */
  .dash-assess-section {
    padding: 0 2rem 2.5rem;
  }
  .dash-assess-header {
    text-align: center;
    padding: 1.2rem 0 1rem;
  }
  .dash-assess-header h2 {
    font-family: 'Playfair Display', serif;
    font-size: 1.45rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #0f1d35;
    margin: 0 0 0.2rem;
  }
  .dash-assess-header p {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.72rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
    margin: 0;
  }
  .dash-table-wrap {
    background: #fff;
    border-radius: 0.9rem;
    box-shadow: 0 4px 12px rgba(15,29,53,0.1);
    border: 1px solid #e4eaf2;
    overflow: hidden;
  }
  .dash-table-scroll { overflow-x: auto; }
  .dash-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  .dash-table thead tr:first-child th {
    font-family: 'Plus Jakarta Sans', sans-serif;
    background: #a9dbfaff;     
    color: #000000ff;
    font-weight: 700;
    font-size: 0.7rem;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    padding: 0.65rem 0.85rem;
    text-align: center;
    border: 1px solid rgba(255,255,255,0.18);
  }
  .dash-table thead tr:first-child th:first-child { text-align: left; }
  .dash-table thead tr:last-child th {
    font-family: 'Plus Jakarta Sans', sans-serif;
    background: #71bff0ff;
    color: #000000ff;
    font-weight: 700;
    font-size: 0.65rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.5rem 0.85rem;
    text-align: center;
    border: 1px solid rgba(255,255,255,0.18);
  }
  .dash-table tbody tr { border-bottom: 1px solid #e2e8f0; }
  .dash-table tbody tr:last-child { border-bottom: none; }
  .dash-table tbody tr:hover { background: #f8fafc; }
  .dash-table td {
    font-family: 'Plus Jakarta Sans', sans-serif;
    padding: 0.55rem 0.85rem;
    color: #0f1d35;
    font-size: 0.8rem;
  }
  .dash-table td:first-child { font-weight: 600; color: #1e3a5f; }
  .dash-table td:not(:first-child) { text-align: center; }
  .dash-table td:nth-last-child(-n+2) {
    text-align: right;
    font-weight: 600;
    font-family: 'DM Mono', monospace;
    font-size: 0.77rem;
  }
  .dash-total-row td {
    background: #b4ddf7ff !important;
    font-weight: 700 !important;
    border-top: 2px solid #e2e8f0;
  }
  .dash-note {
    margin-top: 0.8rem;
    font-size: 0.72rem;
    color: #40405cff;
  }
  .dash-note span { font-weight: 700; color: #960404ff; }
  .dash-empty {
    text-align: center;
    padding: 2.5rem 1rem;
    color: #94a3b8;
    font-size: 0.85rem;
  }
`;

export default function MainDashboard({ isStaff, searchBrgy = '', searchPin = '' }) {
  const [report, setReport] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    apiGet('/api/dashboard/rpt-report/').then(r => r.json()).then(setReport);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const dirty = localStorage.getItem('rpt_report_dirty');
      if (dirty) {
        setStale(true);
        apiGet('/api/dashboard/rpt-report/').then(r => r.json()).then(data => {
          setReport(data);
          setStale(false);
          localStorage.removeItem('rpt_report_dirty');
        });
      }
    }, 1500);
    return () => clearInterval(t);
  }, []);

  const refresh = () => {
    setIsRefreshing(true);
    apiGet('/api/dashboard/rpt-report/?sync=1')
      .then(r => r.json())
      .then(setReport)
      .finally(() => {
        setIsRefreshing(false);
        setStale(false);
        try { localStorage.removeItem('rpt_report_dirty'); } catch { }
      });
  };

  /* ── Chart data ── */
  const cats = Array.isArray(report?.rpt_by_class) ? report.rpt_by_class : [];
  const brgyRows = report?.assessment_table?.rows || [];
  const filteredRows = brgyRows.filter(row =>
    row.barangay.toLowerCase().includes(searchBrgy.toLowerCase())
  );
  const bgColors = cats.map((c, i) => color(c.label, i));

  const barData = cats.length ? {
    labels: cats.map(c => c.label),
    datasets: [{
      label: 'Real Property Tax',
      data: cats.map(c => c.amount),
      backgroundColor: bgColors,
      borderRadius: 6,
      borderSkipped: false,
    }]
  } : null;

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` ₱${Number(ctx.parsed.y).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#e8edf5' },
        ticks: {
          font: { size: 10, family: 'DM Mono, monospace' },
          color: '#64748b',
          callback: v => '₱' + (
            v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M' :
              v >= 1_000 ? (v / 1_000).toFixed(0) + 'K' : v
          )
        }
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10, weight: '600', family: 'Inter, sans-serif' }, color: '#475569' }
      }
    }
  };

  const pieData = cats.length ? {
    labels: cats.map(c => c.label),
    datasets: [{
      data: cats.map(c => c.amount),
      backgroundColor: bgColors,
      borderWidth: 3,
      borderColor: '#ffffff',
    }]
  } : null;

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          usePointStyle: false,
          boxWidth: 15,
          boxHeight: 15,
          font: { size: 11, weight: '600', family: 'Inter, sans-serif' },
          color: '#334155',
          padding: 14,
        }
      },
      tooltip: {
        callbacks: {
          label: ctx => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = ((ctx.parsed / total) * 100).toFixed(1);
            return ` ${ctx.label}: ${pct}%`;
          }
        }
      }
    }
  };

  return (
    <div className="dash-root">
      <style>{STYLES}</style>

      {/* ── Above-fold section ── */}
      <div className="dash-fold">

        {stale && (
          <div className="dash-stale">
            ⚠ Report values may be outdated.
            <button onClick={refresh} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing…' : 'Refresh Now'}
            </button>
          </div>
        )}

        {/* Title */}
        <div className="dash-title-block">
          <h1>Real Property Tax</h1>
          <p>as of {report?.as_of_year || new Date().getFullYear()}</p>
        </div>

        {/* Charts row */}
        <div className="dash-charts-row">

          {/* ── Left: Bar chart ── */}
          <div className="dash-card dash-bar-card">
            <p className="dash-card-title">Tax Revenue by Category</p>
            <div className="dash-bar-area">
              {barData
                ? <Bar data={barData} options={barOptions} />
                : <div className="dash-empty">{report?.error ?? 'Loading data…'}</div>
              }
            </div>
          </div>

          {/* ── Right: Pie + Table ── */}
          <div className="dash-right-panel">

            {/* Pie chart with built-in right legend */}
            <div className="dash-card dash-pie-card">
              <p className="dash-card-title">Proportional Revenue</p>
              <div className="dash-pie-area">
                {pieData
                  ? <Pie data={pieData} options={pieOptions} />
                  : <div className="dash-empty">{report?.error ?? 'Loading data…'}</div>
                }
              </div>
            </div>

            {/* Category / Value table */}
            <div className="dash-card dash-cat-card">
              <table className="dash-cat-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Category</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.length
                    ? cats.map((item, i) => (
                      <tr key={item.key || item.label}>
                        <td>
                          <div className="dash-cat-name">
                            <span
                              className="dash-cat-swatch"
                              style={{ background: color(item.label, i) }}
                            />
                            {item.label.toUpperCase()}
                          </div>
                        </td>
                        <td>{fmtFull(item.amount)}</td>
                      </tr>
                    ))
                    : (
                      <tr>
                        <td colSpan={2} className="dash-empty">Loading…</td>
                      </tr>
                    )
                  }
                </tbody>
              </table>
            </div>

          </div>{/* end right panel */}
        </div>{/* end charts row */}
      </div>{/* end fold */}

      {/* ── Assessment section ── */}
      <div className="dash-assess-section">
        <div className="dash-assess-header">
          <h2>Assessment</h2>
          <p>as of {report?.as_of_year || new Date().getFullYear()}</p>
        </div>

        <div className="dash-table-wrap">
          <div className="dash-table-scroll">
            <table className="dash-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Barangay</th>
                  <th colSpan={4}>Number of Parcels</th>
                  <th rowSpan={2}>Market Value</th>
                  <th rowSpan={2}>Assessed Value</th>
                </tr>
                <tr>
                  <th>Agricultural</th>
                  <th>Residential</th>
                  <th>Industrial</th>
                  <th>Commercial</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.barangay}>
                    <td>{row.barangay}</td>
                    <td>{row.counts.agri}</td>
                    <td>{row.counts.res}</td>
                    <td>{row.counts.indl}</td>
                    <td>{row.counts.comml}</td>
                    <td>{fmtFull(row.market_value)}</td>
                    <td>{fmtFull(row.assessed_value)}</td>
                  </tr>
                ))}
                {report?.assessment_table?.totals && (
                  <tr className="dash-total-row">
                    <td>{report.assessment_table.totals.barangay}</td>
                    <td>{report.assessment_table.totals.counts.agri}</td>
                    <td>{report.assessment_table.totals.counts.res}</td>
                    <td>{report.assessment_table.totals.counts.indl}</td>
                    <td>{report.assessment_table.totals.counts.comml}</td>
                    <td>{fmtFull(report.assessment_table.totals.market_value)}</td>
                    <td>{fmtFull(report.assessment_table.totals.assessed_value)}</td>
                  </tr>
                )}
                {!report?.assessment_table?.rows?.length && (
                  <tr>
                    <td colSpan={7} className="dash-empty">Loading assessment data…</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {report?.notes && (
          <p className="dash-note"><span>Note:</span> {report.notes}</p>
        )}
      </div>
    </div>
  );
}
