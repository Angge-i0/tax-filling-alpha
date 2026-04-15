import { useState, useEffect, useMemo } from 'react'
import Sidebar from './Sidebar'
import LoginModal from './LoginModal'
import MainDashboard from './MainDashboard'
import AdminDashboard from './AdminDashboard'
import FAQs from './FAQs'
import AboutCredits from './AboutCredits'
import MapComponent from './MapComponent'
import PimView from './PimView';
import { Search } from 'lucide-react';
import { apiGet, apiPost, clearTokens, getAccessToken, getRefreshToken } from './api'
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
  const [pimHeaderTitle, setPimHeaderTitle] = useState('Barangay Boundary Index Map')
  // Global Search
  const [searchBrgy, setSearchBrgy] = useState('');
  const [searchPin, setSearchPin] = useState('');

  // Map state (for PIM view)
  const [geoData, setGeoData] = useState(null)
  const [cadGeoData, setCadGeoData] = useState(null)
  const [error, setError] = useState(null)

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
    'map-cad': 'Cadastral Map',
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
        <div className={`content-container${activePage === 'dashboard' ? ' content-container-dashboard' : ''}`} style={{ overflowY: 'auto' }}>
          <ErrorBoundary>
            {renderPage()}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
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
