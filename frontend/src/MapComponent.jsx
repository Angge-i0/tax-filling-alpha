import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import { useEffect, useState, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Plus, Minus, Maximize, Locate } from 'lucide-react'

// Safer GeoJSON wrapper to catch errors during feature processing
function MapContent({ geoData, error, onFeatureSelect, onEnlargementRequest, selectedFeature, selectedFeaturePin, isCad, legend, backgroundGeoData, layerKey, isStatic, isBackgroundInteractive = true, showCustomControls = true, onMapReady }) {
  const map = useMap()
  const geoJsonRef = useRef(null)
  const selectedFeatureRef = useRef(null)
  const lastFlyPinRef = useRef(null)

  const formatPinShort = (pinValue) => {
    if (pinValue === null || pinValue === undefined) return 'N/A';
    const raw = String(pinValue).trim();
    if (!raw) return 'N/A';
    const lastPart = raw.split('-').pop() || raw;
    const cleaned = lastPart.trim();
    if (!cleaned) return 'N/A';
    return cleaned.length > 4 ? cleaned.slice(-4) : cleaned; 
  };

  const getPin = (feature) => {
    const props = feature?.properties || {};
    return String(props.pin || props.PIN || '').trim();
  };

  const isValidGeometry = (feature) => {
    const geom = feature?.geometry;
    if (!geom || !geom.type || !Array.isArray(geom.coordinates)) return false;
    const coords = geom.coordinates;
    if (geom.type === 'Point') return coords.length >= 2;
    if (geom.type === 'LineString') return coords.length > 1;
    if (geom.type === 'Polygon') return coords.length > 0 && Array.isArray(coords[0]) && coords[0].length > 2;
    if (geom.type === 'MultiLineString') return coords.length > 0 && coords.some(line => Array.isArray(line) && line.length > 1);
    if (geom.type === 'MultiPolygon') return coords.length > 0 && coords.some(poly => Array.isArray(poly) && poly.length > 0 && Array.isArray(poly[0]) && poly[0].length > 2);
    return false;
  };

  useEffect(() => {
    selectedFeatureRef.current = selectedFeature
  }, [selectedFeature])

  // Fit bounds when data changes
  const fitKey = layerKey || `fit-${geoData?.features?.length || 0}`
  useEffect(() => {
    if (geoData && geoJsonRef.current) {
      try {
        const bounds = geoJsonRef.current.getBounds();
        if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
          map.fitBounds(bounds, { duration: 0, padding: [10, 10] });
        }
      } catch (e) {
        console.warn("Leaflet fitBounds error:", e);
      }
    }
  }, [fitKey, map])

  // Clear zoom control and watch for container resize
  useEffect(() => {
    if (map.zoomControl) {
      map.zoomControl.remove()
    }
    // Force Leaflet to re-calculate its size on mount
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    // Watch for container size changes (sidebar open/close)
    const container = map.getContainer();
    let resizeTimer = null;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        map.invalidateSize();
        // Re-fit bounds after resize so map stays centered
        if (geoJsonRef.current) {
          try {
            const bounds = geoJsonRef.current.getBounds();
            if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
              map.fitBounds(bounds, { duration: 0, padding: [10, 10] });
            }
          } catch (e) {}
        }
      }, 200);
    });
    observer.observe(container);

    return () => {
      clearTimeout(timer);
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [map])

  const [zoomLevel, setZoomLevel] = useState(map.getZoom());

  useEffect(() => {
    const handleZoom = () => {
      setZoomLevel(map.getZoom());
    };
    map.on('zoomend', handleZoom);
    
    // Initial zoom class
    const container = map.getContainer();
    container.classList.add(`zoom-${Math.floor(map.getZoom())}`);

    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map]);

  useEffect(() => {
    const container = map.getContainer();
    // Remove existing zoom classes
    const classes = Array.from(container.classList);
    classes.forEach(c => {
      if (c.startsWith('zoom-')) container.classList.remove(c);
    });
    // Add current zoom class
    container.classList.add(`zoom-${Math.floor(zoomLevel)}`);
  }, [zoomLevel, map]);

  useEffect(() => {
    if (onMapReady) onMapReady(map);
    return () => {
      if (onMapReady) onMapReady(null);
    };
  }, [map, onMapReady]);

  // Zoom to selected feature
  useEffect(() => {
    if ((selectedFeature || selectedFeaturePin) && geoJsonRef.current && !isStatic) {
      const currentPin = selectedFeaturePin || getPin(selectedFeature);
      if (currentPin && lastFlyPinRef.current === currentPin) {
        return;
      }
      lastFlyPinRef.current = currentPin || null;
      try {
        geoJsonRef.current.eachLayer((layer) => {
          const layerPin = getPin(layer.feature);
          const isMatch = selectedFeaturePin ? layerPin === selectedFeaturePin : layer.feature === selectedFeature;
          if (isMatch) {
            if (layer.getBounds) {
              const b = layer.getBounds();
              if (b && typeof b.isValid === 'function' && b.isValid()) {
                map.flyToBounds(b, { padding: [20, 20], duration: 1 });
              }
            } else if (layer.getLatLng) {
              map.flyTo(layer.getLatLng(), map.getZoom(), { duration: 1 });
            }
          }
        });
      } catch (e) {
        console.warn("Selection fly error:", e);
      }
    }
  }, [selectedFeature, selectedFeaturePin, map, isStatic])

  // Update styles for selection
  useEffect(() => {
    if (geoJsonRef.current) {
      try {
        geoJsonRef.current.eachLayer((layer) => {
          const layerPin = getPin(layer.feature);
          const isSelected = selectedFeaturePin ? layerPin === selectedFeaturePin : (selectedFeature && layer.feature === selectedFeature);
          const props = layer.feature?.properties || {};
          const defaultColor = props.section_color || props.color || '#3388ff';
          const selectedBorder = '#fbbf24'; // Bright Amber
          const selectedFill = isCad ? defaultColor : '#3b82f6';
          const selectedOpacity = 0.85;

          if (isSelected) {
            layer.setStyle({
              fillOpacity: selectedOpacity,
              weight: 5,
              color: selectedBorder,
              fillColor: selectedFill,
              className: 'selected-feature-pulse',
              dashArray: '10, 10'
            });
            layer.bringToFront();
          } else if (isCad) {
            layer.setStyle({
              fillOpacity: 0.5,
              weight: 1.5,
              opacity: 0.8,
              color: '#ffffff',
              fillColor: '#3b82f6'
            });
          } else {
            const featureColor = props.section_color || props.color || '#3388ff';
            layer.setStyle({
              fillOpacity: selectedFeature ? 0.22 : 0.4,
              weight: selectedFeature ? 1.25 : 2,
              opacity: 0.8,
              color: '#ffffff',
              fillColor: featureColor
            });
          }
        });
      } catch (e) {
        console.error("Style update error:", e);
      }
    }
  }, [selectedFeature, isCad, legend])

  const onEachFeature = (feature, layer) => {
    if (!feature) return;
    const props = feature.properties || {};

    layer.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      // Always clear any previously opened enlargement popup.
      map.closePopup();
      onFeatureSelect(feature);
      if (props.has_enlargement) {
        layer.openPopup();
      }
    });

    // Safe Tooltip Binding
    try {
      if (props.hasOwnProperty('section_number') && !props.hasOwnProperty('pin') && !props.hasOwnProperty('PIN')) {
        layer.bindTooltip(`<b>${props.section_number}</b>`, {
          permanent: true,
          direction: 'center',
          className: 'section-tooltip'
        });
      } else if (props.hasOwnProperty('pin') || props.hasOwnProperty('PIN') || props.hasOwnProperty('owner')) {
        const pin = props.pin || props.PIN || 'N/A';
        const pinShort = formatPinShort(pin);
        layer.bindTooltip(`${pinShort}`, {
          permanent: true,
          direction: 'center',
          className: 'lot-tooltip'
        });
        if (props.has_enlargement) {
          const popupWrap = L.DomUtil.create('div');
          const popupTitle = L.DomUtil.create('b', '', popupWrap);
          popupTitle.textContent = 'Enlargement available';
          popupWrap.appendChild(document.createElement('br'));

          const popupButton = L.DomUtil.create('button', 'popup-enlarge-btn', popupWrap);
          popupButton.type = 'button';
          popupButton.textContent = 'SEE ENLARGEMENT';
          popupButton.style.marginTop = '0.375rem';
          popupButton.style.padding = '0.375rem 0.625rem';
          popupButton.style.border = '0';
          popupButton.style.borderRadius = '0.375rem';
          popupButton.style.background = '#d97706';
          popupButton.style.color = '#fff';
          popupButton.style.fontWeight = '700';
          popupButton.style.cursor = 'pointer';

          L.DomEvent.disableClickPropagation(popupWrap);
          L.DomEvent.disableScrollPropagation(popupWrap);
          L.DomEvent.on(popupButton, 'mousedown', L.DomEvent.stop);
          L.DomEvent.on(popupButton, 'mouseup', L.DomEvent.stop);
          L.DomEvent.on(popupButton, 'touchstart', L.DomEvent.stop);
          L.DomEvent.on(popupButton, 'pointerdown', L.DomEvent.stop);
          L.DomEvent.on(popupButton, 'click', (clickEvt) => {
            L.DomEvent.stop(clickEvt);
            if (onEnlargementRequest) onEnlargementRequest(feature);
            map.closePopup();
          });

          layer.bindPopup(popupWrap, { closeOnClick: true, autoClose: true, autoPan: true });
        }
      } else if (props.ADM4_EN) {
        layer.bindTooltip(`<b>${props.ADM4_EN}</b>`, { 
          permanent: true, 
          direction: 'center',
          className: 'section-tooltip' // Reuse section styling for barangays
        });
      }
    } catch (e) {
      console.warn("Tooltip binding failed:", e);
    }

    // Set Initial Style Safely
    try {
      if (isCad) {
        layer.setStyle({
          fillOpacity: 0.4,
          weight: 1.5,
          color: '#ffffff',
          fillColor: '#3b82f6'
        });
      } else {
        const featureColor = props.section_color || props.color || '#3388ff';
        layer.setStyle({
          fillOpacity: 0.4,
          weight: 1.5,
          color: '#ffffff',
          fillColor: featureColor
        });
      }
    } catch (e) {
       console.warn("Initial style failed:", e);
    }

    layer.on('mouseover', () => {
      layer.setStyle({ fillOpacity: 0.7, weight: 3, color: '#ff7800' });
      if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
      }
    });

    layer.on('mouseout', () => {
      const isSelected = selectedFeaturePin ? getPin(feature) === selectedFeaturePin : (selectedFeatureRef.current === feature);
      try {
        if (isSelected) {
          const defaultColor = props.section_color || props.color || '#3388ff';
          const selectedBorder = isCad ? '#22d3ee' : '#f59e0b';
          const selectedFill = isCad ? defaultColor : '#60a5fa';
          const selectedOpacity = isCad ? 0.72 : 0.88;
          layer.setStyle({ fillOpacity: selectedOpacity, weight: 3.5, color: selectedBorder, fillColor: selectedFill });
        } else if (isCad) {
          layer.setStyle({ fillOpacity: 0.5, weight: 1.5, color: '#ffffff', fillColor: '#3b82f6' });
        } else {
          const featureColor = props.section_color || props.color || '#3388ff';
          layer.setStyle({ fillOpacity: 0.4, weight: 1.5, color: '#ffffff', fillColor: featureColor });
        }
      } catch (e) {}
    });
  }

  const handleCenter = () => {
    if (geoJsonRef.current) {
      try {
        const bounds = geoJsonRef.current.getBounds();
        if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
            map.fitBounds(bounds);
        }
      } catch (e) {}
    }
  }

  // Create a more robust key that includes isCad to force refresh when switching modes
  const activeKey = layerKey || `map-layer-${isCad ? 'cad' : 'pim'}-${geoData?.features?.length || 0}`;

  return (
    <>
      <TileLayer
        url="http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
        subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
        attribution="&copy; Google"
      />

      {backgroundGeoData && (
        <GeoJSON
          key={`bg-${backgroundGeoData?.features?.length || 0}`}
          data={backgroundGeoData}
          onEachFeature={(feature, layer) => {
            try {
              layer.setStyle({ fillOpacity: 0.1, weight: 1.0, color: '#475569', fillColor: '#94a3b8' });
              if (feature.properties?.ADM4_EN) {
                layer.bindTooltip(`<b>${feature.properties.ADM4_EN}</b>`, { 
                  permanent: true, 
                  direction: 'center',
                  className: 'section-tooltip'
                });
              }
              if (isBackgroundInteractive) {
                layer.on('click', (e) => {
                  L.DomEvent.stopPropagation(e);
                  onFeatureSelect(feature);
                });
              }
            } catch (e) {}
          }}
        />
      )}

      {geoData && geoData.features && (
        <GeoJSON 
            key={activeKey} 
            ref={geoJsonRef} 
            data={geoData} 
            onEachFeature={onEachFeature}
            filter={isValidGeometry}
        />
      )}

      {!isStatic && showCustomControls && (
        <>
          <div className="map-zoom-controls">
            <button className="map-control-btn" onClick={() => map.zoomIn()}><Plus size={20} /></button>
            <button className="map-control-btn" onClick={() => map.zoomOut()}><Minus size={20} /></button>
          </div>

          <div className="map-center-control">
            <button className="map-control-btn" onClick={handleCenter}><Locate size={20} /></button>
          </div>
        </>
      )}

      {error && (
        <div style={{ position: 'absolute', top: '0.625rem', left: '0.625rem', zIndex: 1000, background: 'rgba(255,0,0,0.8)', color: 'white', padding: '0.3125rem 0.625rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
          {error}
        </div>
      )}
    </>
  )
}

export default function MapComponent({ geoData, error, onFeatureSelect, onEnlargementRequest, selectedFeature, selectedFeaturePin, isCad, legend, backgroundGeoData, layerKey, isStatic, isBackgroundInteractive = true, showCustomControls = true, onMapReady }) {
  return (
    <MapContainer
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, background: '#f1f5f9' }}
      zoom={13}
      center={[13.79, 121.0]}
      zoomControl={false}
      dragging={!isStatic}
      scrollWheelZoom={!isStatic}
      doubleClickZoom={!isStatic}
      boxZoom={!isStatic}
      keyboard={!isStatic}
      touchZoom={!isStatic}
    >
      <MapContent
        geoData={geoData}
        error={error}
        onFeatureSelect={onFeatureSelect}
        onEnlargementRequest={onEnlargementRequest}
        selectedFeature={selectedFeature}
        selectedFeaturePin={selectedFeaturePin}
        isCad={isCad}
        legend={legend}
        backgroundGeoData={backgroundGeoData}
        layerKey={layerKey}
        isStatic={isStatic}
        isBackgroundInteractive={isBackgroundInteractive}
        showCustomControls={showCustomControls}
        onMapReady={onMapReady}
      />
    </MapContainer>
  )
}
