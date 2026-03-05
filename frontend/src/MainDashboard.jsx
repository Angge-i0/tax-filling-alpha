import { useState, useEffect, useRef } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { apiGet, apiPost } from './api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

export default function MainDashboard({ isStaff }) {
  const [stats, setStats] = useState(null);
  const [landuse, setLanduse] = useState(null);
  const [issues, setIssues] = useState([]);
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef(null);

  useEffect(() => {
    apiGet('/api/dashboard/stats/').then(r => r.json()).then(setStats);
    apiGet('/api/dashboard/landuse/').then(r => r.json()).then(setLanduse);
    if (isStaff) fetchIssues();
  }, [isStaff]);

  // Re-fetch issues every 30 seconds to auto-remove solved ones
  useEffect(() => {
    if (!isStaff) return;
    const id = setInterval(fetchIssues, 30000);
    return () => clearInterval(id);
  }, [isStaff]);

  const fetchIssues = () => {
    apiGet('/api/dashboard/issues/').then(r => r.json()).then(d => setIssues(d.issues || []));
  };

  const markSolved = async (issueId) => {
    await apiPost(`/api/dashboard/issues/${issueId}/solve/`, {});
    fetchIssues();
  };

  // ── Chart data ──
  const barData = landuse ? {
    labels: landuse.labels,
    datasets: [{
      label: 'Number of Lots/Parcels',
      data: landuse.values,
      backgroundColor: [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
      ],
      borderRadius: 6,
    }]
  } : null;

  const pieData = landuse ? {
    labels: landuse.labels,
    datasets: [{
      data: landuse.values,
      backgroundColor: [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
      ],
      borderWidth: 2,
      borderColor: '#ffffff',
    }]
  } : null;

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, title: { display: true, text: 'Land Use Distribution', font: { size: 14, weight: '700' }, color: '#1e3a5f' } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { maxRotation: 45, minRotation: 0, font: { size: 10 } } } }
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } }, title: { display: true, text: 'Land Use Share', font: { size: 14, weight: '700' }, color: '#1e3a5f' } }
  };

  // ── Export functions ──
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setTextColor(15, 29, 53);
    doc.text('San Pascual E-TaxMap — Issues Report', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Municipality of San Pascual, Batangas`, 14, 34);

    const rows = issues.map((iss, i) => [
      i + 1,
      iss.description,
      iss.status === 'solved' ? 'SOLVED' : 'UNSOLVED'
    ]);

    autoTable(doc, {
      startY: 42,
      head: [['#', 'Issue Description', 'Status']],
      body: rows,
      headStyles: { fillColor: [15, 29, 53], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 244, 248] },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 28 } },
    });

    doc.save('ETaxMap_Issues_Report.pdf');
  };

  const exportExcel = () => {
    const data = issues.map((iss, i) => ({
      '#': i + 1,
      'Issue Description': iss.description,
      'Status': iss.status === 'solved' ? 'SOLVED' : 'UNSOLVED'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Issues');
    XLSX.writeFile(wb, 'ETaxMap_Issues_Report.xlsx');
  };

  const statCards = [
    { label: 'Total Barangays', value: stats?.total_barangays ?? '—', icon: '🏘️', color: '#3b82f6' },
    { label: 'Total Sections', value: stats?.total_sections ?? '—', icon: '📐', color: '#10b981' },
    { label: 'Total Lots / Parcels', value: stats?.total_lots ?? '—', icon: '📋', color: '#f59e0b' },
  ];
  if (isStaff) {
    statCards.push({ label: 'Issues Found', value: stats?.total_issues ?? '—', icon: '⚠️', color: '#ef4444' });
  }

  return (
    <div className="md-page">
      <h1 className="md-title">Main Dashboard</h1>
      <p className="md-subtitle">Municipality of San Pascual, Batangas — E-TaxMap Overview</p>

      {/* Stat cards */}
      <div className="md-cards">
        {statCards.map(c => (
          <div key={c.label} className="md-card" style={{ borderTopColor: c.color }}>
            <div className="md-card-icon">{c.icon}</div>
            <div className="md-card-value">{typeof c.value === 'number' ? c.value.toLocaleString() : c.value}</div>
            <div className="md-card-label">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="md-charts">
        <div className="md-chart-box">
          {barData && <Bar data={barData} options={barOptions} />}
        </div>
        <div className="md-chart-box">
          {pieData && <Pie data={pieData} options={pieOptions} />}
        </div>
      </div>

      {/* Issues table (Admin only) */}
      {isStaff && (
        <>
          <div className="md-section-header">
            <h2 className="md-section-title">Issues Found</h2>
            <div className="md-section-actions">
              <button className="md-btn-secondary" onClick={() => setShowReport(true)}>📊 Reports & Analytics</button>
            </div>
          </div>

          <div className="md-table-wrap">
            <table className="md-table">
              <thead>
                <tr><th>ISSUE DESCRIPTION</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                {issues.length === 0 && (
                  <tr><td colSpan={2} style={{ textAlign: 'center', padding: '24px', color: '#999' }}>No issues found.</td></tr>
                )}
                {issues.map(iss => (
                  <tr key={iss.id}>
                    <td>{iss.description}</td>
                    <td>
                      {iss.status === 'solved' ? (
                        <span className="md-badge solved">SOLVED</span>
                      ) : (
                        <span className="md-badge unsolved" onClick={() => markSolved(iss.id)} title="Click to mark as solved" style={{ cursor: 'pointer' }}>
                          UNSOLVED
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Reports modal */}
      {showReport && (
        <div className="md-report-overlay" onClick={() => setShowReport(false)}>
          <div className="md-report-modal" onClick={e => e.stopPropagation()}>
            <div className="md-report-header">
              <h3>Reports & Analytics — Issues</h3>
              <button className="md-report-close" onClick={() => setShowReport(false)}>✕</button>
            </div>
            <div className="md-report-actions">
              <button className="md-btn-primary" onClick={exportPDF}>📄 Export as PDF</button>
              <button className="md-btn-primary" onClick={exportExcel}>📊 Export as Excel</button>
            </div>
            {/* A4 Preview */}
            <div className="md-a4-preview" ref={reportRef}>
              <div className="md-a4-header">
                <h2>San Pascual E-TaxMap</h2>
                <p>Electronic Tax Mapping System · Municipality of San Pascual, Batangas</p>
                <p className="md-a4-date">Report generated: {new Date().toLocaleString()}</p>
              </div>
              <h3 className="md-a4-section-title">Issues Report</h3>
              <p className="md-a4-summary">Total issues: {issues.length} &nbsp;|&nbsp; Unsolved: {issues.filter(i => i.status === 'unsolved').length} &nbsp;|&nbsp; Solved: {issues.filter(i => i.status === 'solved').length}</p>
              <table className="md-a4-table">
                <thead><tr><th>#</th><th>Issue Description</th><th>Status</th></tr></thead>
                <tbody>
                  {issues.map((iss, i) => (
                    <tr key={iss.id}>
                      <td>{i + 1}</td>
                      <td>{iss.description}</td>
                      <td className={iss.status === 'solved' ? 'solved-text' : 'unsolved-text'}>
                        {iss.status === 'solved' ? 'SOLVED' : 'UNSOLVED'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
