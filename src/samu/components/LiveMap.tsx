import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Ambulance, HospitalUnit } from '../types';

interface LiveMapProps {
  center: [number, number];
  zoom?: number;
  citizenPos?: [number, number];
  citizenAddress?: string;
  ambulances?: Ambulance[];
  hospitals?: HospitalUnit[];
  routeCoords?: [number, number][];
  activeAmbulanceId?: string;
  className?: string;
}

function MapViewController({ center, routeCoords }: { center: [number, number]; routeCoords?: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (routeCoords && routeCoords.length > 1) {
      const bounds = L.latLngBounds(routeCoords.map((c) => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    } else if (center && center[0] && center[1]) {
      map.setView(center, map.getZoom() || 14, { animate: true });
    }
  }, [center, routeCoords, map]);

  return null;
}

export const LiveMap: React.FC<LiveMapProps> = ({
  center,
  zoom = 14,
  citizenPos,
  citizenAddress,
  ambulances = [],
  hospitals = [],
  routeCoords = [],
  activeAmbulanceId,
  className = 'w-full h-full min-h-[350px] rounded-2xl overflow-hidden shadow-2xl relative',
}) => {
  // Ultra-modern Dark Mode Patient Pin
  const citizenIcon = L.divIcon({
    className: 'samu-citizen-marker',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <span style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(225, 29, 72, 0.35); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
        <span style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: rgba(225, 29, 72, 0.25);"></span>
        <div style="position: relative; width: 30px; height: 30px; border-radius: 50%; background: #E11D48; border: 2.5px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 20px rgba(225,29,72,0.8); color: white; font-weight: 900; font-size: 11px;">
          SOS
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

  // High-Tech Ambulance Marker with heading rotation and beacon
  const getAmbulanceIcon = (heading: number, type: string, isActive: boolean, code: string) => {
    const borderColor = isActive ? '#E11D48' : '#F59E0B';
    const glowColor = isActive ? 'rgba(225, 29, 72, 0.7)' : 'rgba(245, 158, 11, 0.5)';
    const vehicleEmoji = type.toLowerCase().includes('moto') ? '🏍️' : '🚑';

    return L.divIcon({
      className: 'samu-ambulance-marker',
      html: `
        <div style="display: flex; flex-direction: column; align-items: center;">
          <div style="transform: rotate(${heading || 0}deg); transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); position: relative; width: 42px; height: 42px; border-radius: 50%; background: #0A0F1D; border: 2.5px solid ${borderColor}; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 16px ${glowColor};">
            <span style="font-size: 20px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));">${vehicleEmoji}</span>
            ${
              isActive
                ? `<span style="position: absolute; top: -3px; right: -3px; width: 12px; height: 12px; border-radius: 50%; background: #E11D48; border: 2px solid #ffffff; box-shadow: 0 0 10px #E11D48; animation: pulse 1s infinite;"></span>`
                : ''
            }
          </div>
          <span style="margin-top: 2px; background: rgba(15, 23, 42, 0.9); border: 1px solid ${borderColor}; color: #ffffff; font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.6); white-space: nowrap;">
            ${code}
          </span>
        </div>
      `,
      iconSize: [46, 56],
      iconAnchor: [23, 28],
    });
  };

  // Hospital Pin with Cyan/Blue Neon Accent
  const hospitalIcon = L.divIcon({
    className: 'samu-hospital-marker',
    html: `
      <div style="position: relative; width: 34px; height: 34px; border-radius: 10px; background: #0A0F1D; border: 2px solid #38BDF8; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 14px rgba(56, 189, 248, 0.5);">
        <span style="font-size: 17px;">🏥</span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

  return (
    <div className={className}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="w-full h-full"
        style={{ minHeight: '350px', background: '#050811' }}
      >
        {/* CARTO Dark Matter Tiles - Ultra Sleek Night Mode */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />

        <MapViewController center={center} routeCoords={routeCoords} />

        {/* Neon High-Impact Route Lines */}
        {routeCoords && routeCoords.length > 1 && (
          <>
            {/* Outer Glow */}
            <Polyline positions={routeCoords} pathOptions={{ color: '#E11D48', weight: 8, opacity: 0.35, lineCap: 'round' }} />
            {/* Core Bright Neon Line */}
            <Polyline positions={routeCoords} pathOptions={{ color: '#FB7185', weight: 3.5, opacity: 0.95, dashArray: '6, 8', lineCap: 'round' }} />
          </>
        )}

        {/* Citizen SOS Marker */}
        {citizenPos && citizenPos[0] && citizenPos[1] && (
          <Marker position={citizenPos} icon={citizenIcon}>
            <Popup className="samu-popup">
              <div style={{ background: '#0F172A', color: '#fff', padding: '8px', borderRadius: '10px', fontSize: '12px' }}>
                <span style={{ color: '#E11D48', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>Local da Vítima</span>
                <p style={{ marginTop: '4px', color: '#94A3B8' }}>{citizenAddress || 'Coordenadas via GPS'}</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Ambulances */}
        {ambulances.map((amb) => {
          if (!amb.current_lat || !amb.current_lng) return null;
          const isActive = amb.id === activeAmbulanceId || amb.status === 'busy';
          return (
            <Marker
              key={amb.id}
              position={[amb.current_lat, amb.current_lng]}
              icon={getAmbulanceIcon(amb.current_heading || 0, amb.type, isActive, amb.code)}
            >
              <Popup className="samu-popup">
                <div style={{ background: '#0F172A', color: '#fff', padding: '8px', borderRadius: '10px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ background: '#E11D48', color: '#fff', fontWeight: 900, padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                      {amb.code}
                    </span>
                    <strong>{amb.type} • {amb.plate}</strong>
                  </div>
                  <p style={{ marginTop: '4px', color: '#94A3B8' }}>Status: <strong style={{ color: isActive ? '#E11D48' : '#10B981' }}>{amb.status.toUpperCase()}</strong></p>
                  {amb.current_driver_name && <p style={{ color: '#CBD5E1' }}>Condutor: {amb.current_driver_name}</p>}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Hospitals */}
        {hospitals.map((hosp) => (
          <Marker key={hosp.id} position={[hosp.lat, hosp.lng]} icon={hospitalIcon}>
            <Popup className="samu-popup">
              <div style={{ background: '#0F172A', color: '#fff', padding: '8px', borderRadius: '10px', fontSize: '12px' }}>
                <strong style={{ color: '#38BDF8', display: 'block' }}>{hosp.name}</strong>
                <p style={{ color: '#94A3B8', fontSize: '11px', marginTop: '2px' }}>{hosp.address}</p>
                <div style={{ marginTop: '6px', color: '#10B981', fontWeight: 700, fontSize: '10px' }}>
                  5 Vagas de Trauma/Emergência
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};
