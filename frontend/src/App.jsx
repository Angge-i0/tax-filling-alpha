import { useState, useEffect, useMemo } from 'react'
import { Bell, X, Trash2 } from 'lucide-react'
import Sidebar from './Sidebar'
import LoginModal from './LoginModal'
import MainDashboard from './MainDashboard'
import AdminDashboard from './AdminDashboard'
import FAQs from './FAQs'
import AboutCredits from './AboutCredits'
import MapComponent from './MapComponent'
import PimView from './PimView';
import { Search } from 'lucide-react';
import { apiGet, apiPost, apiDelete, clearTokens, getAccessToken, getRefreshToken } from './api'
import './App.css'
import ErrorBoundary from './ErrorBoundary'

const CAD_BARANGAYS = [
  'Alalum', 'Antipolo', 'Balimbing', 'Banaba', 'Bayanan', 'Danglayan',
  'Del Pilar', 'Gelerang Kawayan', 'Ilat North', 'Ilat South', 'Kaingin',
  'Laurel', 'Malaking Pook', 'Mataas na Lupa', 'Natunuan North', 'Natunuan South',
  'Padre Castillo', 'Palsahingin', 'Pila', 'Poblacion', 'Pook ni Banal',
  'Pook ni Kapitan', 'Resplandor', 'Sambat', 'San Antonio', 'San Mariano',
  'San Mateo', 'Sta. Elena', 'Sto. Nino'
];

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(null)
  const [user, setUser] = useState(null)
  const [fullName, setFullName] = useState(null)
  const [isStaff, setIsStaff] = useState(false)
  const [activePage, setActivePage] = useState('dashboard')
  const [pimHeaderTitle, setPimHeaderTitle] = useState('San Pascual Overview')
  // Global Search
  const [searchBrgy, setSearchBrgy] = useState('');
  const [searchPin, setSearchPin] = useState('');

  // Map state (for PIM view)
  const [geoData, setGeoData] = useState(null)
  const [cadGeoData, setCadGeoData] = useState(null)
  const [error, setError] = useState(null)

  // Notifications
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = () => {
    if (!isAuthenticated) return;
    apiGet('/api/auth/notifications/')
      .then(r => r.json())
      .then(data => {
        const notes = data.notifications || [];
        setNotifications(notes);
        setUnreadCount(notes.filter(n => !n.is_read).length);
      })
      .catch(err => console.error("Notif error:", err));
  };

  useEffect(() => {
    if (!getAccessToken()) {
      setIsAuthenticated(false)
      return
    }
    apiGet('/api/auth/check/')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setIsAuthenticated(true)
          setUser(data.username)
          setFullName(data.full_name)
          setIsStaff(data.is_staff)
          fetchNotifications();
        } else {
          clearTokens()
          setIsAuthenticated(false)
        }
      })
      .catch(() => {
        clearTokens()
        setIsAuthenticated(false)
      })
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 15000); // Polling every 15s
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const markAllAsRead = async () => {
    try {
      const res = await apiPost('/api/auth/notifications/', {});
      if (res.ok) {
        setUnreadCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteNotif = async (e, id) => {
    e.stopPropagation();
    try {
      const res = await apiDelete(`/api/auth/notifications/${id}/`);
      if (res.ok) {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Clear all notification history?")) return;
    try {
      const res = await apiDelete('/api/auth/notifications/');
      if (res.ok) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch GeoJSON when navigating to PIM
  useEffect(() => {
    if (!isAuthenticated || activePage !== 'map-pim') return
    if (geoData) return // already loaded

    apiGet('/api/geojson/')
      .then(res => {
        if (res.status === 401) {
          clearTokens()
          setIsAuthenticated(false)
          setUser(null)
          throw new Error('Session expired.')
        }
        return res.json()
      })
      .then(data => setGeoData(data))
      .catch(err => {
        console.error('Failed to load geojson:', err)
        setError(err.message || String(err))
      })
  }, [isAuthenticated, activePage, geoData])

  // Fetch CAD GeoJSON when navigating to CAD
  useEffect(() => {
    if (!isAuthenticated || activePage !== 'map-cad') return
    if (cadGeoData) return

    apiGet('/api/cad/geojson/')
      .then(res => {
        if (res.status === 401) {
          clearTokens()
          setIsAuthenticated(false)
          setUser(null)
          throw new Error('Session expired.')
        }
        if (!res.ok) throw new Error(`Server responded ${res.status}`)
        return res.json()
      })
      .then(data => {
        setCadGeoData(data)
      })
      .catch(err => {
        console.error('Failed to load CAD geojson:', err)
        setError(err.message || String(err))
      })
  }, [isAuthenticated, activePage, cadGeoData])

  // Auto-switch to Map View when a valid Barangay is typed in the search bar
  useEffect(() => {
    const query = (searchBrgy || '').trim().toLowerCase();
    if (query.length < 3) return;
    
    const isMatch = CAD_BARANGAYS.some(b => b.toLowerCase() === query);
    if (isMatch && activePage === 'dashboard') {
      setActivePage('map-pim');
    }
  }, [searchBrgy]);


  const handleLoginSuccess = (username, staffFlag, fullNameProp) => {
    setIsAuthenticated(true)
    setUser(username)
    setFullName(fullNameProp)
    setIsStaff(!!staffFlag)
    setActivePage('dashboard')
  }

  const handleLogout = async () => {
    try {
      if (getRefreshToken()) {
        await apiPost('/api/auth/logout/', { refresh: getRefreshToken() })
      }
    } catch (err) {
      console.error('Logout failed:', err)
    } finally {
      localStorage.setItem('last_role', isStaff ? 'admin' : 'user')
      clearTokens()
      setIsAuthenticated(false)
      setUser(null)
      setFullName(null)
      setIsStaff(false)
      setGeoData(null)
      setError(null)
      setActivePage('dashboard')
    }
  }

  // ── Loading ──
  if (isAuthenticated === null) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', backgroundColor: '#f0f4f8', color: '#1e3a5f',
        fontSize: '1em', fontFamily: 'inherit',
      }}>
        Loading...
      </div>
    )
  }

  // ── Not logged in ──
  if (!isAuthenticated) {
    const lastRole = localStorage.getItem('last_role') || 'user'
    return <LoginModal onLoginSuccess={handleLoginSuccess} initialRole={lastRole} />
  }

  // ── Logged-in layout ──
  const displayUser = fullName || user || 'User'
  const avatarLetter = displayUser ? displayUser[0].toUpperCase() : 'U'
  const pageTitle = {
    'dashboard': 'Dashboard',
    'map-cad': 'CADASTRAL Map Overview',
    'map-pim': pimHeaderTitle,
    'faqs': 'FAQs',
    'about': 'About & Credits',
  }[activePage] || 'Dashboard'

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <MainDashboard isStaff={isStaff} searchBrgy={searchBrgy} searchPin={searchPin} />
      case 'map-pim':
        return <PimView isStaff={isStaff} geoData={geoData} onHeaderTitleChange={setPimHeaderTitle} searchBrgy={searchBrgy} searchPin={searchPin} />
      case 'map-cad':
        return (
          <CadMap
            geoData={cadGeoData}
            error={error}
            isStaff={isStaff}
            searchBrgy={searchBrgy}
          />
        )
      case 'faqs':
        return <FAQs />
      case 'about':
        return <AboutCredits />
      default:
        return <MainDashboard isStaff={isStaff} />
    }
  }

  return (
    <div className="app-root">
      <Sidebar
        isStaff={isStaff}
        activePage={activePage}
        onNavigate={setActivePage}
        onLogout={handleLogout}
      />
      <div className="main-layout">
        {/* Header */}
        <div className="app-header">
          <div className="header-left">
            <div className="header-page-title">{pageTitle}</div>
          </div>
          <div className="header-search-nav">
             <div className="header-search-field">
                <Search size={14} className="h-search-icon" />
                <input 
                  type="text" 
                  placeholder="Brgy..." 
                  value={searchBrgy} 
                  onChange={e => setSearchBrgy(e.target.value)}
                  className="h-search-input"
                />
             </div>
             <div className="header-search-divider" />
             <div className="header-search-field">
                <input 
                  type="text" 
                  placeholder="PIN..." 
                  value={searchPin} 
                  onChange={e => setSearchPin(e.target.value)}
                  className="h-search-input"
                />
             </div>
          </div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {/* Notification Bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                style={{
                  background: 'none', border: 'none', color: '#1e3a5f',
                  cursor: 'pointer', padding: '8px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseOut={(e) => e.currentTarget.style.background = 'none'}
              >
                <Bell size={22} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: '5px', right: '5px',
                    background: '#ef4444', color: '#fff', fontSize: '10px',
                    fontWeight: 'bold', borderRadius: '10px', padding: '2px 5px',
                    border: '2px solid #fff'
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div style={{
                  position: 'absolute', top: '45px', right: '0',
                  width: '320px', background: '#fff', borderRadius: '12px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.15)', zIndex: 1000,
                  border: '1px solid #e2e8f0', overflow: 'hidden'
                }}>
                  <div style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <span style={{ fontWeight: '700', fontSize: '0.9em', color: '#1e3a5f' }}>Notifications</span>
                    <button onClick={markAllAsRead} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.75em', fontWeight: '600', cursor: 'pointer' }}>Mark all read</button>
                  </div>
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85em' }}>No notifications</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} style={{
                          padding: '12px 15px', borderBottom: '1px solid #f1f5f9',
                          background: n.is_read ? '#fff' : '#f0f7ff',
                          transition: 'background 0.2s',
                          position: 'relative'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontWeight: '600', fontSize: '0.85em', color: '#1e293b', marginBottom: '3px', paddingRight: '20px' }}>{n.title}</div>
                            <button
                              onClick={(e) => handleDeleteNotif(e, n.id)}
                              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0', display: 'flex' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <div style={{ fontSize: '0.8em', color: '#475569', lineHeight: '1.4' }}>{n.message}</div>
                          <div style={{ fontSize: '0.7em', color: '#94a3b8', marginTop: '6px' }}>{new Date(n.created_at).toLocaleString()}</div>
                        </div>
                      ))
                    )}
                  </div>
                  {notifications.length > 0 && (
                    <div style={{ padding: '10px', borderTop: '1px solid #e2e8f0', textAlign: 'center', background: '#f8fafc' }}>
                      <button
                        onClick={handleClearAll}
                        style={{
                          background: 'none', border: 'none', color: '#ef4444',
                          fontSize: '0.75em', fontWeight: '700', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                          width: '100%'
                        }}
                      >
                        <Trash2 size={14} />
                        Clear all history
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="ad-user-pill">
              <div className="ad-avatar">{avatarLetter}</div>
              <div>
                <div className="ad-username-text">{displayUser}</div>
                <div className="ad-role-label">{isStaff ? 'Administrator' : 'User'}</div>
              </div>
            </div>
          </div>
        </div>
        {/* Content */}
        <div className="content-container" style={{ overflowY: 'auto' }}>
          <ErrorBoundary>
            {renderPage()}
          </ErrorBoundary>
        </div>

        {/* Structural Footer */}
        <div className="md-footer-branding">
          <div className="footer-lgu">LGU: SAN PASCUAL</div>
          <div className="footer-gadc">Developed by the Office of GADC - GIS Applications Development Center</div>
        </div>
      </div>
    </div>
  )
}

