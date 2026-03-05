import { useState, useEffect } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { apiGet } from './api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

export default function UserDashboard() {
    const [stats, setStats] = useState(null);
    const [landuse, setLanduse] = useState(null);

    useEffect(() => {
        apiGet('/api/dashboard/stats/').then(r => r.json()).then(setStats);
        apiGet('/api/dashboard/landuse/').then(r => r.json()).then(setLanduse);
    }, []);

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

    const statCards = [
        { label: 'Total Barangays', value: stats?.total_barangays ?? '—', icon: '🏘️', color: '#3b82f6' },
        { label: 'Total Sections', value: stats?.total_sections ?? '—', icon: '📐', color: '#10b981' },
        { label: 'Total Lots / Parcels', value: stats?.total_lots ?? '—', icon: '📋', color: '#f59e0b' },
    ];

    return (
        <div className="md-page">
            <h1 className="md-title">Dashboard</h1>
            <p className="md-subtitle">Municipality of San Pascual, Batangas — E-TaxMap Overview</p>

            <div className="md-cards">
                {statCards.map(c => (
                    <div key={c.label} className="md-card" style={{ borderTopColor: c.color }}>
                        <div className="md-card-icon">{c.icon}</div>
                        <div className="md-card-value">{typeof c.value === 'number' ? c.value.toLocaleString() : c.value}</div>
                        <div className="md-card-label">{c.label}</div>
                    </div>
                ))}
            </div>

            <div className="md-charts">
                <div className="md-chart-box">
                    {barData && <Bar data={barData} options={barOptions} />}
                </div>
                <div className="md-chart-box">
                    {pieData && <Pie data={pieData} options={pieOptions} />}
                </div>
            </div>
        </div>
    );
}
