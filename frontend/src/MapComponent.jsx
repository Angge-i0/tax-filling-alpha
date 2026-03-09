import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import { useEffect, useState, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Plus, Minus, Maximize, Locate } from 'lucide-react'

// Safer GeoJSON wrapper to catch errors during feature processing
function MapContent({ geoData, error, onFeatureSelect, selectedFeature, isCad, legend, backgroundGeoData, layerKey, isStatic }) {
  const map = useMap()
  const geoJsonRef = useRef(null)
  const selectedFeatureRef = useRef(null)

  useEffect(() => {
    selectedFeatureRef.current = selectedFeature
  }, [selectedFeature])

  // Fit bounds when data changes
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
  }, [geoData, map, layerKey])

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

  // Zoom to selected feature
  useEffect(() => {
    if (selectedFeature && geoJsonRef.current && !isStatic) {
      try {
        geoJsonRef.current.eachLayer((layer) => {
          if (layer.feature === selectedFeature) {
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
  }, [selectedFeature, map, isStatic])

  // Update styles for selection
  useEffect(() => {
    if (geoJsonRef.current) {
      try {
        geoJsonRef.current.eachLayer((layer) => {
          const isSelected = selectedFeature && layer.feature === selectedFeature;
          const props = layer.feature?.properties || {};

          if (isSelected) {
            const featureColor = props.section_color || props.color || '#3388ff';
            layer.setStyle({
              fillOpacity: 0.8,
              weight: 4,
              color: '#ffffff',
              fillColor: featureColor,
              className: 'selected-feature-pulse'
            });
            layer.bringToFront();
          } else if (isCad && legend) {
            const brgyName = props.ADM4_EN;
            const match = legend.find(l => l.name?.toLowerCase() === brgyName?.toLowerCase());
            const fillColor = match ? match.color : '#3388ff';
            layer.setStyle({
              fillOpacity: 0.5,
              weight: 1.5,
              opacity: 0.8,
              color: '#ffffff',
              fillColor: fillColor
            });
          } else {
            const featureColor = props.section_color || props.color || '#3388ff';
            layer.setStyle({
              fillOpacity: 0.4,
              weight: 2,
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
      onFeatureSelect(feature);
    });

    // Safe Tooltip Binding
    try {
      if (props.hasOwnProperty('section_number') && !props.hasOwnProperty('pin') && !props.hasOwnProperty('PIN')) {
        layer.bindTooltip(`<b>Section ${props.section_number}</b>`, {
          permanent: true,
          direction: 'center',
          className: 'section-tooltip'
        });
      } else if (props.hasOwnProperty('pin') || props.hasOwnProperty('PIN') || props.hasOwnProperty('owner')) {
        const owner = props.owner || 'Unknown';
        const pin = props.pin || props.PIN || 'N/A';
        layer.bindTooltip(`LOT: ${pin}<br/>${owner}`, { sticky: true });
      } else if (props.ADM4_EN) {
        layer.bindTooltip(`<b>${props.ADM4_EN}</b>`, { sticky: true });
      }
    } catch (e) {
      console.warn("Tooltip binding failed:", e);
    }

    // Set Initial Style Safely
    try {
      if (isCad && legend) {
        const brgyName = props.ADM4_EN;
        const match = legend.find(l => l.name?.toLowerCase() === brgyName?.toLowerCase());
        const fillColor = match ? match.color : '#3388ff';
        layer.setStyle({ fillOpacity: 0.65, weight: 2.5, color: '#ffffff', fillColor });
      } else {
        const featureColor = props.section_color || props.color || '#3388ff';
        layer.setStyle({ fillOpacity: 0.4, weight: 1.5, color: '#ffffff', fillColor: featureColor });
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
      const isSelected = selectedFeatureRef.current === feature;
      try {
        if (isSelected) {
          const featureColor = props.section_color || props.color || '#3388ff';
          layer.setStyle({ fillOpacity: 0.8, weight: 4, color: '#ffffff', fillColor: featureColor });
        } else if (isCad && legend) {
          const brgyName = props.ADM4_EN;
          const match = legend.find(l => l.name?.toLowerCase() === brgyName?.toLowerCase());
          const fillColor = match ? match.color : '#3388ff';
          layer.setStyle({ fillOpacity: 0.5, weight: 1.5, color: '#ffffff', fillColor });
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
                layer.bindTooltip(`<b>${feature.properties.ADM4_EN}</b>`, { sticky: true });
              }
              layer.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                onFeatureSelect(feature);
              });
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
        />
      )}

      {!isStatic && (
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
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'rgba(255,0,0,0.8)', color: 'white', padding: '5px 10px', borderRadius: '4px', fontSize: '12px' }}>
          {error}
        </div>
      )}
    </>
  )
}

export default function MapComponent({ geoData, error, onFeatureSelect, selectedFeature, isCad, legend, backgroundGeoData, layerKey, isStatic }) {
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
        selectedFeature={selectedFeature}
        isCad={isCad}
        legend={legend}
        backgroundGeoData={backgroundGeoData}
        layerKey={layerKey}
        isStatic={isStatic}
      />
    </MapContainer>
  )
}
