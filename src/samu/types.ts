export type SamuRole = 'citizen' | 'driver' | 'doctor' | 'admin';

export type AmbulanceType = 'USA' | 'USB' | 'VIR' | 'MOTOLANCIA';

export type AmbulanceStatus = 'offline' | 'available' | 'busy' | 'maintenance';

export type EmergencyCallStatus =
  | 'requested'
  | 'searching'
  | 'offered'
  | 'dispatched'
  | 'en_route_pickup'
  | 'arrived_scene'
  | 'transporting'
  | 'arrived_hospital'
  | 'completed'
  | 'cancelled';

export type ManchesterColor = 'Azul' | 'Verde' | 'Amarelo' | 'Laranja' | 'Vermelho';

export interface Ambulance {
  id: string;
  code: string;
  plate: string;
  type: AmbulanceType;
  status: AmbulanceStatus;
  current_driver_id: string | null;
  current_driver_name: string | null;
  current_lat: number;
  current_lng: number;
  current_heading: number;
  speed: number;
  last_ping_at: string;
  updated_at: string;
}

export interface EmergencyCall {
  id: string;
  citizen_id: string;
  citizen_name: string;
  citizen_phone?: string;
  ambulance_id?: string | null;
  ambulance_code?: string;
  ambulance_plate?: string;
  ambulance_type?: AmbulanceType;
  ambulance_lat?: number;
  ambulance_lng?: number;
  ambulance_heading?: number;
  driver_id?: string | null;
  driver_name?: string | null;
  target_hospital_id?: string | null;
  target_hospital_name?: string | null;
  status: EmergencyCallStatus;
  severity_color: ManchesterColor;
  chief_complaint: string;
  symptoms_summary?: string;
  patient_name: string;
  patient_age?: number;
  patient_conscious: number;
  patient_breathing: number;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  destination_lat?: number;
  destination_lng?: number;
  destination_address?: string;
  eta_minutes?: number;
  distance_km?: number;
  requested_at: string;
  accepted_at?: string;
  arrived_scene_at?: string;
  left_scene_at?: string;
  arrived_hospital_at?: string;
  completed_at?: string;
  cancellation_reason?: string;
  messages?: EmergencyMessage[];
  baph?: BaphRecord | null;
}

export interface EmergencyMessage {
  id: string;
  emergency_call_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  created_at: string;
}

export interface BaphRecord {
  id?: string;
  emergency_call_id: string;
  glasgow_score?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  oxygen_saturation?: number;
  respiratory_rate?: number;
  procedures_performed?: string[] | string;
  observations?: string;
  created_at?: string;
}

export interface HospitalUnit {
  id: string;
  name: string;
  type: string;
  city: string;
  district: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  distance_km: number;
  hours: string;
  services: string[];
  emergencyBeds?: number;
}

export interface DispatchOffer {
  callId: string;
  severityColor: ManchesterColor;
  chiefComplaint: string;
  symptomsSummary?: string;
  patientName: string;
  patientAge?: number;
  patientConscious: number;
  patientBreathing: number;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  distanceKm: number;
  etaMinutes: number;
  timeoutSeconds: number;
}
