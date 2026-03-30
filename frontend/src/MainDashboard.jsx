import { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { apiGet } from './api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function MainDashboard() {
  const [report, setReport] = useState(null);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    apiGet('/api/dashboard/rpt-report/').then(r => r.json()).then(setReport);
  }, []);

  useEffect(() => {
    if (report?.status === 'generating') {
      const timer = setTimeout(() => {
        const url = pollCount >= 2 ? '/api/dashboard/rpt-report/?sync=1' : '/api/dashboard/rpt-report/';
        apiGet(url).then(r => r.json()).then(setReport);
        setPollCount((c) => c + 1);
      }, 3000);
      return () => clearTimeout(timer);
    }
    if (report?.status !== 'generating' && pollCount !== 0) {
      setPollCount(0);
    }
  }, [report?.status]);

  const hasRpt = Array.isArray(report?.rpt_by_class);
  const barData = hasRpt ? {
    labels: report.rpt_by_class.map(c => c.label),
    datasets: [{
      label: 'Real Property Tax',
      data: report.rpt_by_class.map(c => c.amount),
      backgroundColor: ['#6b0f1a', '#7a1420', '#8c1b28', '#a52533'],
      borderRadius: 6,
    }]
  } : null;

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { callback: (v) => Number(v).toLocaleString() } },
      x: { ticks: { font: { size: 10, weight: '700' } } }
    }
  };

  const formatMoney = (val) => {
    const num = Number(val || 0);
    return (
      <span className="rpt-money">
        <span className="rpt-currency">₱</span>
        {num.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </span>
    );
  };

  return (
    <div className="rpt-page">
      <div className="rpt-header">
        <h1>REAL PROPERTY TAX</h1>
        <p>as of {report?.as_of_year || new Date().getFullYear()}</p>
      </div>

      <div className="rpt-chart-card">
        <div className="rpt-chart">
          {barData ? <Bar data={barData} options={barOptions} /> : (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem 0' }}>
              {report?.error ? report.error : (report?.status === 'generating' ? 'Generating report data... (auto-refreshing)' : 'Loading report data...')}
            </div>
          )}
        </div>
      </div>

      <div className="rpt-class-list">
        <div className="rpt-class-col">
          {report?.rpt_by_class?.map(item => (
            <div key={item.key} className="rpt-class-row">{item.label}</div>
          ))}
        </div>
        <div className="rpt-class-col right">
          {report?.rpt_by_class?.map(item => (
            <div key={item.key} className="rpt-class-row">{formatMoney(item.amount)}</div>
          ))}
        </div>
      </div>

      <div className="rpt-assess-header">
        <h2>ASSESSMENT</h2>
        <p>as of {report?.as_of_year || new Date().getFullYear()}</p>
      </div>

      <div className="rpt-table-wrap">
        <table className="rpt-table">
          <thead>
            <tr>
              <th rowSpan={2}>Barangay</th>
              <th colSpan={4}>Number of Parcel</th>
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
            {report?.assessment_table?.rows?.map(row => (
              <tr key={row.barangay}>
                <td>{row.barangay}</td>
                <td>{row.counts.agri}</td>
                <td>{row.counts.res}</td>
                <td>{row.counts.indl}</td>
                <td>{row.counts.comml}</td>
                <td>{formatMoney(row.market_value)}</td>
                <td>{formatMoney(row.assessed_value)}</td>
              </tr>
            ))}
            {report?.assessment_table?.totals && (
              <tr className="rpt-total-row">
                <td>{report.assessment_table.totals.barangay}</td>
                <td>{report.assessment_table.totals.counts.agri}</td>
                <td>{report.assessment_table.totals.counts.res}</td>
                <td>{report.assessment_table.totals.counts.indl}</td>
                <td>{report.assessment_table.totals.counts.comml}</td>
                <td>{formatMoney(report.assessment_table.totals.market_value)}</td>
                <td>{formatMoney(report.assessment_table.totals.assessed_value)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rpt-note">
        <span>Note:</span> {report?.notes || 'Data depends on availability. Only parcels with details are included.'}
      </div>
    </div>
  );
}
