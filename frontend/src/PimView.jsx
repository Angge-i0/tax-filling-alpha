import { useState, useEffect, useMemo, useRef } from 'react';
import { apiGet, getAccessToken, clearTokens } from './api';
import MapComponent from './MapComponent';

// Complete list of all barangays in San Pascual
const ALL_BARANGAYS = [
    'Alalum', 'Antipolo', 'Balimbing', 'Banaba', 'Bayanan', 'Danglayan',
    'Del Pilar', 'Gelerang Kawayan', 'Ilat North', 'Ilat South', 'Kaingin',
    'Laurel', 'Malaking Pook', 'Mataas na Lupa', 'Natunuan North',
    'Natunuan South', 'Padre Castillo', 'Palsahingin', 'Pila', 'Poblacion',
    'Pook ni Banal', 'Pook ni Kapitan', 'Resplandor', 'Sambat', 'San Antonio',
    'San Mariano', 'San Mateo', 'Sta. Elena', 'Sto. Nino'
];

export default function PimView({ isStaff, geoData }) {
    // Navigation State
    const [barangayList, setBarangayList] = useState([]);
    const [selectedBarangay, setSelectedBarangay] = useState(null);
    const [selectedSection, setSelectedSection] = useState(null);
    const [selectedLot, setSelectedLot] = useState(null);

    // Map Data State
    const [barangayGeoData, setBarangayGeoData] = useState(null);
    const [sectionGeoData, setSectionGeoData] = useState(null);
    const [lotGeoData, setLotGeoData] = useState(null);
    const [enlargementData, setEnlargementData] = useState(null);

    // Lists & Metadata
    const [sectionList, setSectionList] = useState([]);
    const [error, setError] = useState(null);
    const [showEnlargementMap, setShowEnlargementMap] = useState(false);
    const [refinementLevel, setRefinementLevel] = useState(0.75);

    // Base map bounds reference
    const [mapCenter, setMapCenter] = useState([13.79, 121.0]);

    // Caching and Loading States
    const barangayDataCache = useRef({});
    const sectionListCache = useRef({});
    const lotDataCache = useRef({});
    const [isLoadingBarangay, setIsLoadingBarangay] = useState(false);
    const [isLoadingSection, setIsLoadingSection] = useState(false);

    // Load Barangay List on Mount
    useEffect(() => {
        apiGet('/api/pim/barangays/')
            .then(res => {
                if (res.status === 401) throw new Error('Session expired');
                return res.json();
            })
            .then(data => {
                const pimBarangays = data.barangays || [];

                // Create a complete list with all barangays
                const completeList = ALL_BARANGAYS.map(name => {
                    const pimData = pimBarangays.find(b => b.name === name);
                    return {
                        name: name,
                        has_data: pimData ? pimData.has_data : false,
                        section_count: pimData ? pimData.section_count : 0
                    };
                });

                setBarangayList(completeList);
            })
            .catch(err => setError(String(err)));
    }, []);

    // When a Barangay is selected
    useEffect(() => {
        if (!selectedBarangay) {
            setBarangayGeoData(null);
            setSectionList([]);
            setSectionGeoData(null);
            setError(null); // Clear error when deselecting
            return;
        }

        // Clear error when switching to a new barangay
        setError(null);

        // Clear previous data immediately for instant visual feedback
        setSectionGeoData(null);
        setLotGeoData(null);
        setShowEnlargementMap(false);

        // Check cache first
        if (barangayDataCache.current[selectedBarangay]) {
            // Load from cache instantly
            setBarangayGeoData(barangayDataCache.current[selectedBarangay]);
        } else {
            // Clear old barangay data while loading new one
            setBarangayGeoData(null);
            setIsLoadingBarangay(true);
            // Load dissolved section polygons (Barangay view)
            apiGet(`/api/pim/barangays/${selectedBarangay}/geojson/`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    // Cache the data
                    barangayDataCache.current[selectedBarangay] = data;
                    setBarangayGeoData(data);
                    setIsLoadingBarangay(false);
                })
                .catch(err => {
                    setError(String(err));
                    setIsLoadingBarangay(false);
                });
        }

        // Load section list metadata (with caching)
        if (sectionListCache.current[selectedBarangay]) {
            setSectionList(sectionListCache.current[selectedBarangay]);
        } else {
            apiGet(`/api/pim/barangays/${selectedBarangay}/sections/`)
                .then(res => res.json())
                .then(data => {
                    const sections = data.sections || [];
                    sectionListCache.current[selectedBarangay] = sections;
                    setSectionList(sections);
                })
                .catch(err => console.error(err));
        }
    }, [selectedBarangay]);

    // When a Section is selected
    useEffect(() => {
        if (selectedSection === null || !selectedBarangay) {
            setSectionGeoData(null);
            setLotGeoData(null);
            return;
        }

        // Clear error when selecting a section
        setError(null);

        // Clear previous lot selection once a new section is picked
        setSelectedLot(null);
        setShowEnlargementMap(false);

        const cacheKey = `${selectedBarangay}-${selectedSection}`;

        // Check cache first
        if (lotDataCache.current[cacheKey]) {
            setLotGeoData(lotDataCache.current[cacheKey]);
        } else {
            setIsLoadingSection(true);
            // Load lots for this section
            apiGet(`/api/pim/barangays/${selectedBarangay}/sections/${selectedSection}/lots/`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    // Cache the data
                    lotDataCache.current[cacheKey] = data;
                    setLotGeoData(data);
                    setSelectedLot(null);
                    setShowEnlargementMap(false);
                    setIsLoadingSection(false);
                })
                .catch(err => {
                    setError(String(err));
                    setIsLoadingSection(false);
                });
        }

    }, [selectedSection, selectedBarangay]);

    const loadEnlargementForSection = (sectionNum, lotFeature = null) => {
        if (!selectedBarangay || sectionNum === null) return;
        if (lotFeature) setSelectedLot(lotFeature);
        apiGet(`/api/pim/barangays/${selectedBarangay}/sections/${sectionNum}/enlargement/`)
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                setEnlargementData(data);
                setShowEnlargementMap(true);
            })
            .catch(err => alert("Error loading enlargement: " + String(err)));
    };

    // When Enlargement is requested from details panel
    const handleLoadEnlargement = () => {
        loadEnlargementForSection(selectedSection, selectedLot);
    };

    // When Enlargement is requested from map popup
    const handlePopupEnlargement = (feature) => {
        const sectionNum = feature?.properties?.section_number ?? selectedSection;
        loadEnlargementForSection(sectionNum, feature);
    };

    const handleMapFeatureSelect = (feature) => {
        if (!feature || !feature.properties) return;

        // We are looking at Municipality Level (seeing barangays)
        if (feature.properties.ADM4_EN && !selectedBarangay) {
            setSelectedBarangay(feature.properties.ADM4_EN);
        }
        // Background map click - switch to different barangay
        else if (feature.properties.ADM4_EN && selectedBarangay && feature.properties.ADM4_EN !== selectedBarangay) {
            // Reset section and lot when switching barangays
            setSelectedSection(null);
            setSelectedLot(null);
            setSelectedBarangay(feature.properties.ADM4_EN);
        }
        // We are looking at Barangay Level (seeing sections)
        else if (feature.properties.hasOwnProperty('section_number') && !feature.properties.hasOwnProperty('PIN') && !feature.properties.hasOwnProperty('pin')) {
            setSelectedLot(null); // Clear selected lot when clicking a new section
            setSelectedSection(feature.properties.section_number);
        }
        // We are looking at Section Level (seeing lots)
        else if (feature.properties.hasOwnProperty('PIN') || feature.properties.hasOwnProperty('pin') || feature.properties.hasOwnProperty('owner')) {
            setSelectedLot(feature);
        }
    };

    // Determine which data to feed to MapComponent
    let activeGeoData = null;
    let backgroundGeoData = null;
    let activeLayerKey = 'loading';

    if (!selectedBarangay) {
        // Top-level municipality view
        activeGeoData = geoData;
        backgroundGeoData = null;
        activeLayerKey = 'municipality';
    } else {
        // A barangay is selected!
        backgroundGeoData = geoData; // Always show municipality as grey backdrop

        if (showEnlargementMap && enlargementData) {
            activeGeoData = enlargementData;
            activeLayerKey = 'enlargement';
        } else if (selectedSection !== null && lotGeoData) {
            // Section is selected and lot data is loaded
            activeGeoData = lotGeoData;
            activeLayerKey = 'section-' + selectedSection;
        } else if (selectedSection !== null && isLoadingSection) {
            // Section is selected but lots are still loading - keep showing barangay view
            activeGeoData = barangayGeoData;
            activeLayerKey = 'barangay-' + selectedBarangay + '-loading';
        } else if (selectedSection !== null && !lotGeoData) {
            // Section is selected but no lot data (error or empty) - show barangay view
            activeGeoData = barangayGeoData;
            activeLayerKey = 'barangay-' + selectedBarangay;
        } else if (barangayGeoData) {
            // Just barangay view
            activeGeoData = barangayGeoData;
            activeLayerKey = 'barangay-' + selectedBarangay;
        } else {
            // Data is either still loading, or this barangay has no sections yet.
            activeGeoData = null;
            activeLayerKey = 'empty-or-loading';
        }
    }

    const activeFeature = selectedLot || null;

    // --- Computation Engine ---
    const safeNum = (val) => {
        if (val === null || val === undefined || isNaN(val)) return 0;
        return Number(val);
    };

    const computedTax = useMemo(() => {
        if (!selectedLot || !selectedLot.properties) return null;
        const p = selectedLot.properties;

        // Determination of adjustment rate
        // We use refinementLevel state, but ensure it's valid for this lot
        const canUseRRW = safeNum(p.area_rrw) > 0;
        const adjustmentRate = (refinementLevel === 0.50 && !canUseRRW) ? 0.75 : refinementLevel;

        // Base values per land use (San Pascual defaults)
        let unitValue = 1000;       // standard
        let assessmentLevel = 0.20; // default (residential)

        // Automatic Land Use Logic
        if (safeNum(p.area_comml) > 0) {
            unitValue = 2500;
            assessmentLevel = 0.50;
        } else if (safeNum(p.area_indl) > 0) {
            unitValue = 3000;
            assessmentLevel = 0.50;
        } else if (safeNum(p.area_agri) > 0) {
            unitValue = 500;
            assessmentLevel = 0.40;
        }

        const totalArea = safeNum(p.area_res) + safeNum(p.area_agri) + safeNum(p.area_indl) + safeNum(p.area_comml);

        const marketValue = totalArea * unitValue * adjustmentRate;
        const assessedValue = marketValue * assessmentLevel;
        const taxRate = 0.02; // 2% RPT
        const rpt = assessedValue * taxRate;

        return {
            adjustmentRate,
            unitValue,
            assessmentLevel,
            taxRate,
            totalArea,
            marketValue,
            assessedValue,
            rpt
        };
    }, [selectedLot, refinementLevel]);

    return (
        <div className="pim-layout" style={{ height: '100%', display: 'flex' }}>
            {/* LEFT: Barangay Filter Panel */}
            <div className="pim-filter-panel" style={{ width: '250px', background: '#fff', padding: '15px', borderRadius: '12px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflowY: 'auto' }}>
                <h3 style={{ marginTop: 0, color: '#0f1d35', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>Barangays</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {barangayList.map(b => (
                        <button
                            key={b.name}
                            onClick={() => setSelectedBarangay(b.name)}
                            style={{
                                textAlign: 'left', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0',
                                background: selectedBarangay === b.name ? '#ebf4ff' : '#fff',
                                borderColor: selectedBarangay === b.name ? '#3b82f6' : '#e2e8f0',
                                cursor: 'pointer', opacity: b.has_data ? 1 : 0.5
                            }}
                        >
                            <div style={{ fontWeight: 'bold', color: '#1e3a5f' }}>{b.name}</div>
                            {b.has_data ? (
                                <div style={{ fontSize: '0.8em', color: '#64748b' }}>{b.section_count} sections</div>
                            ) : (
                                <div style={{ fontSize: '0.8em', color: '#ef4444', fontStyle: 'italic' }}>⚠ Does not contain data</div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* CENTER: Main Map View */}
            <div className="pim-map-area" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h2 className="pim-view-title" style={{ margin: 0 }}>
                        PIM VIEW {selectedBarangay ? `— ${selectedBarangay}` : ''} {selectedSection ? `(Section ${selectedSection})` : ''}
                        {showEnlargementMap ? ' [ENLARGEMENT]' : ''}
                        {isLoadingBarangay && <span style={{ fontSize: '0.7em', color: '#3b82f6', marginLeft: '10px' }}>Loading...</span>}
                    </h2>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        {selectedBarangay && !selectedSection && (
                            <button
                                onClick={() => { setSelectedBarangay(null); setBarangayGeoData(null); }}
                                style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
                            >
                                Back to Map View
                            </button>
                        )}
                        {selectedSection !== null && (
                            <button
                                onClick={() => { setSelectedSection(null); setLotGeoData(null); setSelectedLot(null); setShowEnlargementMap(false); }}
                                style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
                            >
                                Back to Sections
                            </button>
                        )}
                        {showEnlargementMap && (
                            <button
                                onClick={() => setShowEnlargementMap(false)}
                                style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
                            >
                                Close Enlargement
                            </button>
                        )}
                    </div>
                </div>

                <div className="map-view" data-blurred={!!selectedBarangay} style={{ flex: 1, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0, 0, 0, 0.06)', position: 'relative' }}>
                    {(isLoadingBarangay || isLoadingSection) && (
                        <div style={{
                            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                            zIndex: 1000, background: 'rgba(255,255,255,0.9)', padding: '20px 40px',
                            borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            fontSize: '1.1em', fontWeight: 'bold', color: '#1e3a5f'
                        }}>
                            Loading map data...
                        </div>
                    )}
                    <MapComponent
                        geoData={activeGeoData}
                        error={error}
                        onFeatureSelect={handleMapFeatureSelect}
                        onEnlargementRequest={handlePopupEnlargement}
                        selectedFeature={activeFeature}
                        backgroundGeoData={backgroundGeoData}
                        layerKey={activeLayerKey}
                    />
                </div>
            </div>

            {/* RIGHT: Detail & Lot List Panel */}
            <div className="pim-details" style={{ width: '320px', background: '#fff', borderRadius: '12px', padding: '20px', overflowY: 'auto', boxShadow: '0 1px 6px rgba(0, 0, 0, 0.06)' }}>

                {/* If Section is selected, show Lot Details or Lot List */}
                {selectedSection !== null ? (
                    <>
                        {selectedLot && lotGeoData?.features ? (
                            <div className="lot-details">
                                <button
                                    onClick={() => setSelectedLot(null)}
                                    style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '0 0 15px 0', fontWeight: 'bold' }}
                                >
                                    &larr; Back to Lots
                                </button>

                                <div className="lot-details-grid">
                                    <div className="lot-detail-field full">
                                        <label>LOT / PARCEL</label>
                                        <select 
                                            value={lotGeoData.features.indexOf(selectedLot)} 
                                            onChange={(e) => setSelectedLot(lotGeoData.features[e.target.value])}
                                            className="lot-select"
                                        >
                                            {lotGeoData.features.map((f, idx) => (
                                                <option key={idx} value={idx}>
                                                    Lot {String(f.properties.pin || '').split('-').pop() || (idx + 1)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="lot-detail-field full">
                                        <label>MUNICIPALITY</label>
                                        <div className="lot-val-box">San Pascual, Batangas</div>
                                    </div>

                                    <div className="lot-detail-field-half">
                                        <label>BARANGAY</label>
                                        <div className="lot-val-box">{selectedBarangay}</div>
                                    </div>

                                    <div className="lot-detail-field-half">
                                        <label>SECTION #</label>
                                        <div className="lot-val-box">Section {selectedSection}</div>
                                    </div>

                                    <div className="lot-detail-card">
                                        <label>OWNER</label>
                                        <div className="lot-card-val">{selectedLot.properties?.owner || 'N/A'}</div>
                                    </div>

                                    <div className="lot-detail-card">
                                        <label>PIN</label>
                                        <div className="lot-card-val highlight">{selectedLot.properties?.pin || 'N/A'}</div>
                                    </div>

                                    <div className="lot-detail-card full">
                                        <label>ADDRESS</label>
                                        <div className="lot-card-val small">{selectedLot.properties?.address || `Lot ${String(selectedLot.properties?.pin || '').split('-').pop() || '?'}, Sec. ${selectedSection}, Brgy. ${selectedBarangay}, San Pascual, Batangas`}</div>
                                    </div>

                                    <div className="lot-detail-card">
                                        <label>LAND USE</label>
                                        <div className="lot-card-val landuse">
                                            {(() => {
                                                const p = selectedLot.properties;
                                                const uses = [];
                                                if (safeNum(p.area_res) > 0) uses.push('Residential');
                                                if (safeNum(p.area_agri) > 0) uses.push('Agricultural');
                                                if (safeNum(p.area_comml) > 0) uses.push('Commercial');
                                                if (safeNum(p.area_indl) > 0) uses.push('Industrial');
                                                return uses.join(', ') || 'Rural/Open';
                                            })()}
                                        </div>
                                    </div>

                                    <div className="lot-detail-card">
                                        <label>ARP NO.</label>
                                        <div className="lot-card-val">{selectedLot.properties?.arp_no || 'N/A'}</div>
                                    </div>

                                    <div className="lot-detail-card">
                                        <label>PREV. ARP NO.</label>
                                        <div className="lot-card-val">{selectedLot.properties?.prev_arp_no || 'N/A'}</div>
                                    </div>

                                    <div className="lot-detail-card">
                                        <label>AREA PER SQM</label>
                                        <div className="lot-card-val">{computedTax?.totalArea?.toFixed(2) || '0.00'} sqm</div>
                                    </div>

                                    <div className="lot-detail-card full specialty">
                                        <label>ADJUSTMENT LEVEL</label>
                                        <div className="adj-buttons">
                                            <button 
                                                className={refinementLevel === 0.75 ? 'active' : ''} 
                                                onClick={() => setRefinementLevel(0.75)}
                                            >75%</button>
                                            <button 
                                                className={refinementLevel === 0.85 ? 'active' : ''} 
                                                onClick={() => setRefinementLevel(0.85)}
                                            >85%</button>
                                            {safeNum(selectedLot.properties.area_rrw) > 0 && (
                                                <button 
                                                    className={refinementLevel === 0.50 ? 'active' : ''} 
                                                    onClick={() => setRefinementLevel(0.50)}
                                                >50% (RRW)</button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="lot-detail-card highlight-green">
                                        <label>MARKET VALUE</label>
                                        <div className="lot-card-val primary">₱{computedTax?.marketValue?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</div>
                                    </div>

                                    <div className="lot-detail-card highlight-blue">
                                        <label>ASSESSED VALUE</label>
                                        <div className="lot-card-val secondary">₱{computedTax?.assessedValue?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</div>
                                    </div>

                                    <div className="lot-detail-card highlight-navy">
                                        <label>RPT</label>
                                        <div className="lot-card-val secondary">₱{computedTax?.rpt?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</div>
                                    </div>

                                    {/* Enlargement Action */}
                                    {selectedLot?.properties?.has_enlargement && (
                                        <div className="lot-enlargement-box">
                                            <p className="enlarge-text">Shape mismatch detected. Enlargement available.</p>
                                            <button onClick={handleLoadEnlargement} className="enlarge-btn">
                                                SEE ENLARGEMENT
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="section-lots-list">
                                <h3 style={{ margin: '0 0 15px 0', color: '#0f1d35' }}>Section {selectedSection} Lots</h3>
                                {isLoadingSection ? (
                                    <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>Loading lots...</div>
                                ) : lotGeoData && lotGeoData.features && lotGeoData.features.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {lotGeoData.features.map((f, i) => (
                                            <button
                                                key={i}
                                                onClick={() => setSelectedLot(f)}
                                                style={{
                                                    textAlign: 'left', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px',
                                                    background: '#fff', cursor: 'pointer', color: '#1e3a5f'
                                                }}
                                            >
                                                {f.properties?.owner || `PIN: ${f.properties?.pin || 'Unknown'}`}
                                                {f.properties?.arp_no && <div style={{ fontSize: '0.8em', color: '#64748b' }}>ARP: {f.properties.arp_no}</div>}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ color: '#64748b', fontStyle: 'italic' }}>No lots available</div>
                                )}
                            </div>
                        )}
                    </>
                ) : selectedBarangay ? (
                    <>
                        <h3 style={{ margin: '0 0 15px 0', color: '#0f1d35' }}>{selectedBarangay} Sections</h3>
                        {isLoadingBarangay ? (
                            <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>Loading sections...</div>
                        ) : sectionList.length === 0 ? (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '40px 20px',
                                textAlign: 'center',
                                color: '#ef4444'
                            }}>
                                <div style={{ fontSize: '3em', marginBottom: '15px' }}>⚠️</div>
                                <div style={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '8px' }}>Error</div>
                                <div style={{ fontSize: '0.9em', fontStyle: 'italic' }}>Does not contain data</div>
                                <div style={{ fontSize: '0.75em', color: '#94a3b8', marginTop: '15px', lineHeight: '1.5' }}>
                                    This barangay does not have PIM data available yet.
                                </div>
                            </div>
                        ) : (
                            <>
                                <p style={{ fontSize: '0.85em', color: '#64748b' }}>Click a section on the map to view lots.</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    {sectionList.map(s => (
                                        <button
                                            key={s.number}
                                            onClick={() => setSelectedSection(s.number)}
                                            style={{
                                                textAlign: 'left', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px',
                                                background: '#fff', cursor: 'pointer', display: 'flex', justifyContent: 'space-between'
                                            }}
                                        >
                                            <span style={{ fontWeight: 'bold', color: '#1e3a5f' }}>Section {s.number}</span>
                                            <span style={{ fontSize: '0.85em', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '10px' }}>
                                                {s.lot_count} lots
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8' }}>
                        <div style={{ fontSize: '3em', marginBottom: '10px' }}>🗺️</div>
                        <p>Select a barangay to view</p>
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .lot-details-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-top: 10px;
        }
        .lot-detail-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .lot-detail-field.full { width: 100%; }
        .lot-detail-field-half { width: 48%; display: inline-block; vertical-align: top; margin-right: 4%; margin-bottom: 12px; }
        .lot-detail-field-half:last-child { margin-right: 0; }
        
        .lot-detail-field label, .lot-detail-field-half label {
          font-size: 0.7em;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }
        .lot-val-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 8px 12px;
          border-radius: 6px;
          font-weight: 700;
          color: #0f1d35;
          font-size: 0.9em;
        }
        .lot-select {
          width: 100%;
          padding: 10px;
          border-radius: 8px;
          border: 2px solid #3b82f6;
          font-weight: 800;
          color: #1e3a5f;
          background: #fff;
          cursor: pointer;
        }
        .lot-detail-card {
          background: #fff;
          border: 1px solid #f1f5f9;
          padding: 12px;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          display: inline-block;
          width: 48%;
          margin-right: 4%;
          margin-bottom: 8px;
          vertical-align: top;
        }
        .lot-detail-card.full { width: 100%; margin-right: 0; }
        .lot-detail-card:nth-child(even):not(.full) { margin-right: 0; }
        
        .lot-detail-card label {
          font-size: 0.65em;
          font-weight: 800;
          color: #94a3b8;
          display: block;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        .lot-card-val {
          font-weight: 700;
          color: #1e3a5f;
          font-size: 0.95em;
          word-break: break-word;
        }
        .lot-card-val.highlight { color: #dc2626; }
        .lot-card-val.small { font-size: 0.82em; line-height: 1.4; color: #475569; }
        .lot-card-val.landuse { color: #059669; }
        .lot-card-val.primary { color: #dc2626; font-size: 1.3em; }
        .lot-card-val.secondary { color: #1e3a5f; font-size: 1.15em; }
        
        .highlight-green { border-left: 4px solid #10b981; background: #f0fdf4 !important; }
        .highlight-blue { border-left: 4px solid #3b82f6; background: #eff6ff !important; }
        .highlight-navy { border-left: 4px solid #0f1d35; background: #f8fafc !important; }
        
        .adj-buttons { display: flex; gap: 6px; margin-top: 8px; }
        .adj-buttons button {
          flex: 1;
          padding: 8px 4px;
          font-size: 0.75em;
          font-weight: 800;
          border: 1px solid #cbd5e1;
          background: #fff;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .adj-buttons button.active {
          background: #1e3a5f;
          color: #fff;
          border-color: #1e3a5f;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .lot-enlargement-box {
          margin-top: 15px;
          padding: 15px;
          background: #fffbeb;
          border: 1px solid #fcd34d;
          border-radius: 10px;
          text-align: center;
          width: 100%;
        }
        .enlarge-text { font-size: 0.8em; color: #92400e; margin-bottom: 12px; font-weight: 700; }
        .enlarge-btn {
          width: 100%;
          padding: 10px;
          background: #d97706;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.2s;
        }
        .enlarge-btn:hover { background: #b45309; }
      `}} />
        </div>
    );
}
