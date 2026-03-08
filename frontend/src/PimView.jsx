import { useState, useEffect, useMemo, useRef } from 'react';
import { apiGet, getAccessToken, clearTokens } from './api';
import MapComponent from './MapComponent';

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

    // Base map bounds reference
    const [mapCenter, setMapCenter] = useState([13.79, 121.0]);

    // Load Barangay List on Mount
    useEffect(() => {
        apiGet('/api/pim/barangays/')
            .then(res => {
                if (res.status === 401) throw new Error('Session expired');
                return res.json();
            })
            .then(data => setBarangayList(data.barangays || []))
            .catch(err => setError(String(err)));
    }, []);

    // When a Barangay is selected
    useEffect(() => {
        if (!selectedBarangay) {
            setBarangayGeoData(null);
            setSectionList([]);
            setSectionGeoData(null);
            return;
        }

        // Load dissolved section polygons (Barangay view)
        apiGet(`/api/pim/barangays/${selectedBarangay}/geojson/`)
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                setBarangayGeoData(data);
                setSectionGeoData(null);
                setLotGeoData(null);
                setSelectedSection(null);
                setSelectedLot(null);
                setShowEnlargementMap(false);
            })
            .catch(err => setError(String(err)));

        // Load section list metadata
        apiGet(`/api/pim/barangays/${selectedBarangay}/sections/`)
            .then(res => res.json())
            .then(data => setSectionList(data.sections || []))
            .catch(err => console.error(err));
    }, [selectedBarangay]);

    // When a Section is selected
    useEffect(() => {
        if (!selectedSection || !selectedBarangay) {
            setSectionGeoData(null);
            setLotGeoData(null);
            return;
        }

        // Load lots for this section
        apiGet(`/api/pim/barangays/${selectedBarangay}/sections/${selectedSection}/lots/`)
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                setLotGeoData(data);
                setSelectedLot(null);
                setShowEnlargementMap(false);
            })
            .catch(err => setError(String(err)));

    }, [selectedSection, selectedBarangay]);

    // When Enlargement is requested
    const handleLoadEnlargement = () => {
        if (!selectedBarangay || !selectedSection || !selectedLot) return;

        apiGet(`/api/pim/barangays/${selectedBarangay}/sections/${selectedSection}/enlargement/`)
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                setEnlargementData(data);
                setShowEnlargementMap(true);
            })
            .catch(err => alert("Error loading enlargement: " + String(err)));
    };

    const handleMapFeatureSelect = (feature) => {
        if (!feature || !feature.properties) return;

        // We are looking at Municipality Level (seeing barangays)
        if (feature.properties.ADM4_EN && !selectedBarangay) {
            setSelectedBarangay(feature.properties.ADM4_EN);
        }
        // We are looking at Barangay Level (seeing sections)
        else if (feature.properties.hasOwnProperty('section_number') && !feature.properties.hasOwnProperty('PIN') && !feature.properties.hasOwnProperty('pin')) {
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
        } else if (selectedSection && lotGeoData) {
            activeGeoData = lotGeoData;
            activeLayerKey = 'section-' + selectedSection;
        } else if (barangayGeoData) {
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

        // Logic as requested:
        // Default adjustment levels: 50% or 75%
        // If RRW Area exists: 80%
        let adjustmentRate = 0.50; // Defaulting to 50% for now
        if (safeNum(p.area_rrw) > 0) {
            adjustmentRate = 0.80;
        } else if (p.area_comml || p.area_indl) {
            adjustmentRate = 0.75; // Example: Commercial/Industrial is 75%
        }

        // These defaults should be editable/come from DB, but using placeholders per prompt
        const unitValue = 1000; // placeholder
        const assessmentLevel = 0.20; // placeholder
        const taxRate = 0.02; // placeholder

        // Sum up all areas to get total land area
        const totalArea = safeNum(p.area_res) + safeNum(p.area_agri) + safeNum(p.area_indl) + safeNum(p.area_comml);

        const marketValue = totalArea * unitValue * adjustmentRate;
        const assessedValue = marketValue * assessmentLevel;
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
    }, [selectedLot]);

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
                            <div style={{ fontSize: '0.8em', color: '#64748b' }}>{b.section_count} sections</div>
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
                        {selectedSection && (
                            <button
                                onClick={() => { setSelectedSection(null); setLotGeoData(null); setShowEnlargementMap(false); }}
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

                <div className="map-view" data-blurred={!!selectedBarangay} style={{ flex: 1, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0, 0, 0, 0.06)' }}>
                    <MapComponent
                        geoData={activeGeoData}
                        error={error}
                        onFeatureSelect={handleMapFeatureSelect}
                        selectedFeature={activeFeature}
                        backgroundGeoData={backgroundGeoData}
                        layerKey={activeLayerKey}
                    />
                </div>
            </div>

            {/* RIGHT: Detail & Lot List Panel */}
            <div className="pim-details" style={{ width: '320px', background: '#fff', borderRadius: '12px', padding: '20px', overflowY: 'auto', boxShadow: '0 1px 6px rgba(0, 0, 0, 0.06)' }}>

                {/* If Section is selected, show Lot Details or Lot List */}
                {selectedSection ? (
                    <>
                        {selectedLot ? (
                            <div className="lot-details">
                                <button
                                    onClick={() => setSelectedLot(null)}
                                    style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '0 0 15px 0', fontWeight: 'bold' }}
                                >
                                    &larr; Back to Lots
                                </button>

                                <h3 style={{ margin: '0 0 15px 0', color: '#0f1d35' }}>Lot Details</h3>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div className="detail-row"><strong>PIN:</strong> {selectedLot.properties.pin || 'N/A'}</div>
                                    <div className="detail-row"><strong>Owner:</strong> {selectedLot.properties.owner || 'N/A'}</div>
                                    <div className="detail-row"><strong>Address:</strong> {selectedLot.properties.address || 'N/A'}</div>
                                    <div className="detail-row"><strong>ARP No:</strong> {selectedLot.properties.arp_no || 'N/A'}</div>
                                    <div className="detail-row"><strong>Prev ARP:</strong> {selectedLot.properties.prev_arp_no || 'N/A'}</div>

                                    <h4 style={{ margin: '10px 0 5px 0', borderBottom: '1px solid #eee', color: '#1e3a5f' }}>Areas (sq.m)</h4>
                                    <div className="detail-row"><strong>Residential:</strong> {selectedLot.properties.area_res || '0'}</div>
                                    <div className="detail-row"><strong>Agricultural:</strong> {selectedLot.properties.area_agri || '0'}</div>
                                    <div className="detail-row"><strong>Commercial:</strong> {selectedLot.properties.area_comml || '0'}</div>
                                    <div className="detail-row"><strong>Industrial:</strong> {selectedLot.properties.area_indl || '0'}</div>
                                    <div className="detail-row"><strong>RRW (Right of Way):</strong> {selectedLot.properties.area_rrw || '0'}</div>
                                    <div className="detail-row"><strong>Exempt:</strong> {selectedLot.properties.area_exempt || '0'}</div>

                                    {/* Computation Engine Values */}
                                    {computedTax && (
                                        <>
                                            <h4 style={{ margin: '15px 0 5px 0', borderBottom: '1px solid #eee', color: '#1e3a5f' }}>Computation</h4>
                                            <div className="detail-row"><strong>Total Area:</strong> {computedTax.totalArea.toFixed(2)}</div>
                                            <div className="detail-row"><strong>Adjustment Level:</strong> {(computedTax.adjustmentRate * 100).toFixed(0)}%</div>
                                            <div className="detail-row"><strong>Market Value:</strong> ₱{computedTax.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                            <div className="detail-row"><strong>Assessed Value:</strong> ₱{computedTax.assessedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                            <div className="detail-row"><strong>Real Property Tax:</strong> ₱{computedTax.rpt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                        </>
                                    )}

                                    {/* Enlargement Action */}
                                    {lotGeoData?.metadata?.has_enlargement && (
                                        <button
                                            onClick={handleLoadEnlargement}
                                            style={{ marginTop: '20px', width: '100%', padding: '10px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                                        >
                                            See Enlargement Map
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="section-lots-list">
                                <h3 style={{ margin: '0 0 15px 0', color: '#0f1d35' }}>Section {selectedSection} Lots</h3>
                                {lotGeoData && lotGeoData.features && lotGeoData.features.length > 0 ? (
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
                                                {f.properties.owner || `PIN: ${f.properties.pin || 'Unknown'}`}
                                                {f.properties.arp_no && <div style={{ fontSize: '0.8em', color: '#64748b' }}>ARP: {f.properties.arp_no}</div>}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ color: '#64748b', fontStyle: 'italic' }}>Loading lots...</div>
                                )}
                            </div>
                        )}
                    </>
                ) : selectedBarangay ? (
                    <>
                        <h3 style={{ margin: '0 0 15px 0', color: '#0f1d35' }}>{selectedBarangay} Sections</h3>
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
                ) : (
                    <div className="empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8' }}>
                        <div style={{ fontSize: '3em', marginBottom: '10px' }}>🗺️</div>
                        <p>Select a barangay to view</p>
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .detail-row {
          font-size: 0.85em;
          padding: 4px 0;
          border-bottom: 1px dotted #e2e8f0;
          display: flex;
          justify-content: space-between;
        }
        .detail-row strong {
          color: #64748b;
        }
      `}} />
        </div>
    );
}
