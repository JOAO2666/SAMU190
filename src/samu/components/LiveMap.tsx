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

// Map Auto-pan / Auto-fit Controller
function MapViewController({ center, routeCoords }: { center: [number, number]; routeCoords?: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (routeCoords && routeCoords.length > 1) {
      const bounds = L.latLngBounds(routeCoords.map((c) => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
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
  className = 'w-full h-full min-h-[350px] rounded-xl overflow-hidden shadow-inner',
}) => {
  // Custom icons
  const citizenIcon = L.divIcon({
    className: 'samu-citizen-marker',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <span style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(239, 68, 68, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
        <div style="width: 28px; height: 28px; border-radius: 50%; background: #dc2626; border: 2.5px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); color: white; font-weight: 900; font-size: 11px;">
          SOS
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

  const getAmbulanceIcon = (heading: number, _type: string, isActive: boolean) =>
    L.divIcon({
      className: 'samu-ambulance-marker',
      html: `
        <div style="transform: rotate(${heading || 0}deg); transition: transform 0.4s ease; display: flex; align-items: center; justify-content: center;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #0f172a; border: 3px solid ${isActive ? '#ef4444' : '#f59e0b'}; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 14px rgba(0,0,0,0.4); font-size: 18px; color: white;">
            🚑
          </div>
          ${
            isActive
              ? '<span style="position: absolute; top: -3px; right: -3px; width: 12px; height: 12px; border-radius: 50%; background: #dc2626; border: 2px solid white; box-shadow: 0 0 6px #ef4444;"></span>'
              : ''
          }
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });

  const hospitalIcon = L.divIcon({
    className: 'samu-hospital-marker',
    html: `
      <div style="width: 32px; height: 32px; border-radius: 8px; background: #2563eb; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); font-size: 16px; color: white;">
        🏥
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  return (
    <div className={className}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="w-full h-full"
        style={{ minHeight: '350px' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapViewController center={center} routeCoords={routeCoords} />

        {/* Route Polyline */}
        {routeCoords && routeCoords.length > 1 && (
          <>
            {/* Outline Glow */}
            <Polyline positions={routeCoords} pathOptions={{ color: '#ef4444', weight: 8, opacity: 0.4 }} />
            {/* Main Road Line */}
            <Polyline positions={routeCoords} pathOptions={{ color: '#dc2626', weight: 4, opacity: 0.9, dashArray: '8, 8' }} />
          </>
        )}

        {/* Citizen Emergency Location Marker */}
        {citizenPos && citizenPos[0] && citizenPos[1] && (
          <Marker position={citizenPos} icon={citizenIcon}>
            <Popup>
              <div className="text-xs">
                <span className="font-bold text-red-600 uppercase tracking-wide block">Local da Ocorrência</span>
                <p className="mt-1 text-slate-700">{citizenAddress || 'Coordenadas recebidas via GPS'}</p>
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
              icon={getAmbulanceIcon(amb.current_heading || 0, amb.type, isActive)}
            >
              <Popup>
                <div className="text-xs p-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-extrabold">{amb.code}</span>
                    <span>{amb.type} - {amb.plate}</span>
                  </div>
                  <p className="text-slate-600 mt-1">Status: <strong className="capitalize">{amb.status}</strong></p>
                  {amb.current_driver_name && (
                    <p className="text-slate-600">Condutor: <strong>{amb.current_driver_name}</strong></p>
                  )}
                  {amb.speed > 0 && (
                    <p className="text-slate-500 text-[10px]">Velocidade: {Math.round(amb.speed)} km/h</p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Hospitals / UPAs */}
        {hospitals.map((hosp) => (
          <Marker key={hosp.id} position={[hosp.lat, hosp.lng]} icon={hospitalIcon}>
            <Popup>
              <div className="text-xs p-1">
                <span className="font-bold text-blue-700 block">{hosp.name}</span>
                <p className="text-slate-600 text-[11px] mt-0.5">{hosp.address} - {hosp.city}</p>
                <div className="mt-1.5 flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">Plantão: {hosp.hours}</span>
                  <span className="font-bold text-emerald-600 bg-emerald-50 px-1 rounded">5 Vagas Emergência</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};