// ── CAD Map Side Components ──

function CadMap({ geoData, error, isStaff, searchBrgy = '' }) {
  const [selectedBarangay, setSelectedBarangay] = useState(null)
  const [selectedFeature, setSelectedFeature] = useState(null)

  // Auto-select when searchBrgy exactly matches a barangay
  useEffect(() => {
    const query = (searchBrgy || '').trim().toLowerCase();
    if (!query) return;
    const match = CAD_BARANGAYS.find(b => b.toLowerCase() === query);
    if (match) {
      handleListClick(match);
    }
  }, [searchBrgy]);

  const handleSelect = (feature) => {
    const rawName = (feature?.properties?.ADM4_EN || '').toLowerCase().trim();
    if (!rawName) return;

    // Search for a list item that matches or contains the geojson name
    const match = CAD_BARANGAYS.find(n => {
      const ln = n.toLowerCase().trim();
      return ln === rawName || ln.includes(rawName) || rawName.includes(ln);
    });

    setSelectedBarangay(match || feature?.properties?.ADM4_EN);
    setSelectedFeature(feature);
  };

  const handleListClick = (name) => {
    if (!geoData) return;
    const ln = (name || '').toLowerCase().trim();
    const feature = geoData.features.find(f => {
      const fn = (f.properties?.ADM4_EN || '').toLowerCase().trim();
      return fn === ln || fn.includes(ln) || ln.includes(fn);
    });
    if (feature) handleSelect(feature);
  };

  return (
    <div className="cad-page">
      <div className="cad-layout" style={{ gridTemplateColumns: '1fr 30rem', height: '100%' }}>
        <div className="cad-map-area">
          <div className="map-view">
            <MapComponent
              geoData={geoData}
              error={error}
              onFeatureSelect={handleSelect}
              selectedFeature={selectedFeature}
              isCad={true}
              isStatic={false}
              legend={CAD_BARANGAYS}
            />
          </div>
        </div>
        <div className="cad-legend">
          <h3>BARANGAYS</h3>
          <div className="cad-legend-grid">
            {CAD_BARANGAYS
              .filter(b => b.trim().toLowerCase().includes(searchBrgy.trim().toLowerCase()))
              .map(b => (
              <div
                key={b}
                onClick={() => handleListClick(b)}
                className={`cad-legend-item ${selectedBarangay === b ? 'active' : ''}`}
                style={{
                  fontWeight: selectedBarangay === b ? '800' : 'normal',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: '3px',
                  background: selectedBarangay === b ? '#e0e7ff' : 'transparent',
                  color: selectedBarangay === b ? '#1e3a5f' : undefined,
                }}
              >
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
