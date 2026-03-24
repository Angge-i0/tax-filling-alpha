import { useState, useEffect, useMemo, useRef } from 'react';
import { apiGet, getAccessToken, clearTokens } from './api';
import MapComponent from './MapComponent';
import { Plus, Minus, Locate } from 'lucide-react';
import L from 'leaflet';

// Complete list of all barangays in San Pascual
const ALL_BARANGAYS = [
    'Alalum', 'Antipolo', 'Balimbing', 'Banaba', 'Bayanan', 'Danglayan',
    'Del Pilar', 'Gelerang Kawayan', 'Ilat North', 'Ilat South', 'Kaingin',
    'Laurel', 'Malaking Pook', 'Mataas na Lupa', 'Natunuan North',
    'Natunuan South', 'Padre Castillo', 'Palsahingin', 'Pila', 'Poblacion',
    'Pook ni Banal', 'Pook ni Kapitan', 'Resplandor', 'Sambat', 'San Antonio',
    'San Mariano', 'San Mateo', 'Sta. Elena', 'Sto. Nino'
];

export default function PimView({ isStaff, geoData, onHeaderTitleChange }) {
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
    const [showBarangayPanel, setShowBarangayPanel] = useState(true);
    const [showDetailsPanel, setShowDetailsPanel] = useState(true);
    const [mapInstance, setMapInstance] = useState(null);

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

    useEffect(() => {
        if (!onHeaderTitleChange) return;
        onHeaderTitleChange(selectedBarangay || 'San Pascual Overview');
    }, [selectedBarangay, onHeaderTitleChange]);

    // When a Barangay is selected
    useEffect(() => {
        if (!selectedBarangay) {
            setBarangayGeoData(null);
            setSectionList([]);
            setSectionGeoData(null);
            setError(null);
            return;
        }

        setError(null);
        setSectionGeoData(null);
        setLotGeoData(null);
        setShowEnlargementMap(false);

        if (barangayDataCache.current[selectedBarangay]) {
            setBarangayGeoData(barangayDataCache.current[selectedBarangay]);
        } else {
            setBarangayGeoData(null);
            setIsLoadingBarangay(true);
            apiGet(`/api/pim/barangays/${selectedBarangay}/geojson/`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    barangayDataCache.current[selectedBarangay] = data;
                    setBarangayGeoData(data);
                    setIsLoadingBarangay(false);
                })
                .catch(err => {
                    setError(String(err));
                    setIsLoadingBarangay(false);
                });
        }

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

        setError(null);
        setSelectedLot(null);
        setShowEnlargementMap(false);

        const cacheKey = `${selectedBarangay}-${selectedSection}`;

        if (lotDataCache.current[cacheKey]) {
            setLotGeoData(lotDataCache.current[cacheKey]);
        } else {
            setIsLoadingSection(true);
            apiGet(`/api/pim/barangays/${selectedBarangay}/sections/${selectedSection}/lots/`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
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

    const handleLoadEnlargement = () => {
        loadEnlargementForSection(selectedSection, selectedLot);
    };

    const handlePopupEnlargement = (feature) => {
        const sectionNum = feature?.properties?.section_number ?? selectedSection;
        loadEnlargementForSection(sectionNum, feature);
    };

    const handleMapFeatureSelect = (feature) => {
        if (!feature || !feature.properties) return;

        if (feature.properties.ADM4_EN && !selectedBarangay) {
            setSelectedBarangay(feature.properties.ADM4_EN);
        }
        else if (feature.properties.ADM4_EN && selectedBarangay && feature.properties.ADM4_EN !== selectedBarangay) {
            setSelectedSection(null);
            setSelectedLot(null);
            setSelectedBarangay(feature.properties.ADM4_EN);
        }
        else if (feature.properties.hasOwnProperty('section_number') && !feature.properties.hasOwnProperty('PIN') && !feature.properties.hasOwnProperty('pin')) {
            setSelectedLot(null);
            setSelectedSection(feature.properties.section_number);
        }
        else if (feature.properties.hasOwnProperty('PIN') || feature.properties.hasOwnProperty('pin') || feature.properties.hasOwnProperty('owner')) {
            setSelectedLot(feature);
        }
    };

    let activeGeoData = null;
    let backgroundGeoData = null;
    let activeLayerKey = 'loading';

    if (!selectedBarangay) {
        activeGeoData = geoData;
        backgroundGeoData = null;
        activeLayerKey = 'municipality';
    } else {
        backgroundGeoData = geoData;
        if (showEnlargementMap && enlargementData) {
            activeGeoData = enlargementData;
            activeLayerKey = 'enlargement';
        } else if (selectedSection !== null && lotGeoData) {
            activeGeoData = lotGeoData;
            activeLayerKey = 'section-' + selectedSection;
        } else if (selectedSection !== null && isLoadingSection) {
            activeGeoData = barangayGeoData;
            activeLayerKey = 'barangay-' + selectedBarangay + '-loading';
        } else if (selectedSection !== null && !lotGeoData) {
            activeGeoData = barangayGeoData;
            activeLayerKey = 'barangay-' + selectedBarangay;
        } else if (barangayGeoData) {
            activeGeoData = barangayGeoData;
            activeLayerKey = 'barangay-' + selectedBarangay;
        } else {
            activeGeoData = null;
            activeLayerKey = 'empty-or-loading';
        }
    }

    const activeFeature = selectedLot || null;

    const handleRecenter = () => {
        if (!mapInstance) return;
        try {
            if (activeGeoData?.features?.length) {
                const bounds = L.geoJSON(activeGeoData).getBounds();
                if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
                    mapInstance.fitBounds(bounds, { padding: [10, 10], duration: 0.25 });
                    return;
                }
            }
        } catch (e) {}
        mapInstance.setView([13.79, 121.0], 13);
    };

    const safeNum = (val) => {
        if (val === null || val === undefined || isNaN(val)) return 0;
        return Number(val);
    };

    const computedTax = useMemo(() => {
        if (!selectedLot || !selectedLot.properties) return null;
        const p = selectedLot.properties;
        const canUseRRW = safeNum(p.area_rrw) > 0;
        const adjustmentRate = (refinementLevel === 0.50 && !canUseRRW) ? 0.75 : refinementLevel;

        let unitValue = 1000;
        let assessmentLevel = 0.20;

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
        const rpt = assessedValue * 0.02;

        return {
            adjustmentRate, unitValue, assessmentLevel, taxRate: 0.02,
            totalArea, marketValue, assessedValue, rpt
        };
    }, [selectedLot, refinementLevel]);

    return (
        <div className="pim-layout" style={{ height: '100%', display: 'flex', position: 'relative' }}>
            {/* LEFT: Barangay Filter Panel */}
            <div className="pim-filter-panel" style={{
                width: '24%',
                maxWidth: '24rem',
                background: '#fff',
                padding: '0.9375rem',
                borderRadius: '0.75rem',
                boxShadow: '0 0.5rem 1.5rem rgba(15,23,42,0.18)',
                overflowY: 'auto',
                position: 'absolute',
                top: '4.5rem',
                left: '0.75rem',
                bottom: '0.75rem',
                zIndex: 950,
                transform: showBarangayPanel ? 'translateX(0)' : 'translateX(-110%)',
                transition: 'transform 0.25s ease'
            }}>
                <h3 style={{ marginTop: 0, color: '#0f1d35', borderBottom: '0.125rem solid #e2e8f0', paddingBottom: '0.625rem' }}>Barangays</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3125rem' }}>
                    {barangayList.map(b => (
                        <button
                            key={b.name}
                            onClick={() => setSelectedBarangay(b.name)}
                            style={{
                                textAlign: 'left', padding: '0.625rem', borderRadius: '0.375rem', border: '0.0625rem solid #e2e8f0',
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
            <div className="pim-map-area" style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '0.625rem' }}>
                    <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
                        <button className="pim-map-ctrl-btn" onClick={() => mapInstance?.zoomIn()} type="button" disabled={!mapInstance}>
                            <Plus size={16} /><span>Zoom In</span>
                        </button>
                        <button className="pim-map-ctrl-btn" onClick={() => mapInstance?.zoomOut()} type="button" disabled={!mapInstance}>
                            <Minus size={16} /><span>Zoom Out</span>
                        </button>
                        <button className="pim-map-ctrl-btn pim-map-ctrl-btn-primary" onClick={handleRecenter} type="button" disabled={!mapInstance}>
                            <Locate size={16} /><span>Recenter</span>
                        </button>
                        <button onClick={() => setShowBarangayPanel(v => !v)} style={{ background: '#0f1d35', color: '#fff', border: '0.0625rem solid #0f1d35', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                            {showBarangayPanel ? 'Hide Barangays' : 'Show Barangays'}
                        </button>
                        <button onClick={() => setShowDetailsPanel(v => !v)} style={{ background: '#0f1d35', color: '#fff', border: '0.0625rem solid #0f1d35', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                            {showDetailsPanel ? 'Hide Details' : 'Show Details'}
                        </button>
                        {selectedBarangay && !selectedSection && (
                            <button onClick={() => { setSelectedBarangay(null); setBarangayGeoData(null); }} style={{ background: '#f8fafc', border: '0.0625rem solid #cbd5e1', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                                Back to Map View
                            </button>
                        )}
                        {selectedSection !== null && !showEnlargementMap && (
                            <button onClick={() => { setSelectedSection(null); setLotGeoData(null); setSelectedLot(null); }} style={{ background: '#f8fafc', border: '0.0625rem solid #cbd5e1', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                                Back to Sections
                            </button>
                        )}
                        {showEnlargementMap && (
                            <button onClick={() => setShowEnlargementMap(false)} style={{ background: '#f8fafc', border: '0.0625rem solid #cbd5e1', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                                Close Enlargement
                            </button>
                        )}
                    </div>
                </div>

                <div className="map-view" data-blurred={!!selectedBarangay} style={{ flex: 1, borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 0.0625rem 0.375rem rgba(0, 0, 0, 0.06)', position: 'relative', minHeight: 0 }}>
                    {(isLoadingBarangay || isLoadingSection) && (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000, background: 'rgba(255,255,255,0.9)', padding: '1.25rem 2.5rem', borderRadius: '0.75rem', boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.15)', fontSize: '1.1em', fontWeight: 'bold', color: '#1e3a5f' }}>
                            Loading map data...
                        </div>
                    )}
                    <MapComponent geoData={activeGeoData} error={error} onFeatureSelect={handleMapFeatureSelect} onEnlargementRequest={handlePopupEnlargement} selectedFeature={activeFeature} backgroundGeoData={backgroundGeoData} isBackgroundInteractive={false} showCustomControls={false} onMapReady={setMapInstance} layerKey={activeLayerKey} />
                </div>
            </div>

            {/* RIGHT: Detail & Lot List Panel */}
            <div className="pim-details" style={{
                width: '30%',
                maxWidth: '28rem',
                background: '#fff',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                overflowY: 'auto',
                boxShadow: '0 0.5rem 1.5rem rgba(15,23,42,0.18)',
                position: 'absolute',
                top: '4.5rem',
                right: '0.75rem',
                bottom: '0.75rem',
                zIndex: 950,
                transform: showDetailsPanel ? 'translateX(0)' : 'translateX(110%)',
                transition: 'transform 0.25s ease'
            }}>
                {selectedSection !== null ? (
                    <>
                        {selectedLot && lotGeoData?.features ? (
                            <div className="lot-details">
                                <button onClick={() => setSelectedLot(null)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '0 0 0.9375rem 0', fontWeight: 'bold' }}>
                                    &larr; Back to Lots
                                </button>
                                <div className="lot-details-grid">
                                    <div className="lot-detail-field full">
                                        <label>LOT / PARCEL</label>
                                        <select value={lotGeoData.features.indexOf(selectedLot)} onChange={(e) => setSelectedLot(lotGeoData.features[e.target.value])} className="lot-select">
                                            {lotGeoData.features.map((f, idx) => (
                                                <option key={idx} value={idx}>Lot {String(f.properties.pin || '').split('-').pop() || (idx + 1)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="lot-detail-field-half"><label>BARANGAY</label><div className="lot-val-box">{selectedBarangay}</div></div>
                                    <div className="lot-detail-field-half"><label>SECTION #</label><div className="lot-val-box">Section {selectedSection}</div></div>
                                    <div className="lot-detail-card"><label>OWNER</label><div className="lot-card-val">{selectedLot.properties?.owner || 'N/A'}</div></div>
                                    <div className="lot-detail-card"><label>PIN</label><div className="lot-card-val highlight">{selectedLot.properties?.pin || 'N/A'}</div></div>
                                    <div className="lot-detail-card full"><label>ADDRESS</label><div className="lot-card-val small">{selectedLot.properties?.address || `Lot ${String(selectedLot.properties?.pin || '').split('-').pop() || '?'}, Sec. ${selectedSection}, Brgy. ${selectedBarangay}, San Pascual, Batangas`}</div></div>
                                    <div className="lot-detail-card"><label>LAND USE</label><div className="lot-card-val landuse">
                                        {(() => {
                                            const p = selectedLot.properties;
                                            const uses = [];
                                            if (safeNum(p.area_res) > 0) uses.push('Residential');
                                            if (safeNum(p.area_agri) > 0) uses.push('Agricultural');
                                            if (safeNum(p.area_comml) > 0) uses.push('Commercial');
                                            if (safeNum(p.area_indl) > 0) uses.push('Industrial');
                                            return uses.join(', ') || 'Rural/Open';
                                        })()}
                                    </div></div>
                                    <div className="lot-detail-card"><label>ARP NO.</label><div className="lot-card-val">{selectedLot.properties?.arp_no || 'N/A'}</div></div>
                                    <div className="lot-detail-card"><label>AREA PER SQM</label><div className="lot-card-val">{computedTax?.totalArea?.toFixed(2) || '0.00'} sqm</div></div>
                                    <div className="lot-detail-card full specialty"><label>ADJUSTMENT LEVEL</label>
                                        <div className="adj-buttons">
                                            <button className={refinementLevel === 0.75 ? 'active' : ''} onClick={() => setRefinementLevel(0.75)}>75%</button>
                                            <button className={refinementLevel === 0.85 ? 'active' : ''} onClick={() => setRefinementLevel(0.85)}>85%</button>
                                            {safeNum(selectedLot.properties.area_rrw) > 0 && <button className={refinementLevel === 0.50 ? 'active' : ''} onClick={() => setRefinementLevel(0.50)}>50% (RRW)</button>}
                                        </div>
                                    </div>
                                    <div className="lot-detail-card highlight-green"><label>MARKET VALUE</label><div className="lot-card-val primary">₱{computedTax?.marketValue?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</div></div>
                                    <div className="lot-detail-card highlight-navy"><label>RPT</label><div className="lot-card-val secondary">₱{computedTax?.rpt?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</div></div>
                                    {selectedLot?.properties?.has_enlargement && (
                                        <div className="lot-enlargement-box">
                                            <p className="enlarge-text">Shape mismatch detected. Enlargement available.</p>
                                            <button onClick={handleLoadEnlargement} className="enlarge-btn">SEE ENLARGEMENT</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="section-lots-list">
                                <h3 style={{ margin: '0 0 0.9375rem 0', color: '#0f1d35' }}>Section {selectedSection} Lots</h3>
                                {isLoadingSection ? <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '1.25rem' }}>Loading lots...</div> : (lotGeoData?.features?.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3125rem' }}>
                                        {lotGeoData.features.map((f, i) => (
                                            <button key={i} onClick={() => setSelectedLot(f)} style={{ textAlign: 'left', padding: '0.5rem', border: '0.0625rem solid #e2e8f0', borderRadius: '0.25rem', background: '#fff', cursor: 'pointer', color: '#1e3a5f' }}>
                                                {f.properties?.owner || `PIN: ${f.properties?.pin || 'Unknown'}`}
                                                {f.properties?.arp_no && <div style={{ fontSize: '0.8em', color: '#64748b' }}>ARP: {f.properties.arp_no}</div>}
                                            </button>
                                        ))}
                                    </div>
                                ) : <div style={{ color: '#64748b', fontStyle: 'italic' }}>No lots available</div>)}
                            </div>
                        )}
                    </>
                ) : selectedBarangay ? (
                    <>
                        <h3 style={{ margin: '0 0 0.9375rem 0', color: '#0f1d35' }}>{selectedBarangay} Sections</h3>
                        {isLoadingBarangay ? <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '1.25rem' }}>Loading sections...</div> : (sectionList.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 1.25rem', textAlign: 'center', color: '#ef4444' }}>
                                <div style={{ fontSize: '3em', marginBottom: '0.9375rem' }}>⚠️</div>
                                <div style={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '0.5rem' }}>Error</div>
                                <div style={{ fontSize: '0.9em', fontStyle: 'italic' }}>Does not contain data</div>
                            </div>
                        ) : (
                            <>
                                <p style={{ fontSize: '0.85em', color: '#64748b' }}>Click a section on the map to view lots.</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3125rem' }}>
                                    {sectionList.map(s => (
                                        <button key={s.number} onClick={() => setSelectedSection(s.number)} style={{ textAlign: 'left', padding: '0.625rem', border: '0.0625rem solid #e2e8f0', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontWeight: 'bold', color: '#1e3a5f' }}>Section {s.number}</span>
                                            <span style={{ fontSize: '0.85em', color: '#64748b', background: '#f1f5f9', padding: '0.125rem 0.375rem', borderRadius: '0.625rem' }}>{s.lot_count} lots</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        ))}
                    </>
                ) : (
                    <div className="empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8' }}>
                        <div style={{ fontSize: '3em', marginBottom: '0.625rem' }}>🗺️</div><p>Select a barangay to view</p>
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .lot-details-grid { display: flex; flex-direction: column; gap: 0.75rem; padding-top: 0.625rem; }
        .lot-detail-field { display: flex; flex-direction: column; gap: 0.25rem; }
        .lot-detail-field.full { width: 100%; }
        .lot-detail-field-half { width: 48%; display: inline-block; vertical-align: top; margin-right: 4%; margin-bottom: 0.75rem; }
        .lot-detail-field-half:last-child { margin-right: 0; }
        .lot-detail-field label, .lot-detail-field-half label { font-size: 0.7em; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.03rem; margin-bottom: 0.125rem; }
        .lot-val-box { background: #f8fafc; border: 0.0625rem solid #e2e8f0; padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-weight: 700; color: #0f1d35; font-size: 0.9em; }
        .lot-select { width: 100%; padding: 0.625rem; border-radius: 0.5rem; border: 0.125rem solid #3b82f6; font-weight: 800; color: #1e3a5f; background: #fff; cursor: pointer; }
        .lot-detail-card { background: #fff; border: 0.0625rem solid #f1f5f9; padding: 0.75rem; border-radius: 0.5rem; box-shadow: 0 0.0625rem 0.18rem rgba(0,0,0,0.02); display: inline-block; width: 48%; margin-right: 4%; margin-bottom: 0.5rem; vertical-align: top; }
        .lot-detail-card.full { width: 100%; margin-right: 0; }
        .lot-detail-card:nth-child(even):not(.full) { margin-right: 0; }
        .lot-detail-card label { font-size: 0.65em; font-weight: 800; color: #94a3b8; display: block; margin-bottom: 0.25rem; text-transform: uppercase; }
        .lot-card-val { font-weight: 700; color: #1e3a5f; font-size: 0.95em; word-break: break-word; }
        .lot-card-val.highlight { color: #dc2626; }
        .lot-card-val.small { font-size: 0.82em; line-height: 1.4; color: #475569; }
        .lot-card-val.landuse { color: #059669; }
        .lot-card-val.primary { color: #dc2626; font-size: 1.3em; }
        .lot-card-val.secondary { color: #1e3a5f; font-size: 1.15em; }
        .highlight-green { border-left: 0.25rem solid #10b981; background: #f0fdf4 !important; }
        .highlight-navy { border-left: 0.25rem solid #0f1d35; background: #f8fafc !important; }
        .adj-buttons { display: flex; gap: 0.37rem; margin-top: 0.5rem; }
        .adj-buttons button { flex: 1; padding: 0.5rem 0.25rem; font-size: 0.75em; font-weight: 800; border: 0.0625rem solid #cbd5e1; background: #fff; border-radius: 0.375rem; cursor: pointer; transition: all 0.2s; color: #64748b; }
        .adj-buttons button:hover { background: #f1f5f9; border-color: #94a3b8; color: #1e3a5f; }
        .adj-buttons button.active { background: #1e3a5f; border-color: #1e3a5f; color: #fff; }
        .lot-enlargement-box { margin-top: 0.5rem; padding: 0.93rem; background: #fffbeb; border: 0.0625rem dashed #f59e0b; border-radius: 0.75rem; text-align: center; }
        .enlarge-text { color: #b45309; font-size: 0.85em; font-weight: 600; margin-bottom: 0.62rem; }
        .enlarge-btn { width: 100%; background: #f59e0b; color: #fff; border: none; padding: 0.62rem; border-radius: 0.5rem; font-weight: 800; font-size: 0.85em; cursor: pointer; transition: background 0.2s; }
        .enlarge-btn:hover { background: #d97706; }
      `
            }} />
        </div>
    );
}
