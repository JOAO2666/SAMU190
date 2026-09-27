import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers } from 'lucide-react';
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

type MapProvider = 'google_streets' | 'google_hybrid' | 'carto_dark' | 'osm';

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
  className = 'w-full h-full min-h-[350px] relative',
}) => {
  const [provider, setProvider] = useState<MapProvider>('google_streets');
  const [showLayerMenu, setShowLayerMenu] = useState(false);

  // Professional Citizen Destination Marker (Uber / Apple Maps style pin)
  const citizenIcon = L.divIcon({
    className: 'samu-citizen-pin',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <span style="position: absolute; top: 3px; width: 28px; height: 28px; border-radius: 50%; background: rgba(225, 29, 72, 0.25); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
        <div style="width: 28px; height: 28px; border-radius: 50%; background: #E11D48; border: 2.5px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>
        </div>
        <div style="width: 2px; height: 6px; background: #E11D48;"></div>
        <span style="background: #18181B; color: #FFFFFF; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.15); white-space: nowrap; margin-top: -2px;">
          Local do Paciente
        </span>
      </div>
    `,
    iconSize: [80, 56],
    iconAnchor: [40, 34],
  });

  // Puck vetorial com chevron de proa + placa Mercosul realista (spec §3)
  const getAmbulanceIcon = (heading: number, type: string, isActive: boolean, code: string, plate?: string) => {
    const isMoto = type.toLowerCase().includes('moto');
    const borderColor = isActive ? '#E11D48' : '#2563EB';
    const plateLabel = plate || 'BRA-1901';

    return L.divIcon({
      className: 'samu-vehicle-pin',
      html: `
        <div style="display: flex; flex-direction: column; align-items: center;">
          <div style="position: relative; width: 44px; height: 44px;">
            <span style="position: absolute; left: 50%; top: -7px; transform: translateX(-50%) rotate(${heading || 0}deg); transform-origin: 50% 28px; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 10px solid ${borderColor}; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); transition: transform 0.4s ease;"></span>
            <div style="position: absolute; inset: 0; border-radius: 50%; background: #FFFFFF; border: 3px solid ${borderColor}; box-shadow: 0 4px 14px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
              <div style="transform: rotate(${heading || 0}deg); display: flex; align-items: center; justify-content: center; transition: transform 0.4s ease;">
                ${
                  isMoto
                    ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${isActive ? '#E11D48' : '#1E293B'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h4"/></svg>`
                    : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${isActive ? '#E11D48' : '#1E293B'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1 .4-1 1v7c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 10h4v4H9z"/></svg>`
                }
              </div>
              ${
                isActive
                  ? `<span style="position: absolute; top: -1px; right: -1px; width: 11px; height: 11px; border-radius: 50%; background: #E11D48; border: 2px solid #ffffff; box-shadow: 0 0 6px #E11D48;"></span>`
                  : ''
              }
            </div>
          </div>
          <span style="margin-top: 4px; background: #18181B; border: 1px solid rgba(255,255,255,0.15); color: #FFFFFF; font-size: 10px; font-weight: 800; padding: 1.5px 6px; border-radius: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap;">
            ${code}
          </span>
          <span style="margin-top: 2px; background: #F8FAFC; border: 1px solid #CBD5E1; border-top: 3px solid #1D4ED8; color: #0F172A; font-size: 8.5px; font-weight: 900; font-family: monospace; letter-spacing: 0.4px; padding: 1px 5px; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.35); white-space: nowrap;">
            ${plateLabel}
          </span>
        </div>
      `,
      iconSize: [52, 84],
      iconAnchor: [26, 30],
    });
  };

  // Hospital Pin
  const hospitalIcon = L.divIcon({
    className: 'samu-hospital-pin',
    html: `
      <div style="position: relative; width: 32px; height: 32px; border-radius: 10px; background: #2563EB; border: 2.5px solid #FFFFFF; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v12"/><path d="M6 12h12"/></svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  return (
    <div className={className}>
      {/* Map Provider Selector (Google Maps / Dark / Satélite) */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end">
        <button
          type="button"
          onClick={() => setShowLayerMenu(!showLayerMenu)}
          className="bg-zinc-900/90 hover:bg-zinc-800 text-white p-2.5 rounded-xl border border-zinc-700/80 shadow-lg backdrop-blur-md flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
          title="Alternar Provedor do Mapa"
        >
          <Layers className="w-4 h-4 text-zinc-300" />
          <span className="hidden sm:inline">
            {provider === 'google_streets' && 'Google Maps'}
            {provider === 'google_hybrid' && 'Google Satélite'}
            {provider === 'carto_dark' && 'Modo Noturno'}
            {provider === 'osm' && 'OpenStreetMap'}
          </span>
        </button>

        {showLayerMenu && (
          <div className="mt-2 bg-zinc-900 border border-zinc-700/90 rounded-2xl p-1.5 shadow-2xl backdrop-blur-xl w-48 space-y-1 text-xs text-white">
            <button
              type="button"
              onClick={() => {
                setProvider('google_streets');
                setShowLayerMenu(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                provider === 'google_streets' ? 'bg-red-600 text-white font-bold' : 'hover:bg-zinc-800 text-zinc-300'
              }`}
            >
              <span>Google Maps</span>
              <span className="text-[10px] opacity-70">Padrão</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setProvider('google_hybrid');
                setShowLayerMenu(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                provider === 'google_hybrid' ? 'bg-red-600 text-white font-bold' : 'hover:bg-zinc-800 text-zinc-300'
              }`}
            >
              <span>Google Satélite</span>
              <span className="text-[10px] opacity-70">Híbrido</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setProvider('carto_dark');
                setShowLayerMenu(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                provider === 'carto_dark' ? 'bg-red-600 text-white font-bold' : 'hover:bg-zinc-800 text-zinc-300'
              }`}
            >
              <span>Carto Dark</span>
              <span className="text-[10px] opacity-70">Noturno</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setProvider('osm');
                setShowLayerMenu(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                provider === 'osm' ? 'bg-red-600 text-white font-bold' : 'hover:bg-zinc-800 text-zinc-300'
              }`}
            >
              <span>OpenStreetMap</span>
              <span className="text-[10px] opacity-70">Livre</span>
            </button>
          </div>
        )}
      </div>

      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="w-full h-full"
        style={{ minHeight: '350px', background: '#18181B' }}
      >
        {/* Dynamic Tile Layer based on user selection */}
        {provider === 'google_streets' && (
          <TileLayer
            attribution='&copy; Google Maps'
            url="https://mt1.google.com/vt/lyrs=m&hl=pt-BR&x={x}&y={y}&z={z}"
            maxZoom={20}
          />
        )}

        {provider === 'google_hybrid' && (
          <TileLayer
            attribution='&copy; Google Maps Satellite'
            url="https://mt1.google.com/vt/lyrs=y&hl=pt-BR&x={x}&y={y}&z={z}"
            maxZoom={20}
          />
        )}

        {provider === 'carto_dark' && (
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />
        )}

        {provider === 'osm' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}

        <MapViewController center={center} routeCoords={routeCoords} />

        {/* Professional Navigation Route Line (Google Maps / Apple Maps style) */}
        {routeCoords && routeCoords.length > 1 && (
          <>
            {/* Dark casing/outline */}
            <Polyline positions={routeCoords} pathOptions={{ color: '#09090B', weight: 8, opacity: 0.7, lineCap: 'round', lineJoin: 'round' }} />
            {/* Core Route Line */}
            <Polyline positions={routeCoords} pathOptions={{ color: '#E11D48', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }} />
          </>
        )}

        {/* Citizen SOS Marker */}
        {citizenPos && citizenPos[0] && citizenPos[1] && (
          <Marker position={citizenPos} icon={citizenIcon}>
            <Popup className="samu-popup">
              <div style={{ background: '#18181B', color: '#FFFFFF', padding: '10px', borderRadius: '12px', fontSize: '12px', minWidth: '180px' }}>
                <span style={{ color: '#E11D48', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Local da Vítima
                </span>
                <p style={{ marginTop: '4px', color: '#D4D4D8', lineHeight: '1.3' }}>
                  {citizenAddress || 'Coordenadas via GPS'}
                </p>
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
              icon={getAmbulanceIcon(amb.current_heading || 0, amb.type, isActive, amb.code, amb.plate)}
            >
              <Popup className="samu-popup">
                <div style={{ background: '#18181B', color: '#FFFFFF', padding: '10px', borderRadius: '12px', fontSize: '12px', minWidth: '180px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ background: '#E11D48', color: '#FFFFFF', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                      {amb.code}
                    </span>
                    <span style={{ color: '#A1A1AA', fontSize: '11px', fontFamily: 'monospace' }}>
                      {amb.plate}
                    </span>
                  </div>
                  <p style={{ marginTop: '6px', fontWeight: 700, color: '#FFFFFF' }}>{amb.type}</p>
                  <p style={{ marginTop: '2px', color: '#A1A1AA', fontSize: '11px' }}>
                    Condutor: <strong style={{ color: '#FFFFFF' }}>{amb.current_driver_name || 'Plantão'}</strong>
                  </p>
                  <p style={{ marginTop: '2px', color: '#A1A1AA', fontSize: '11px' }}>
                    Status: <strong style={{ color: isActive ? '#E11D48' : '#10B981' }}>{amb.status.toUpperCase()}</strong>
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Hospitals */}
        {hospitals.map((hosp) => (
          <Marker key={hosp.id} position={[hosp.lat, hosp.lng]} icon={hospitalIcon}>
            <Popup className="samu-popup">
              <div style={{ background: '#18181B', color: '#FFFFFF', padding: '10px', borderRadius: '12px', fontSize: '12px', minWidth: '200px' }}>
                <strong style={{ color: '#38BDF8', display: 'block', fontSize: '13px' }}>{hosp.name}</strong>
                <p style={{ color: '#A1A1AA', fontSize: '11px', marginTop: '3px' }}>{hosp.address}</p>
                <div style={{ marginTop: '6px', color: '#10B981', fontWeight: 700, fontSize: '11px' }}>
                  {(hosp.availableBeds ?? hosp.available_beds ?? hosp.emergencyBeds ?? 5)} / {(hosp.totalBeds ?? hosp.total_beds ?? 20)} leitos livres
                </div>
                {(hosp.specialties && hosp.specialties.length > 0) && (
                  <p style={{ color: '#A1A1AA', fontSize: '10px', marginTop: '3px' }}>{hosp.specialties.slice(0, 3).join(' · ')}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};
