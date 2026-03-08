import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import { useEffect, useState, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Plus, Minus, Maximize, Locate } from 'lucide-react'

function MapContent({ geoData, error, onFeatureSelect, selectedFeature, isCad, legend, backgroundGeoData, layerKey }) {
  const map = useMap()
  const geoJsonRef = useRef(null)
  const selectedFeatureRef = useRef(null)

  useEffect(() => {
    selectedFeatureRef.current = selectedFeature
  }, [selectedFeature])

  useEffect(() => {
    if (geoData && geoJsonRef.current) {
      const bounds = geoJsonRef.current.getBounds()
      map.fitBounds(bounds)
    }
  }, [geoData, map, layerKey])

  // Force remove default zoom control if it exists
  useEffect(() => {
    if (map.zoomControl) {
      map.zoomControl.remove()
    }
  }, [map])

  // Zoom to selected feature when it changes (especially from external source like filter)
  useEffect(() => {
    if (selectedFeature && geoJsonRef.current) {
      geoJsonRef.current.eachLayer((layer) => {
        if (layer.feature === selectedFeature) {
          const bounds = layer.getBounds()
          map.flyToBounds(bounds, { padding: [20, 20], duration: 1 })
        }
      })
    }
  }, [selectedFeature, map])

  // Update styles when selection changes
  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.eachLayer((layer) => {
        const isSelected = selectedFeature && layer.feature === selectedFeature

        if (isSelected) {
          const featureColor = layer.feature.properties.color || '#3388ff';
          layer.setStyle({
            fillOpacity: 0.5,
            weight: 4,
            color: '#ffffff',
            fillColor: featureColor,
            className: 'selected-feature-pulse'
          })
          layer.bringToFront()
        } else if (isCad && legend) {
          const brgyName = layer.feature.properties.ADM4_EN;
          // Normalize names for matching (handle variations)
          const match = legend.find(l => l.name.toLowerCase() === brgyName?.toLowerCase());
          const fillColor = match ? match.color : '#3388ff';
          layer.setStyle({
            fillOpacity: 0.5,
            weight: 1.5,
            opacity: 0.8,
            color: '#ffffff',
            fillColor: fillColor
          })
        } else {
          // Use color from feature properties if available (e.g. for PIM dissolved view)
          const featureColor = layer.feature.properties.color || '#3388ff';
          layer.setStyle({
            fillOpacity: 0.5,
            weight: 2,
            opacity: 0.8,
            color: featureColor,
            fillColor: featureColor
          })
        }
      })
    }
  }, [selectedFeature, isCad, legend])

  const onEachFeature = (feature, layer) => {
    layer.on('click', () => {
      onFeatureSelect(feature)
    })

    // Bind Tooltip based on feature properties
    if (feature.properties.hasOwnProperty('section_number') && !feature.properties.hasOwnProperty('PIN') && !feature.properties.hasOwnProperty('pin')) {
      // It's a Section polygon
      layer.bindTooltip(`<b>Section ${feature.properties.section_number}</b>`, {
        permanent: true,
        direction: 'center',
        className: 'section-tooltip'
      });
    } else if (feature.properties.hasOwnProperty('pin') || feature.properties.hasOwnProperty('PIN')) {
      // It's a Lot polygon
      const owner = feature.properties.owner || 'Unknown Owner';
      const pin = feature.properties.pin || feature.properties.PIN || 'N/A';
      layer.bindTooltip(`LOT PIN: ${pin}<br/>${owner}`, {
        sticky: true
      });
    } else if (feature.properties.ADM4_EN) {
      // It's a Barangay polygon
      layer.bindTooltip(`<b>${feature.properties.ADM4_EN}</b>`, {
        sticky: true,
        className: 'cad-tooltip' // Reusing cad-tooltip style
      });
    }

    // Initial style
    if (isCad && legend) {
      const brgyName = feature.properties.ADM4_EN;
      const match = legend.find(l => l.name.toLowerCase() === brgyName?.toLowerCase());
      const fillColor = match ? match.color : '#3388ff';
      layer.setStyle({
        fillOpacity: 0.5,
        weight: 1.5,
        opacity: 0.8,
        color: '#ffffff',
        fillColor: fillColor
      });

      // Add tooltip for CAD
      layer.bindTooltip(`<b>${brgyName}</b>`, { sticky: true, className: 'cad-tooltip' });
    } else {
      const featureColor = feature.properties.section_color || feature.properties.color || '#3388ff';
      layer.setStyle({
        fillOpacity: 0.5,
        weight: 2,
        opacity: 0.8,
        color: '#ffffff',
        fillColor: featureColor
      });
    }

    layer.on('mouseover', () => {
      layer.setStyle({
        fillOpacity: 0.7,
        weight: 3,
        color: '#ff7800'
      })
      layer.bringToFront()
    })

    layer.on('mouseout', () => {
      const isSelected = selectedFeatureRef.current === feature
      if (isSelected) {
        const featureColor = feature.properties.section_color || feature.properties.color || '#3388ff';
        layer.setStyle({
          fillOpacity: 0.5,
          weight: 4,
          color: '#ffffff',
          fillColor: featureColor,
          className: 'selected-feature-pulse'
        })
      } else if (isCad && legend) {
        const brgyName = feature.properties.ADM4_EN;
        const match = legend.find(l => l.name.toLowerCase() === brgyName?.toLowerCase());
        const fillColor = match ? match.color : '#3388ff';
        layer.setStyle({
          fillOpacity: 0.5,
          weight: 1.5,
          color: '#ffffff',
          fillColor: fillColor
        })
      } else {
        const featureColor = feature.properties.section_color || feature.properties.color || '#3388ff';
        layer.setStyle({
          fillOpacity: 0.5,
          weight: 2,
          color: '#ffffff',
          fillColor: featureColor
        })
      }
    })
  }

  const handleCenter = () => {
    if (geoJsonRef.current) {
      const bounds = geoJsonRef.current.getBounds()
      map.fitBounds(bounds)
    }
  }

  const activeKey = layerKey || `active-geo-${geoData?.features?.length || 0}`;

  return (
    <>
      <TileLayer
        url="http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
        subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
        attribution="&copy; Google"
      />

      {/* Background GeoData Layer (e.g., San Pascual base map for context) */}
      {backgroundGeoData && (
        <GeoJSON
          key={`bg-${backgroundGeoData?.features?.length || 0}`}
          data={backgroundGeoData}
          onEachFeature={(feature, layer) => {
            layer.setStyle({
              fillOpacity: 0.15,
              weight: 1.5,
              color: '#475569',
              fillColor: '#94a3b8'
            });
            if (feature.properties.ADM4_EN) {
              layer.bindTooltip(`<b>${feature.properties.ADM4_EN}</b>`, {
                sticky: true,
                className: 'cad-tooltip' // Reusing cad-tooltip style
              });
            }
            // Allow selecting another barangay directly from the blurred background
            layer.on('click', () => {
              onFeatureSelect(feature);
            });
            layer.on('mouseover', () => {
              layer.setStyle({ fillOpacity: 0.3, color: '#f59e0b' });
            });
            layer.on('mouseout', () => {
              layer.setStyle({ fillOpacity: 0.15, color: '#475569' });
            });
          }}
        />
      )}

      {/* Main active GeoData Layer */}
      {geoData && <GeoJSON key={activeKey} ref={geoJsonRef} data={geoData} onEachFeature={onEachFeature} />}

      {/* Custom Zoom Controls */}
      <div className="map-zoom-controls">
        <button
          className="map-control-btn"
          onClick={() => map.zoomIn()}
          title="Zoom In"
        >
          <Plus size={20} />
        </button>
        <button
          className="map-control-btn"
          onClick={() => map.zoomOut()}
          title="Zoom Out"
        >
          <Minus size={20} />
        </button>
      </div>

      {/* Center Control */}
      <div className="map-center-control">
        <button
          className="map-control-btn"
          onClick={handleCenter}
          title="Center on Map"
        >
          <Locate size={20} />
        </button>
      </div>

      {error && (
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 1000, color: 'red', background: 'white', padding: 8 }}>
          Error: {error}
        </div>
      )}
    </>
  )
}

export default function MapComponent({ geoData, error, onFeatureSelect, selectedFeature, isCad, legend, backgroundGeoData, layerKey }) {
  return (
    <MapContainer
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
      zoom={13}
      center={[13.79, 121.0]} // Adjusted center for San Pascual
      zoomControl={false} // Disable default controls
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
      />
    </MapContainer>
  )
}
