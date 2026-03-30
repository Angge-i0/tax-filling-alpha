import { useState } from 'react';
import {
    LayoutDashboard, Map, Eye, HelpCircle, Info, LogOut,
    ChevronDown, ChevronRight, BarChart3, Layers, Search
} from 'lucide-react';
import logoImg from './assets/Municipality of San Pascual.jpg';

export default function Sidebar({ isStaff, activePage, onNavigate, onLogout }) {
    const [dashOpen, setDashOpen] = useState(true);
    const [mapOpen, setMapOpen] = useState(false);

    const handleNav = (page) => {
        onNavigate(page);
    };

    return (
        <div className="sb">
            {/* Logo */}
            <div className="sb-logo">
                <div className="sb-logo-img-container">
                    <img src={logoImg} alt="Municipality Logo" className="sb-logo-img" />
                </div>
                <div className="sb-logo-text sb-label">
                    San Pascual, Batangas
                    <div className="sb-logo-sub">E-TAXMAP</div>
                </div>
            </div>

            {/* Menu */}
            <nav className="sb-nav">
                {/* ── Dashboard group ── */}
                <button className={`sb-item sb-group-toggle ${dashOpen ? 'open' : ''}`} onClick={() => setDashOpen(!dashOpen)}>
                    <LayoutDashboard size={20} className="sb-icon" />
                    <span className="sb-label">Dashboard</span>
                    <span className="sb-arrow sb-label">{dashOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                </button>
                {dashOpen && (
                    <div className="sb-submenu">
                        <button className={`sb-sub-item ${activePage === 'main-dashboard' ? 'active' : ''}`} onClick={() => handleNav('main-dashboard')}>
                            <BarChart3 size={18} className="sb-icon" />
                            <span className="sb-label">Main Dashboard</span>
                        </button>

                    </div>
                )}

                {/* ── Map Overview group ── */}
                <button className={`sb-item sb-group-toggle ${mapOpen ? 'open' : ''}`} onClick={() => setMapOpen(!mapOpen)}>
                    <Map size={20} className="sb-icon" />
                    <span className="sb-label">Map Overview</span>
                    <span className="sb-arrow sb-label">{mapOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                </button>
                {mapOpen && (
                    <div className="sb-submenu">
                        <button className={`sb-sub-item ${activePage === 'map-cad' ? 'active' : ''}`} onClick={() => handleNav('map-cad')}>
                            <Layers size={18} className="sb-icon" />
                            <span className="sb-label">Cadastral Map</span>
                        </button>
                        <button className={`sb-sub-item ${activePage === 'map-pim' ? 'active' : ''}`} onClick={() => handleNav('map-pim')}>
                            <Search size={18} className="sb-icon" />
                            <span className="sb-label">Tax Map</span>
                        </button>
                    </div>
                )}

            </nav>

            {/* Footer */}
            <div className="sb-footer">
                <button className={`sb-item ${activePage === 'faqs' ? 'active' : ''}`} onClick={() => handleNav('faqs')}>
                    <HelpCircle size={20} className="sb-icon" />
                    <span className="sb-label">FAQs</span>
                </button>
                <button className={`sb-item ${activePage === 'about' ? 'active' : ''}`} onClick={() => handleNav('about')}>
                    <Info size={20} className="sb-icon" />
                    <span className="sb-label">About & Credits</span>
                </button>
                <button className="sb-item" onClick={onLogout}>
                    <LogOut size={20} className="sb-icon" />
                    <span className="sb-label">Logout</span>
                </button>
            </div>
        </div>
    );
}
