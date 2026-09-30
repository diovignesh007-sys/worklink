import { env } from '../config/env.js';

/**
 * MapProvider interface (§2) — Google today, Mapbox/OSM later. The offline
 * provider returns deterministic plausible results so the wizard and tests
 * work without network access.
 */
export interface MapProvider {
  name: string;
  geocode(address: string, near?: { lat: number; lng: number }): Promise<GeocodeResult[]>;
  reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null>;
  autocomplete(query: string, near?: { lat: number; lng: number }): Promise<AutocompleteResult[]>;
  staticMapUrl(lat: number, lng: number, zoom?: number): string | null;
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
  city?: string;
  country?: string;
  placeId?: string;
}

export interface AutocompleteResult {
  label: string;
  placeId?: string;
}

class GoogleMapsProvider implements MapProvider {
  name = 'google';

  async geocode(address: string): Promise<GeocodeResult[]> {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${env.googleMapsApiKey}`
    );
    const json = (await res.json()) as { results?: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } }; address_components: Array<{ long_name: string; short_name: string; types: string[] }> }>; status: string };
    return (json.results ?? []).slice(0, 5).map((r) => {
      const city = r.address_components.find((c) => c.types.includes('locality'))?.long_name;
      const country = r.address_components.find((c) => c.types.includes('country'))?.short_name;
      return { label: r.formatted_address, lat: r.geometry.location.lat, lng: r.geometry.location.lng, city, country };
    });
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${env.googleMapsApiKey}`
    );
    const json = (await res.json()) as { results?: Array<{ formatted_address: string; address_components: Array<{ long_name: string; short_name: string; types: string[] }> }> };
    const first = json.results?.[0];
    if (!first) return null;
    const city = first.address_components.find((c) => c.types.includes('locality'))?.long_name;
    const country = first.address_components.find((c) => c.types.includes('country'))?.short_name;
    return { label: first.formatted_address, lat, lng, city, country };
  }

  async autocomplete(query: string, near?: { lat: number; lng: number }): Promise<AutocompleteResult[]> {
    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${env.googleMapsApiKey}`;
    if (near) url += `&location=${near.lat},${near.lng}&radius=50000`;
    const res = await fetch(url);
    const json = (await res.json()) as { predictions?: Array<{ description: string; place_id: string }> };
    return (json.predictions ?? []).slice(0, 6).map((p) => ({ label: p.description, placeId: p.place_id }));
  }

  staticMapUrl(lat: number, lng: number, zoom = 14): string {
    return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=640x360&markers=${lat},${lng}&key=${env.googleMapsApiKey}`;
  }
}

// ── Offline provider (dev/test default) ──────────────────────────────────────

const OFFLINE_PLACES: GeocodeResult[] = [
  { label: 'Andheri East, Mumbai, India', lat: 19.1136, lng: 72.8697, city: 'Mumbai', country: 'IN' },
  { label: 'Bandra West, Mumbai, India', lat: 19.0596, lng: 72.8295, city: 'Mumbai', country: 'IN' },
  { label: 'Connaught Place, New Delhi, India', lat: 28.6315, lng: 77.2167, city: 'Delhi', country: 'IN' },
  { label: 'Whitefield, Bengaluru, India', lat: 12.9698, lng: 77.75, city: 'Bengaluru', country: 'IN' },
  { label: 'Hitech City, Hyderabad, India', lat: 17.4239, lng: 78.3428, city: 'Hyderabad', country: 'IN' },
  { label: 'Docklands, London, UK', lat: 51.5054, lng: -0.0236, city: 'London', country: 'GB' },
  { label: 'Williamsburg, Brooklyn, New York, USA', lat: 40.7081, lng: -73.9571, city: 'New York', country: 'US' },
  { label: 'Kreuzberg, Berlin, Germany', lat: 52.4986, lng: 13.4034, city: 'Berlin', country: 'DE' },
  { label: 'Ikeja, Lagos, Nigeria', lat: 6.6018, lng: 3.3515, city: 'Lagos', country: 'NG' },
  { label: 'Makati, Metro Manila, Philippines', lat: 14.5604, lng: 121.0184, city: 'Manila', country: 'PH' },
];

class OfflineMapsProvider implements MapProvider {
  name = 'offline';

  async geocode(address: string): Promise<GeocodeResult[]> {
    const q = address.toLowerCase();
    const hits = OFFLINE_PLACES.filter((p) => p.label.toLowerCase().includes(q.split(/[,\s]+/)[0] ?? '###'));
    return (hits.length ? hits : OFFLINE_PLACES).slice(0, 5).map((p) => ({ ...p, placeId: `offline_${Math.abs(hash(p.label))}` }));
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    const nearest = OFFLINE_PLACES.map((p) => ({ p, d: Math.abs(p.lat - lat) + Math.abs(p.lng - lng) })).sort((a, b) => a.d - b.d)[0];
    if (!nearest) return null;
    return { ...nearest.p, lat, lng, placeId: `offline_${Math.abs(hash(`${lat},${lng}`))}` };
  }

  async autocomplete(query: string): Promise<AutocompleteResult[]> {
    const q = query.toLowerCase();
    return OFFLINE_PLACES.filter((p) => p.label.toLowerCase().includes(q))
      .slice(0, 6)
      .map((p) => ({ label: p.label, placeId: `offline_${Math.abs(hash(p.label))}` }));
  }

  staticMapUrl(): string | null {
    return null; // client renders an OSM/Leaflet-style static fallback
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

let provider: MapProvider | null = null;

export function getMapProvider(): MapProvider {
  if (!provider) provider = env.mapProvider === 'google' && env.googleMapsApiKey ? new GoogleMapsProvider() : new OfflineMapsProvider();
  return provider;
}
