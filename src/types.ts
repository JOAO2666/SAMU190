export type Role = 'user' | 'admin' | 'support';

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar: string;
  provider: string;
  createdAt?: string;
  created_at?: string;
  lastLogin?: string;
  last_login?: string;
  lastSeen?: string | null;
  last_seen?: string | null;
  cpf?: string;
};

export type Unit = {
  id: string;
  name: string;
  type: string;
  city: string;
  district: string;
  address: string;
  phone: string;
  status: string;
  distance_km: number;
  hours: string;
  lat: number;
  lng: number;
  services: string[];
};

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export type Appointment = {
  id: string;
  user_id: string;
  unit_id: string;
  specialty: string;
  professional: string;
  scheduled_at: string;
  status: AppointmentStatus;
  reason: string;
  notes: string;
  created_at: string;
  unit_name?: string;
  unit_district?: string;
  unit_phone?: string;
  user_name?: string;
  user_email?: string;
};

export type Exam = {
  id: string;
  user_id: string;
  title: string;
  unit: string;
  requested_at: string;
  status: string;
  result_url: string | null;
};

export type RecordItem = {
  id: string;
  user_id: string;
  category: string;
  title: string;
  description: string;
  created_at: string;
  user_name?: string;
  user_email?: string;
  creator_name?: string;
};

export type PatientProfile = {
  user_id: string;
  cpf: string;
  birth_date: string;
  phone: string;
  sus_card: string;
  address: string;
  emergency_contact: string;
  updated_at: string;
};

export type TriageRisk = 'low' | 'medium' | 'high' | 'critical';
export type TriageStatus = 'resolved';

export type TriageCase = {
  id: string;
  user_id: string;
  queue_id: string;
  temperature: string;
  sys_bp: string;
  dia_bp: string;
  heart_rate: string;
  resp_rate: string;
  spo2: string;
  glucose: string;
  chief_complaint: string;
  manchester_color: 'Azul' | 'Verde' | 'Amarelo' | 'Laranja' | 'Vermelho';
  status: TriageStatus;
  created_at: string;
  user_name?: string;
  user_email?: string;
  creator_name?: string;
};

export type QueueStatus = 'waiting_triage' | 'waiting_service' | 'called' | 'done' | 'cancelled';

export type QueueEntry = {
  id: string;
  user_id: string;
  unit_id: string;
  service: string;
  chief_complaint: string;
  position: number;
  estimated_minutes: number;
  status: QueueStatus;
  triage_color?: 'Azul' | 'Verde' | 'Amarelo' | 'Laranja' | 'Vermelho';
  triage_time?: string;
  deadline_time?: string;
  created_at: string;
  unit_name?: string;
  unit_address?: string;
  user_name?: string;
  user_email?: string;
};

export type TicketStatus = 'open' | 'in_review' | 'resolved';
export type Priority = 'low' | 'medium' | 'high';

export type Ticket = {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: Priority;
  created_at: string;
  user_name?: string;
  user_email?: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: 'all' | 'users' | 'admins';
  published_at: string;
};

export type Integration = {
  id: string;
  name: string;
  status: 'online' | 'degraded' | 'offline';
  last_sync: string;
  latency_ms: number;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  actor_name?: string;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
};

export type DashboardPayload = {
  user: User;
  metrics: {
    nextAppointments: number;
    availableResults: number;
    activeTickets: number;
    connectedUnits: number;
    activeTriage: number;
    queuePosition: number;
  };
  appointments: Appointment[];
  exams: Exam[];
  records: RecordItem[];
  profile: PatientProfile;
  triage: TriageCase[];
  queue: QueueEntry[];
  tickets: Ticket[];
  units: Unit[];
  announcements: Announcement[];
  users?: { id: string; name: string; email: string; role?: string }[];
};

export type AdminPayload = {
  overview: {
    users: number;
    appointments: number;
    openTickets: number;
    integrationsOnline: number;
    triageWaiting: number;
    queueWaiting: number;
  };
  appointments: Appointment[];
  users: User[];
  tickets: Ticket[];
  triage: TriageCase[];
  queue: QueueEntry[];
  integrations: Integration[];
  announcements: Announcement[];
  auditLogs: AuditLog[];
  records: RecordItem[];
  units: Unit[];
};

export type BootstrapPayload = {
  googleEnabled: boolean;
};
