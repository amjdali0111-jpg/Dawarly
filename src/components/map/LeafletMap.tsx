"use client";
import "leaflet/dist/leaflet.css";
import { useRef } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMapEvents } from "react-leaflet";
import { publicEnv } from "@/lib/env";

export interface LatLng { lat: number; lng: number }
export interface MapPoint extends LatLng { id: string; label: string; type: "lost" | "found"; href: string }

const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function ClickHandler({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function LeafletMap({
  center, zoom = 16, value, onPick, points, height = 280, onUnavailable,
}: {
  center: LatLng;
  zoom?: number;
  value?: LatLng | null;
  onPick?: (p: LatLng) => void;
  points?: MapPoint[];
  height?: number;
  onUnavailable?: () => void;
}) {
  const tileErrors = useRef(0);
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} style={{ height }} scrollWheelZoom={false}>
      <TileLayer
        url={publicEnv.mapTileUrl}
        attribution={ATTRIBUTION}
        eventHandlers={{
          // Several failed tiles → tell the parent to show the manual fallback.
          tileerror: () => {
            tileErrors.current += 1;
            if (tileErrors.current === 4) onUnavailable?.();
          },
        }}
      />
      {onPick && <ClickHandler onPick={onPick} />}
      {value && <CircleMarker center={[value.lat, value.lng]} radius={10} pathOptions={{ color: "#3fe3d4", fillColor: "#3fe3d4", fillOpacity: 0.6 }} />}
      {points?.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={9}
          pathOptions={{ color: p.type === "lost" ? "#f04848" : "#3fe3d4", fillOpacity: 0.7 }}
        >
          <Popup>
            <a href={p.href} style={{ fontWeight: 600 }}>{p.label}</a>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
