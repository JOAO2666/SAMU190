import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Download,
  FileText,
  HeartPulse,
  Hospital,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  LockKeyhole,
  LogOut,
  Mail,
  Map,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Save,
  ShieldCheck,
  Stethoscope,
  UserCog,
  UserPlus,
  UsersRound,
  Wifi,
  Trash2,
  CheckCircle,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, fetchBootstrap, googleAuthUrl, mediaUrl } from './api';
import { AuthProvider, useAuth } from './auth';
import { SamuLanding } from './samu/pages/SamuLanding';
import { CitizenApp } from './samu/pages/CitizenApp';
import { DriverApp } from './samu/pages/DriverApp';
import { DispatchCentralApp } from './samu/pages/DispatchCentralApp';
import type {
  AdminPayload,
  Announcement,
  Appointment,
  BootstrapPayload,
  DashboardPayload,
  Integration,
  PatientProfile,
  QueueEntry,
  RecordItem,
  TriageCase,
  TicketStatus,
  Unit,
  User,
} from './types';

const markerIcon = L.divIcon({
  className: 'health-marker',
  html: '<span></span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const AUTO_REFRESH_MS = 30000;

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/samu" element={<SamuLanding />} />
          <Route path="/samu/cidadao" element={<CitizenApp />} />
          <Route path="/samu/socorrista" element={<DriverApp />} />
          <Route path="/samu/central" element={<DispatchCentralApp />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <PortalPage page="home" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/mapa"
            element={
              <ProtectedRoute>
                <PortalPage page="map" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/cadastro"
            element={
              <ProtectedRoute>
                <PortalPage page="profile" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/prontuarios"
            element={
              <ProtectedRoute>
                <PortalPage page="records" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/triagem"
            element={
              <ProtectedRoute role="admin">
                <PortalPage page="triage" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/fila"
            element={
              <ProtectedRoute role="admin">
                <PortalPage page="queue" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="staff">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/samu" replace />;
  return <Navigate to={['admin', 'support'].includes(user.role) ? '/admin' : '/app'} replace />;
}

function ProtectedRoute({ children, role }: { children: React.ReactNode; role?: 'admin' | 'staff' }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (role === 'admin' && user.role !== 'admin') return <Navigate to="/app" replace />;
  if (role === 'staff' && !['admin', 'support'].includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    const isNewUser = new URLSearchParams(window.location.search).get('newUser') === '1';
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    localStorage.setItem('saudeconnect.token', token);
    window.location.replace(isNewUser ? '/app/triagem' : '/app');
  }, [navigate]);

  return <FullPageLoader label="Conectando sua conta..." />;
}

function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchBootstrap().then(setBootstrap).catch(() => undefined);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      const user =
        mode === 'login'
          ? await login({ email, password })
          : await register({ name, email, password });
      navigate(user.role === 'admin' ? '/admin' : mode === 'register' ? '/app/triagem' : '/app', { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao autenticar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-visual" aria-label="Resumo da plataforma">
        <BrandLockup />
        <div className="live-board">
          <div className="live-board-header">
            <span>Rede conectada</span>
            <strong>94%</strong>
          </div>
          <div className="pulse-line">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="mini-grid">
            <div>
              <Hospital size={20} />
              <strong>32</strong>
              <span>unidades</span>
            </div>
            <div>
              <CalendarDays size={20} />
              <strong>148</strong>
              <span>agendamentos</span>
            </div>
            <div>
              <FileText size={20} />
              <strong>2.4k</strong>
              <span>registros</span>
            </div>
          </div>
        </div>
        <div className="auth-copy">
          <h1>SaúdeConnect</h1>
          <p>
            Sistema integrado para atendimento, mapa de unidades, cadastro, prontuários,
            triagem digital e acompanhamento da fila.
          </p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="segmented" role="tablist" aria-label="Tipo de acesso">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">
              <LockKeyhole size={16} />
              Entrar
            </button>
            <button
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
              type="button"
            >
              <UserPlus size={16} />
              Criar conta
            </button>
          </div>

          <form onSubmit={submit} className="auth-form">
            <div>
              <p className="eyebrow">Acesso seguro</p>
              <h2>{mode === 'login' ? 'Entre no portal' : 'Crie seu cadastro'}</h2>
            </div>

            {mode === 'register' && (
              <label>
                Nome completo
                <span>
                  <CircleUserRound size={18} />
                  <input value={name} onChange={(event) => setName(event.target.value)} required />
                </span>
              </label>
            )}

            <label>
              E-mail
              <span>
                <Mail size={18} />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                />
              </span>
            </label>

            <label>
              Senha
              <span>
                <KeyRound size={18} />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                />
              </span>
            </label>
            {mode === 'register' && (
              <small className="field-hint">Use pelo menos 10 caracteres com letra maiuscula, minuscula, numero e simbolo.</small>
            )}

            {message && <div className="form-message error">{message}</div>}

            <button className="primary-action" type="submit" disabled={busy}>
              {busy ? <RefreshCw size={18} className="spin" /> : <ChevronRight size={18} />}
              {mode === 'login' ? 'Entrar agora' : 'Cadastrar e entrar'}
            </button>
          </form>

          <div className="oauth-area">
            <a className="google-button" href={googleAuthUrl()}>
              <ShieldCheck size={18} />
              Entrar com Google
            </a>
            {!bootstrap?.googleEnabled && (
              <small>O fluxo está pronto; falta cadastrar as credenciais OAuth no ambiente publicado.</small>
            )}
          </div>

        </div>
      </section>
    </main>
  );
}

type PortalPageName = 'home' | 'map' | 'profile' | 'records' | 'triage' | 'queue';

function PortalPage({ page }: { page: PortalPageName }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = (silent = false) =>
    api<DashboardPayload>('/dashboard')
      .then((payload) => {
        setData(payload);
        setError('');
        setLastUpdated(new Date());
      })
      .catch((err) => {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar dados.');
        }
      });

  useEffect(() => {
    void load();
  }, []);

  useAutoRefresh(() => load(true), AUTO_REFRESH_MS);

  if (!data) {
    return <DashboardShell title="SaúdeConnect">{error ? <EmptyState message={error} /> : <PanelLoader />}</DashboardShell>;
  }

  return (
    <DashboardShell title={pageTitle(page)} subtitle={pageSubtitle(page)} lastUpdated={lastUpdated}>
      {page === 'home' && <HomePage data={data} />}
      {page === 'map' && <MapPage units={data.units} />}
      {page === 'profile' && <ProfilePage profile={data.profile} onSaved={load} isAdminView={data.user.role === 'admin'} />}
      {page === 'records' && <RecordsPage records={data.records} exams={data.exams} onCreated={load} isAdminView={data.user.role === 'admin'} users={data.users} />}
      {page === 'triage' && <TriagePage triage={data.triage} onCreated={load} isAdminView={data.user.role === 'admin'} users={data.users} queue={data.queue} />}
      {page === 'queue' && <QueuePage queue={data.queue} onCreated={load} users={data.users} units={data.units} />}
    </DashboardShell>
  );
}

function HomePage({ data }: { data: DashboardPayload }) {
  return (
    <>
      <section className="metrics-grid">
        <MetricCard icon={<CalendarDays />} label="Próximas consultas" value={data.metrics.nextAppointments} tone="blue" />
        <MetricCard icon={<FileText />} label="Resultados disponíveis" value={data.metrics.availableResults} tone="green" />
      </section>

      <section className="content-grid">
        <div className="stack">
          <SectionHeader icon={<CalendarDays />} title="Sua agenda" />
          <div className="card-list">
            {data.appointments.map((appointment) => (
              <AppointmentCard key={appointment.id} appointment={appointment} />
            ))}
          </div>
        </div>
      </section>

      <section className="units-band">
        <SectionHeader icon={<Bell />} title="Comunicados" />
        <div className="unit-grid">
          {data.announcements.map((announcement) => (
            <article className="unit-card" key={announcement.id}>
              <div className="unit-topline">
                <strong>{announcement.title}</strong>
                <span>{formatDate(announcement.published_at, false)}</span>
              </div>
              <p>{announcement.body}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    const timeout = setTimeout(() => {
      map.invalidateSize();
      requestAnimationFrame(() => {
        map.flyTo(center, 15, { animate: true, duration: 1.5, easeLinearity: 0.25 });
      });
    }, 150);
    return () => clearTimeout(timeout);
  }, [center, map]);
  return null;
}

function MapPage({ units }: { units: Unit[] }) {
  const [selectedId, setSelectedId] = useState(units[0]?.id || '');
  const [query, setQuery] = useState('');
  
  const filteredUnits = units.filter(unit => 
    unit.name.toLowerCase().includes(query.toLowerCase()) ||
    unit.address.toLowerCase().includes(query.toLowerCase()) ||
    unit.type.toLowerCase().includes(query.toLowerCase())
  );

  const selected = units.find((unit) => unit.id === selectedId) || filteredUnits[0];
  const center: [number, number] = selected ? [selected.lat, selected.lng] : [-23.5505, -46.6333];

  return (
    <section className="map-layout">
      <aside className="map-list">
        <div>
          <h2>Unidades de Saúde</h2>
          <p>Encontre a unidade mais próxima de você</p>
          <div className="search-bar" style={{ marginTop: '16px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-dim)' }} />
            <input 
              type="text" 
              placeholder="Buscar unidade..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}
            />
          </div>
        </div>
        <div className="map-cards">
          {filteredUnits.map((unit) => (
            <button
              className={`map-unit-card ${unit.id === selectedId ? 'active' : ''}`}
              key={unit.id}
              type="button"
              onClick={() => setSelectedId(unit.id)}
            >
              <div>
                <strong>{unit.name}</strong>
                <span>{unit.type}</span>
              </div>
              <StatusBadge status={unit.status} />
              <small>{unit.distance_km.toFixed(1)} km</small>
              <p>{unit.address}</p>
              <small>{unit.hours} · {unit.phone}</small>
            </button>
          ))}
        </div>
      </aside>

      <div className="map-panel">
        <MapContainer center={center} zoom={14} className="leaflet-map" zoomControl={false}>
          <MapController center={center} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomControl position="bottomright" />
          {units.map((unit) => (
            <Marker
              eventHandlers={{ click: () => setSelectedId(unit.id) }}
              icon={markerIcon}
              key={unit.id}
              position={[unit.lat, unit.lng]}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{unit.name}</strong>
                  <span>{unit.type}</span>
                  <p>{unit.address}</p>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${unit.lat},${unit.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation size={16} />
                    Como Chegar
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {selected && (
          <article className="selected-map-card">
            <div>
              <strong>{selected.name}</strong>
              <span>{selected.type}</span>
            </div>
            <p>{selected.address}</p>
            <div className="chip-row">
              <span className="chip">{selected.status}</span>
              <span className="chip">{selected.distance_km.toFixed(1)} km</span>
              <span className="chip">{selected.phone}</span>
            </div>
            <a
              className="primary-action map-route"
              href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation size={18} />
              Como Chegar
            </a>
          </article>
        )}
      </div>
    </section>
  );
}

function ProfilePage({ profile, onSaved, isAdminView }: { profile: PatientProfile; onSaved: () => Promise<void>; isAdminView?: boolean }) {
  const { refresh, user } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    cpf: isAdminView ? '' : profile.cpf || '',
    birthDate: isAdminView ? '' : profile.birth_date || '',
    phone: isAdminView ? '' : profile.phone || '',
    susCard: isAdminView ? '' : profile.sus_card || '',
    address: isAdminView ? '' : profile.address || '',
    emergencyContact: isAdminView ? '' : profile.emergency_contact || '',
  });
  const [message, setMessage] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '');
  const [avatarBusy, setAvatarBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    try {
      if (isAdminView) {
        await api('/admin/users', { method: 'POST', body: { ...form, role: 'user' } });
        setMessage('Paciente cadastrado com sucesso.');
        setForm({ name: '', email: '', password: '', cpf: '', birthDate: '', phone: '', susCard: '', address: '', emergencyContact: '' });
      } else {
        await api('/profile', { method: 'PUT', body: form });
        setMessage('Cadastro atualizado com sucesso.');
      }
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar cadastro.');
    }
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setMessage('Envie uma imagem PNG, JPG ou WebP.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage('A foto deve ter no maximo 2 MB.');
      return;
    }

    setAvatarBusy(true);
    try {
      const imageData = await fileToDataUrl(file);
      setAvatarPreview(imageData);
      const payload = await api<{ user: User }>('/auth/avatar', { method: 'POST', body: { imageData } });
      setAvatarPreview(payload.user.avatar);
      await refresh();
      setMessage('Foto atualizada com sucesso.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao enviar foto.');
    } finally {
      setAvatarBusy(false);
      event.target.value = '';
    }
  }

  return (
    <form className="form-grid-panel" onSubmit={submit}>
      <SectionHeader icon={<UserPlus />} title={isAdminView ? "Cadastrar Novo Paciente" : "Cadastro do cidadão"} />
      
      {!isAdminView && (
      <div className="photo-uploader full-span">
        <Avatar label={avatarPreview || user?.name || 'SC'} />
        <div>
          <strong>Foto do perfil</strong>
          <span>Use uma imagem PNG, JPG ou WebP de ate 2 MB.</span>
        </div>
        <label className="upload-button">
          {avatarBusy ? 'Enviando...' : 'Anexar foto'}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} disabled={avatarBusy} />
        </label>
      </div>
      )}

      {isAdminView && (
        <>
          <label>
            Nome
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            E-mail
            <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </label>
          <label>
            Senha Padrão
            <input required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </label>
        </>
      )}
      <label>
        CPF
        <input value={form.cpf} onChange={(event) => setForm({ ...form, cpf: event.target.value })} />
      </label>
      <label>
        Data de nascimento
        <input
          type="date"
          value={form.birthDate}
          onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
        />
      </label>
      <label>
        Telefone
        <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
      </label>
      <label>
        Cartão SUS
        <input value={form.susCard} onChange={(event) => setForm({ ...form, susCard: event.target.value })} />
      </label>
      <label className="full-span">
        Endereço
        <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
      </label>
      <label className="full-span">
        Contato de emergência
        <input
          value={form.emergencyContact}
          onChange={(event) => setForm({ ...form, emergencyContact: event.target.value })}
        />
      </label>
      {message && <div className="form-message full-span">{message}</div>}
      <button type="submit" className="primary-action full-span">
        <Save size={18} />
        {isAdminView ? "Cadastrar Paciente" : "Salvar Cadastro"}
      </button>
    </form>
  );
}

function RecordsPage({
  exams,
  isAdminView = false,
  onCreated,
  records,
  users,
}: {
  exams: DashboardPayload['exams'];
  isAdminView?: boolean;
  onCreated: () => Promise<void>;
  records: RecordItem[];
  users?: DashboardPayload['users'];
}) {
  const [category, setCategory] = useState('Geral');
  const [title, setTitle] = useState('Nova evolução clínica');
  const [description, setDescription] = useState('Paciente relata melhora após orientações da equipe.');
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [activeTab, setActiveTab] = useState('Geral');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    try {
      await api('/records', { method: 'POST', body: { category, title, description, userId } });
      setMessage('Registro adicionado ao prontuário.');
      await onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar registro.');
    }
  }

  async function deleteRecord(id: string) {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return;
    try {
      await api(`/admin/records/${id}`, { method: 'DELETE' });
      await onCreated();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Falha ao excluir registro.');
    }
  }

  const patientUsers = users?.filter((user) => user.role === 'user') || [];
  const allItems = [...records, ...exams]
    .sort((a, b) => Date.parse('requested_at' in b ? b.requested_at : b.created_at) - Date.parse('requested_at' in a ? a.requested_at : a.created_at));

  const filteredItems = allItems.filter(item => {
    // Tab filtering
    if (activeTab === 'Exames') {
      if (!('requested_at' in item) && item.category !== 'Exames') return false;
    } else if (activeTab !== 'Geral') {
      if ('requested_at' in item) return false;
      if (item.category !== activeTab) return false;
    }
    // The administrator always works with one patient record at a time.
    if (isAdminView) {
      if (!filterUserId || item.user_id !== filterUserId) return false;
    }
    return true;
  });

  return (
    <section className="content-grid">
      <div className="timeline">
        <SectionHeader icon={<ClipboardList />} title={isAdminView ? 'Prontuários da rede' : 'Prontuários'} />
        
        {isAdminView && users && (
          <div className="admin-filter" style={{ marginBottom: '16px' }}>
            <label>
              Filtrar por Paciente:
              <select value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)} style={{ marginLeft: '8px', padding: '4px', borderRadius: '4px', border: '1px solid var(--border)' }}>
              <option value="">Selecione um paciente</option>
              {patientUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="record-tabs" role="tablist" aria-label="Categorias do prontuário">
          {['Geral', 'Exames', 'Medicação', 'Procedimento Cirúrgico'].map(tab => (
            <button
              key={tab}
              type="button"
              className={`record-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
              role="tab"
              aria-selected={activeTab === tab}
            >
              {tab}
            </button>
          ))}
        </div>

        {isAdminView && !filterUserId ? (
          <div className="admin-empty">Selecione um paciente para visualizar o prontuário.</div>
        ) : filteredItems.map((item) => (
            <div className="timeline-item" key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="timeline-dot" />
              <div style={{ flex: 1 }}>
                <div>
                  <strong>{item.title}</strong>
                  {'creator_name' in item && item.creator_name && (
                    <small className="record-owner">Enviado por: {item.creator_name}</small>
                  )}
                  <p>{'status' in item ? `${item.status} em ${item.unit}` : item.description}</p>
                  <small>{formatDate('requested_at' in item ? item.requested_at : item.created_at)}</small>
                </div>
              </div>
              {isAdminView && !('requested_at' in item) && (
                <button 
                  type="button"
                  className="danger-action" 
                  title="Excluir"
                  onClick={() => void deleteRecord(item.id)}
                >
                  <Trash2 size={14} /> Excluir
                </button>
              )}
            </div>
          ))}
          {!isAdminView && !filteredItems.length && <div className="admin-empty">Nenhum registro encontrado.</div>}
          {isAdminView && Boolean(filterUserId) && !filteredItems.length && <div className="admin-empty">Nenhum registro encontrado para este paciente.</div>}
      </div>
      
      {isAdminView && (
      <form className="action-panel" onSubmit={submit}>
        <SectionHeader icon={<Plus />} title="Adicionar registro" />
        {users && (
          <label>
            Paciente
            <select value={userId} onChange={(event) => setUserId(event.target.value)} required>
              <option value="">Selecione um paciente...</option>
              {patientUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Categoria
          <select value={category} onChange={(event) => setCategory(event.target.value)} required>
            <option value="Geral">Geral</option>
            <option value="Exames">Exames</option>
            <option value="Medicação">Medicação</option>
            <option value="Procedimento Cirúrgico">Procedimento Cirúrgico</option>
          </select>
        </label>
        <label>
          Título
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          Descrição
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
        </label>
        {message && <div className="form-message">{message}</div>}
        <button className="primary-action" type="submit">
          <FileText size={18} />
          Salvar registro
        </button>
      </form>
      )}
    </section>
  );
}

function TriagePage({
  isAdminView = false,
  onCreated,
  queue,
}: {
  isAdminView?: boolean;
  onCreated: () => Promise<void>;
  triage: TriageCase[];
  users?: DashboardPayload['users'];
  queue?: QueueEntry[];
}) {
  const [triageQueueId, setTriageQueueId] = useState<string | null>(null);
  const [triageData, setTriageData] = useState({
    temperature: '',
    sysBp: '',
    diaBp: '',
    heartRate: '',
    respRate: '',
    spo2: '',
    glucose: '',
    chiefComplaint: '',
    manchesterColor: 'Verde' as NonNullable<QueueEntry['triage_color']>,
  });
  const [message, setMessage] = useState('');
  const selectedQueueEntry = queue?.find((item) => item.id === triageQueueId);

  async function submitTriage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!triageQueueId) return;
    setMessage('');
    try {
      await api('/triage', { 
        method: 'POST', 
        body: { queueId: triageQueueId, ...triageData } 
      });
      setMessage('Triagem registrada. O paciente foi encaminhado para atendimento.');
      setTriageQueueId(null);
      setTriageData({
        temperature: '', sysBp: '', diaBp: '', heartRate: '', respRate: '',
        spo2: '', glucose: '', chiefComplaint: '', manchesterColor: 'Verde',
      });
      await onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao registrar triagem.');
    }
  }

  const unitFilter = sessionStorage.getItem('saudeconnect.unitFilter') || '';
  const queueWaitingTriage = queue?.filter(q => q.status === 'waiting_triage' && (!unitFilter || q.unit_id === unitFilter)) || [];

  return (
    <section className="content-grid">
      <div className="stack">
        <SectionHeader icon={<Stethoscope />} title="Atendimentos aguardando triagem" />
        <div className="card-list">
          {queueWaitingTriage.map((item) => (
            <article className="appointment-card" key={item.id}>
              <span className="icon-tile">
                <Activity size={20} />
              </span>
              <div>
                <div className="card-title-line">
                  <strong>{item.user_name}</strong>
                  <QueueStatusBadge item={item} />
                </div>
                <p>{item.service} - {item.unit_name}</p>
                {item.chief_complaint && <small>Queixa principal: {item.chief_complaint}</small>}
                {isAdminView && (
                  <button className="triage-action" type="button" onClick={() => setTriageQueueId(item.id)}>
                    <Stethoscope size={18} />
                    Realizar Triagem
                  </button>
                )}
              </div>
            </article>
          ))}
          {!queueWaitingTriage.length && <div className="admin-empty">Nenhum paciente aguardando triagem.</div>}
        </div>
      </div>

      {triageQueueId && (
        <div className="modal-backdrop" role="presentation">
          <form className="triage-modal" onSubmit={submitTriage} role="dialog" aria-modal="true" aria-labelledby="triage-modal-title">
            <SectionHeader icon={<Activity />} title="Realizar Triagem (Protocolo de Manchester)" />
            {selectedQueueEntry && (
              <div className="triage-patient-summary">
                <strong>{selectedQueueEntry.user_name}</strong>
                <span>{selectedQueueEntry.unit_name} - {selectedQueueEntry.service}</span>
              </div>
            )}

            <div className="triage-fields">
              <label>
                Temperatura (°C)
                <input type="number" step="0.1" min="20" max="45" required value={triageData.temperature} onChange={(e) => setTriageData({...triageData, temperature: e.target.value})} placeholder="36,5" />
              </label>
              <label>
                Frequência cardíaca (bpm)
                <input type="number" min="0" required value={triageData.heartRate} onChange={(e) => setTriageData({...triageData, heartRate: e.target.value})} placeholder="80" />
              </label>
              <label>
                Pressão arterial sistólica (mmHg)
                <input type="number" min="0" required value={triageData.sysBp} onChange={(e) => setTriageData({...triageData, sysBp: e.target.value})} placeholder="120" />
              </label>
              <label>
                Pressão arterial diastólica (mmHg)
                <input type="number" min="0" required value={triageData.diaBp} onChange={(e) => setTriageData({...triageData, diaBp: e.target.value})} placeholder="80" />
              </label>
              <label>
                Frequência respiratória (irpm)
                <input type="number" min="0" required value={triageData.respRate} onChange={(e) => setTriageData({...triageData, respRate: e.target.value})} placeholder="16" />
              </label>
              <label>
                Saturação de oxigênio (%)
                <input type="number" min="0" max="100" required value={triageData.spo2} onChange={(e) => setTriageData({...triageData, spo2: e.target.value})} placeholder="98" />
              </label>
              <label>
                Glicemia (mg/dL)
                <input type="number" min="0" required value={triageData.glucose} onChange={(e) => setTriageData({...triageData, glucose: e.target.value})} placeholder="90" />
              </label>
              <label>
                Classificação de Manchester
                <select required value={triageData.manchesterColor} onChange={(e) => setTriageData({...triageData, manchesterColor: e.target.value as NonNullable<QueueEntry['triage_color']>})}>
                  <option value="Azul">Azul - até 240 minutos</option>
                  <option value="Verde">Verde - até 120 minutos</option>
                  <option value="Amarelo">Amarelo - até 50 minutos</option>
                  <option value="Laranja">Laranja - até 10 minutos</option>
                  <option value="Vermelho">Vermelho - atendimento imediato</option>
                </select>
              </label>
            </div>

            <label className="triage-complaint">
              Queixa principal / avaliação
              <textarea required value={triageData.chiefComplaint} onChange={(e) => setTriageData({...triageData, chiefComplaint: e.target.value})} rows={3}></textarea>
            </label>
            <div className="triage-timestamp">
              <strong>Horário da triagem</strong>
              <span>Registrado automaticamente ao salvar.</span>
            </div>

            {message && <div className="form-message">{message}</div>}

            <div className="modal-actions">
              <button type="submit" className="primary-action"><Save size={18} />Salvar triagem</button>
              <button type="button" className="outline-action" onClick={() => setTriageQueueId(null)}><X size={18} />Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function QueuePage({ onCreated, queue, users, units }: { onCreated: () => Promise<void>; queue: QueueEntry[]; users?: DashboardPayload['users']; units?: any[] }) {
  const [service, setService] = useState('Clínica geral');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState(() => sessionStorage.getItem('saudeconnect.unitFilter') || '');

  const unitFilter = sessionStorage.getItem('saudeconnect.unitFilter') || '';
  const filteredQueue = queue?.filter(q => !unitFilter || q.unit_id === unitFilter) || [];

  async function completeQueueEntry(id: string) {
    if (!confirm('Tem certeza que deseja concluir este atendimento?')) return;
    try {
      await api(`/admin/queue/${id}`, { method: 'PATCH', body: { status: 'done' } });
      await onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao concluir atendimento.');
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    
    if (!selectedUnitId) {
      setMessage('Nenhuma unidade selecionada.');
      return;
    }
    try {
      await api('/queue', { method: 'POST', body: { unitId: selectedUnitId, service, chiefComplaint, userId } });
      setChiefComplaint('');
      setMessage('Paciente enviado para a fila de triagem.');
      await onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao entrar na fila.');
    }
  }

  return (
    <section className="content-grid">
      <div className="stack">
        <SectionHeader icon={<ListChecks />} title="Fila de atendimento" />
        <div className="queue-board">
          {filteredQueue.map((item) => (
            <article className={`queue-card ${queuePriorityClass(item.triage_color)}`} key={item.id}>
              <div>
                <strong>{item.user_name}</strong>
                <span>{item.service}</span>
              </div>
              <p>{item.unit_name}</p>
              {item.chief_complaint && <small>Queixa principal: {item.chief_complaint}</small>}
              <QueueDeadline item={item} />
              <QueueStatusBadge item={item} />
              {users && (
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button className="danger-action" onClick={() => void completeQueueEntry(item.id)} style={{ padding: '0 8px', height: '28px', fontSize: '0.85rem', background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' }} title="Concluir atendimento">
                    <CheckCircle size={14} /> Concluir
                  </button>
                </div>
              )}
            </article>
          ))}
          {!filteredQueue.length && <div className="admin-empty">Nenhum atendimento na fila desta unidade.</div>}
        </div>
      </div>
      {users && (
        <form className="action-panel" onSubmit={submit}>
          <SectionHeader icon={<Plus />} title="Enviar paciente à fila" />
          
          {units && units.length > 0 && (
            <label>
              Unidade
              <select value={selectedUnitId} onChange={(event) => setSelectedUnitId(event.target.value)} required>
                <option value="">Selecione a unidade...</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
          )}

          <label>
            Paciente
            <select value={userId} onChange={(event) => setUserId(event.target.value)} required>
              <option value="">Selecione um paciente...</option>
              <option value="">Selecione um paciente</option>
              {users.filter((u) => u.role === 'user').map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </label>
          <label>
            Serviço
            <input value={service} onChange={(event) => setService(event.target.value)} required />
          </label>
          <label>
            Queixa principal
            <textarea value={chiefComplaint} onChange={(event) => setChiefComplaint(event.target.value)} required />
          </label>
          {message && <div className="form-message">{message}</div>}
          <button className="primary-action" type="submit">
            <Plus size={18} />
            Enviar à fila
          </button>
        </form>
      )}
    </section>
  );
}

function AdminDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isSupport = user?.role === 'support';
  const [data, setData] = useState<AdminPayload | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [announcement, setAnnouncement] = useState({ title: '', body: '', audience: 'all' });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [unitFilter, setUnitFilter] = useState(() => sessionStorage.getItem('saudeconnect.unitFilter') || '');


  const load = (silent = false, specificUnit = unitFilter) => {
    if (!silent) setError('');
    const queryParam = specificUnit ? `?unit_id=${specificUnit}` : '';
    return api<AdminPayload>(`/admin/overview${queryParam}`)
      .then((payload) => {
        setData(payload);
        setLastUpdated(new Date());
      })
      .catch((err) => {
        if (!silent) setError(err instanceof Error ? err.message : 'Erro ao carregar administração.');
      });
  };

  useEffect(() => {
    sessionStorage.setItem('saudeconnect.unitFilter', unitFilter);
    void load();
  }, [unitFilter]);

  useAutoRefresh(() => load(true), AUTO_REFRESH_MS);

  async function mutate(path: string, body: Record<string, unknown>, successMessage: string) {
    setError('');
    setNotice('');
    try {
      await api(path, { method: 'PATCH', body });
      setNotice(successMessage);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.');
    }
  }



  async function deleteAppointment(id: string) {
    if (!confirm('Tem certeza que deseja excluir este agendamento?')) return;
    try {
      await api(`/admin/appointments/${id}`, { method: 'DELETE' });
      setNotice('Agendamento excluído com sucesso.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir agendamento.');
    }
  }


  async function updateIntegration(id: string, status: Integration['status']) {
    await mutate(`/admin/integrations/${id}`, { status }, 'Integração atualizada.');
  }

  async function updateTicket(id: string, status: TicketStatus) {
    await mutate(`/admin/tickets/${id}`, { status }, 'Chamado atualizado.');
  }

  async function updateUserRole(id: string, role: User['role']) {
    await mutate(`/admin/users/${id}/role`, { role }, 'Permissão atualizada.');
  }

  async function completeQueueEntry(id: string) {
    if (!confirm('Tem certeza que deseja concluir este atendimento?')) return;
    try {
      await api(`/admin/queue/${id}`, { method: 'PATCH', body: { status: 'done' } });
      setNotice('Atendimento concluído.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao concluir atendimento.');
    }
  }

  async function deleteUser(id: string) {
    if (!confirm('Tem certeza que deseja excluir permanentemente este usuário?')) return;
    try {
      await api(`/admin/users/${id}`, { method: 'DELETE' });
      setNotice('Usuário excluído com sucesso.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir usuário.');
    }
  }

  async function publishAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/admin/announcements', { method: 'POST', body: announcement });
      setAnnouncement({ title: '', body: '', audience: 'all' });
      setNotice('Aviso publicado para o portal.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível publicar o aviso.');
    }
  }

  function exportAdminReport() {
    if (!data) return;
    const rows = [
      ['categoria', 'nome', 'detalhe', 'status'],
      ...data.appointments.map((item) => ['agendamento', item.user_name || '', item.specialty, item.status]),
      ...data.triage.map((item) => ['triagem', item.user_name || '', item.chief_complaint, item.status]),
      ...data.queue.map((item) => ['fila', item.user_name || '', item.service, item.status]),
      ...data.tickets.map((item) => ['chamado', item.user_name || '', item.subject, item.status]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `saudeconnect-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const matches = (...values: Array<string | number | undefined | null>) =>
    !normalizedQuery || values.some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(normalizedQuery));
  const networkHealth = data?.integrations.length
    ? Math.round(data.integrations.reduce(
        (total, item) => total + (item.status === 'online' ? 100 : item.status === 'degraded' ? 70 : 20),
        0,
      ) / data.integrations.length)
    : 0;
  const visibleAppointments = data?.appointments.filter((item) =>
    matches(item.user_name, item.user_email, item.specialty, item.unit_name, item.status),
  ) || [];
  const visibleQueue = data?.queue.filter((item) => matches(item.user_name, item.service, item.unit_name, item.status)) || [];
  const visibleUsers = data?.users.filter((item) => matches(item.name, item.email, item.role, item.provider, item.cpf)) || [];
  const visibleTickets = data?.tickets.filter((item) => matches(item.user_name, item.subject, item.message, item.status)) || [];

  if (!data) return <DashboardShell title="Administração">{error ? <EmptyState message={error} /> : <PanelLoader />}</DashboardShell>;

  return (
    <DashboardShell title="Administração" subtitle="Operação, demanda, triagem, fila e integrações em tempo real." lastUpdated={lastUpdated}>
      <section className="admin-toolbar" aria-label="Ferramentas administrativas">
        <label className="admin-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, CPF, unidade, status..."
          />
        </label>
        <select 
          className="admin-tool-button" 
          value={unitFilter} 
          onChange={(e) => setUnitFilter(e.target.value)}
          style={{ appearance: 'auto', background: 'var(--surface)' }}
        >
          <option value="">Todas as Unidades</option>
          {data?.units?.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <button className="admin-tool-button" type="button" onClick={() => void load()} title="Atualizar dados">
          <RefreshCw size={18} />
          Atualizar
        </button>
        <button className="admin-tool-button primary" type="button" onClick={exportAdminReport}>
          <Download size={18} />
          Exportar CSV
        </button>
      </section>

      {(notice || error) && <div className={`admin-feedback ${error ? 'error' : ''}`}>{error || notice}</div>}

      <section className="metrics-grid">
        <MetricCard icon={<UsersRound />} label="Usuários" value={data.overview.users} tone="blue" />
        {isAdmin && <MetricCard icon={<CalendarDays />} label="Agendamentos" value={data.overview.appointments} tone="green" />}
        {isAdmin && <MetricCard icon={<Stethoscope />} label="Triagens abertas" value={data.overview.triageWaiting} tone="orange" />}
        {isAdmin && <MetricCard icon={<ListChecks />} label="Fila aguardando" value={data.overview.queueWaiting} tone="purple" />}
        {isSupport && <MetricCard icon={<ClipboardList />} label="Chamados abertos" value={data.overview.openTickets} tone="red" />}
      </section>

      {isAdmin && (
      <section className="admin-overview-grid">
        <article className="network-card">
          <div className="network-card-header">
            <div>
              <span>Rede conectada</span>
              <small>Saúde dos serviços integrados</small>
            </div>
            <strong>{networkHealth}%</strong>
          </div>
          <div className="network-bars" aria-label={`Saúde da rede: ${networkHealth}%`}>
            {data.integrations.map((integration, index) => (
              <i
                className={`network-bar status-${integration.status}`}
                key={integration.id}
                style={{ height: `${48 + index * 11}px` }}
                title={`${integration.name}: ${integration.status}`}
              />
            ))}
          </div>
          <div className="network-summary">
            <div><Hospital size={18} /><strong>{data.overview.users}</strong><span>usuários</span></div>
            <div><CalendarDays size={18} /><strong>{data.overview.appointments}</strong><span>agendamentos</span></div>
          </div>
        </article>

        <form className="announcement-form" onSubmit={publishAnnouncement}>
          <SectionHeader icon={<Megaphone />} title="Publicar aviso" />
          <label>
            Título
            <input
              value={announcement.title}
              onChange={(event) => setAnnouncement((current) => ({ ...current, title: event.target.value }))}
              placeholder="Ex.: Campanha de vacinação"
              required
            />
          </label>
          <label>
            Mensagem
            <textarea
              value={announcement.body}
              onChange={(event) => setAnnouncement((current) => ({ ...current, body: event.target.value }))}
              placeholder="Escreva o aviso que aparecerá no portal"
              required
            />
          </label>
          <label>
            Público
            <select
              value={announcement.audience}
              onChange={(event) => setAnnouncement((current) => ({ ...current, audience: event.target.value }))}
            >
              <option value="all">Todos</option>
              <option value="users">Usuários</option>
              <option value="admins">Administradores</option>
            </select>
          </label>
          <button className="primary-action" type="submit"><Megaphone size={18} />Publicar aviso</button>
        </form>
      </section>
      )}

      {isAdmin && (
      <section className="admin-grid">
        <AdminTable title="Agenda da rede" icon={<CalendarDays />}>
          {visibleAppointments.map((appointment) => (
            <div className="admin-row" key={appointment.id}>
              <div>
                <strong>{appointment.user_name}</strong>
                <span>{appointment.specialty} - {appointment.unit_name}</span>
              </div>
              <small>{formatDate(appointment.scheduled_at)}</small>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <StatusBadge status={appointment.status} />
                <button 
                  className="danger-action" 
                  title="Excluir"
                  onClick={() => void deleteAppointment(appointment.id)}
                  style={{ height: 32, padding: '0 12px', fontSize: '0.85rem' }}
                >
                  <Trash2 size={14} /> Excluir
                </button>
              </div>
            </div>
          ))}
          {!visibleAppointments.length && <div className="admin-empty">Nenhum agendamento encontrado.</div>}
        </AdminTable>

        <AppointmentForm units={data.units} users={data.users} onCreated={() => load()} />


      </section>
      )}

      {isAdmin && (
      <section className="admin-grid">
        <AdminTable title="Fila" icon={<ListChecks />}>
          {visibleQueue.map((item) => (
            <div className={`admin-row queue-row ${queuePriorityClass(item.triage_color)}`} key={item.id}>
              <div>
                <strong>{item.user_name}</strong>
                <span>{item.service} - {item.unit_name}</span>
                {item.chief_complaint && <span className="queue-complaint">Queixa principal: {item.chief_complaint}</span>}
              </div>
              <QueueDeadline item={item} />
              <QueueStatusBadge item={item} />
              <button 
                className="danger-action" 
                title="Concluir atendimento"
                onClick={() => void completeQueueEntry(item.id)}
                style={{ height: 32, padding: '0 12px', fontSize: '0.85rem', background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' }}
              >
                <CheckCircle size={14} /> Concluir
              </button>
            </div>
          ))}
          {!visibleQueue.length && <div className="admin-empty">Nenhuma entrada de fila encontrada.</div>}
        </AdminTable>

        <AdminQueueForm units={data.units} users={data.users} onCreated={() => load()} />


        <AdminTable title="Integrações" icon={<Wifi />} compact>
          {data.integrations.map((integration) => (
            <div className="admin-row" key={integration.id}>
              <div>
                <strong>{integration.name}</strong>
                <span>{integration.latency_ms} ms - última sync {formatDate(integration.last_sync, false)}</span>
              </div>
              <StatusBadge status={integration.status} />
              <select
                value={integration.status}
                onChange={(event) => void updateIntegration(integration.id, event.target.value as Integration['status'])}
              >
                <option value="online">Online</option>
                <option value="degraded">Instável</option>
                <option value="offline">Offline</option>
              </select>
            </div>
          ))}
        </AdminTable>
      </section>
      )}

      <section className="admin-grid">
        <AdminTable title="Usuários e permissões" icon={<UserCog />}>
          {visibleUsers.map((item) => {
            const presence = presenceInfo(item.last_seen || item.lastSeen || item.last_login || item.lastLogin);
            return (
              <div className="admin-row" key={item.id}>
                <div>
                  <strong>
                    <PresenceDot status={presence.status} />
                    {item.name}
                  </strong>
                  <span>{item.email} - acesso {item.provider}</span>
                  <small className={`presence-label status-${presence.status}`}>{presence.label}</small>
                </div>
                <small>{item.last_seen || item.lastSeen ? `Último acesso ${formatRelativeTime(String(item.last_seen || item.lastSeen))}` : (item.last_login || item.lastLogin ? `Último acesso ${formatRelativeTime(String(item.last_login || item.lastLogin))}` : 'Sem acesso recente')}</small>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select value={item.role} onChange={(event) => void updateUserRole(item.id, event.target.value as User['role'])}>
                    <option value="user">Usuário</option>
                    <option value="admin">Administrador</option>
                    <option value="support">Suporte Técnico</option>
                  </select>
                  <button 
                    className="danger-action" 
                    title="Excluir"
                    onClick={() => void deleteUser(item.id)}
                    style={{ height: 32, padding: '0 12px', fontSize: '0.85rem' }}
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              </div>
            );
          })}
          {!visibleUsers.length && <div className="admin-empty">Nenhum usuário encontrado.</div>}
        </AdminTable>

        {isSupport && (
          <>
            <AdminTable title="Chamados de suporte" icon={<ClipboardList />} compact>
              {visibleTickets.map((item) => (
                <div className="admin-row" key={item.id}>
                  <div>
                    <strong>{item.subject}</strong>
                    <span>{item.user_name} - {item.message}</span>
                  </div>
                  <StatusBadge status={item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warn' : 'info'} />
                  <select value={item.status} onChange={(event) => void updateTicket(item.id, event.target.value as TicketStatus)}>
                    <option value="open">Aberto</option>
                    <option value="in_review">Em análise</option>
                    <option value="resolved">Resolvido</option>
                  </select>
                </div>
              ))}
              {!visibleTickets.length && <div className="admin-empty">Nenhum chamado encontrado.</div>}
            </AdminTable>

            <AdminTable title="Unidades" icon={<Hospital />} compact>
              {data?.units?.map((unit) => (
                <div className="admin-row" key={unit.id}>
                  <div>
                    <strong>{unit.name}</strong>
                    <span>{unit.address}</span>
                  </div>
                  <StatusBadge status={unit.status} />
                  <small>{unit.hours} - {unit.phone}</small>
                </div>
              ))}
            </AdminTable>
          </>
        )}
      </section>

      {isAdmin && (
      <section className="admin-grid">


        <AdminTable title="Avisos publicados" icon={<Megaphone />} compact>
          {data.announcements.map((item) => (
            <div className="admin-row" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </div>
              <small>{item.audience} - {formatDate(item.published_at, false)}</small>
            </div>
          ))}
        </AdminTable>

        <AdminTable title="Atividade recente" icon={<ShieldCheck />} compact>
          {data.auditLogs.slice(0, 5).map((item) => (
            <div className="admin-row" key={item.id}>
              <div>
                <strong>{item.actor_name || 'Sistema'}</strong>
                <span>{item.action} em {item.entity}</span>
              </div>
              <small>{formatDate(item.created_at, false)}</small>
            </div>
          ))}
        </AdminTable>
      </section>
      )}
    </DashboardShell>
  );
}

function DashboardShell({
  children,
  lastUpdated,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  lastUpdated?: Date | null;
  title: string;
  subtitle?: string;
}) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isSupport = user?.role === 'support';
  const homePath = ['admin', 'support'].includes(user?.role || '') ? '/admin' : '/app';
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('saudeconnect.sidebar') !== 'closed');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [hasViewedNotifications, setHasViewedNotifications] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notificationsError, setNotificationsError] = useState('');

  useEffect(() => {
    localStorage.setItem('saudeconnect.sidebar', sidebarOpen ? 'open' : 'closed');
  }, [sidebarOpen]);

  const loadNotifications = useCallback(async () => {
    try {
      const payload = await api<{ announcements: Announcement[] }>('/notifications');
      setAnnouncements((prev) => {
        if (prev.length !== payload.announcements.length) setHasViewedNotifications(false);
        return payload.announcements;
      });
      setNotificationsError('');
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : 'Falha ao carregar avisos.');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadNotifications();
  }, [user, loadNotifications]);

  useAutoRefresh(() => {
    if (user) void loadNotifications();
  }, AUTO_REFRESH_MS);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.notification-area')) setNotificationsOpen(false);
    };
    window.addEventListener('click', onPointerDown);
    return () => window.removeEventListener('click', onPointerDown);
  }, [notificationsOpen]);

  return (
    <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <BrandLockup small />
          <button
            type="button"
            className="sidebar-toggle inside"
            onClick={() => setSidebarOpen(false)}
            aria-label="Ocultar menu"
            title="Ocultar menu"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        <nav>
          <NavLink end to={homePath}>
            <LayoutDashboard size={18} />
            Início
          </NavLink>
          {!isSupport && (
            <NavLink to="/app/mapa">
              <Map size={18} />
              Mapa
            </NavLink>
          )}
          {!isSupport && (
            <NavLink to="/app/cadastro">
              <UserPlus size={18} />
              Cadastro
            </NavLink>
          )}
          {!isSupport && (
            <NavLink to="/app/prontuarios">
              <FileText size={18} />
              Prontuários
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/app/triagem">
              <Stethoscope size={18} />
              Triagem
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/app/fila">
              <ListChecks size={18} />
              Fila
            </NavLink>
          )}
          <button type="button" onClick={() => setSidebarOpen(false)} className="sidebar-hide-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--teal)', border: 'none', color: 'white', padding: '10px 16px', margin: '8px 12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 500 }}>
            <PanelLeftClose size={18} />
            Ocultar Menu
          </button>
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-main">
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setSidebarOpen((current) => !current)}
              aria-label={sidebarOpen ? 'Ocultar menu' : 'Mostrar menu'}
              title={sidebarOpen ? 'Ocultar menu' : 'Mostrar menu'}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <div>
              <p className="eyebrow">{user?.role === 'admin' ? 'Gestão da rede' : 'Sistema Integrado'}</p>
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
              {lastUpdated && (
                <small className="live-badge">
                  <RefreshCw size={12} className="spin-slow" />
                  Atualizado {formatRelativeTime(lastUpdated.toISOString())}
                </small>
              )}
            </div>
          </div>
          <div className="user-pill">
            <div className="notification-area">
              <button
                type="button"
                className={`icon-button ${notificationsOpen ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setNotificationsOpen((current) => !current);
                  setHasViewedNotifications(true);
                  if (!notificationsOpen) void loadNotifications();
                }}
                aria-label="Notificações"
                title="Notificações"
              >
                <Bell size={18} />
                {announcements.length > 0 && !hasViewedNotifications && <span className="notification-count">{announcements.length}</span>}
              </button>
              {notificationsOpen && (
                <div className="notification-panel">
                  <div className="notification-panel-head">
                    <strong>Notificações</strong>
                    <button type="button" onClick={() => void loadNotifications()} aria-label="Atualizar avisos">
                      <RefreshCw size={14} />
                    </button>
                  </div>
                  {notificationsError && <div className="notification-empty">{notificationsError}</div>}
                  {!notificationsError && announcements.length === 0 && (
                    <div className="notification-empty">Nenhum aviso no momento.</div>
                  )}
                  {announcements.map((item) => (
                    <article className="notification-item" key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                      <small>{formatDate(item.published_at, false)}</small>
                    </article>
                  ))}
                  <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
                    <button 
                      type="button" 
                      className="primary-action" 
                      onClick={() => setNotificationsOpen(false)}
                      style={{ width: '100%' }}
                    >
                      Ocultar
                    </button>
                  </div>
                </div>
              )}
            </div>
            <Avatar label={user?.avatar || user?.name || 'SC'} />
            <span>{user?.name}</span>
            <button type="button" onClick={logout} aria-label="Sair">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function BrandLockup({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand-lockup ${small ? 'small' : ''}`}>
      <div className="brand-mark">
        <HeartPulse size={small ? 22 : 26} />
      </div>
      <div>
        <strong>SaúdeConnect</strong>
        <span>Sistema Integrado</span>
      </div>
    </div>
  );
}

function AdminQueueForm({ units, users, onCreated }: { units: Unit[]; users: DashboardPayload['users']; onCreated: () => Promise<void> }) {
  const patients = (users || []).filter((user) => user.role === 'user');
  const [userId, setUserId] = useState('');
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [service, setService] = useState('Clínica geral');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    try {
      await api('/queue', { method: 'POST', body: { userId, unitId, service, chiefComplaint } });
      setChiefComplaint('');
      setMessage('Paciente enviado para a fila de triagem.');
      await onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao adicionar à fila.');
    }
  }

  return (
    <form className="action-panel" onSubmit={submit}>
      <SectionHeader icon={<ListChecks />} title="Enviar paciente à fila" />
      <div className="form-group">
        <label>Paciente</label>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} required>
          <option value="">Selecione um paciente</option>
          {patients.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>Unidade</label>
        <select value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>Serviço</label>
        <select value={service} onChange={(e) => setService(e.target.value)}>
          <option>Clínica geral</option>
          <option>Pediatria</option>
          <option>Ortopedia</option>
          <option>Odontologia</option>
        </select>
      </div>
      <div className="form-group">
        <label>Queixa principal</label>
        <textarea value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} required />
      </div>
      <button type="submit" className="primary-action"><ListChecks size={18} />Enviar à fila</button>
      {message && <p className="form-message">{message}</p>}
    </form>
  );
}

function AppointmentForm({ units, users, onCreated }: { units: Unit[]; users: { id: string; name: string; email: string }[]; onCreated: () => Promise<void> }) {
  const [userId, setUserId] = useState(users[0]?.id || '');
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [specialty, setSpecialty] = useState('Clínica geral');
  const [scheduledAt, setScheduledAt] = useState(nextDateInput());
  const [reason, setReason] = useState('Preciso de acompanhamento de rotina.');
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    try {
      await api('/appointments', { method: 'POST', body: { userId, unitId, specialty, scheduledAt, reason } });
      setMessage('Agendamento confirmado.');
      await onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao registrar agendamento.');
    }
  }

  return (
    <form className="action-panel" onSubmit={submit}>
      <SectionHeader icon={<Plus />} title="Marcar Consulta / Exame" />
      <label>
        Paciente
        <select value={userId} onChange={(event) => setUserId(event.target.value)} required>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </label>
      <label>
        Unidade
        <select value={unitId} onChange={(event) => setUnitId(event.target.value)} required>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Especialidade / Exame
        <input value={specialty} onChange={(event) => setSpecialty(event.target.value)} required />
      </label>
      <label>
        Data / Hora
        <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required />
      </label>
      <label>
        Motivo
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} required />
      </label>
      {message && <div className="form-message">{message}</div>}
      <button className="primary-action" type="submit">
        <CalendarDays size={18} />
        Registrar Agendamento
      </button>
    </form>
  );
}

function AppointmentCard({ appointment }: { appointment: Appointment }) {
  return (
    <article className="appointment-card">
      <div>
        <span className="icon-tile">
          <CalendarDays size={20} />
        </span>
      </div>
      <div>
        <div className="card-title-line">
          <strong>{appointment.specialty}</strong>
          <StatusBadge status={appointment.status} />
        </div>
        <p>{appointment.unit_name} - {appointment.professional}</p>
        <small>{formatDate(appointment.scheduled_at)} - {appointment.reason}</small>
      </div>
    </article>
  );
}

function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <p>{label}</p>
      </div>
    </article>
  );
}

function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: string }) {
  return (
    <div className="section-header">
      <div>
        <span>{icon}</span>
        <h2>{title}</h2>
      </div>
      {action && <small>{action}</small>}
    </div>
  );
}

function AdminTable({
  children,
  compact = false,
  icon,
  title,
}: {
  children: React.ReactNode;
  compact?: boolean;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className={`admin-panel ${compact ? 'compact' : ''}`}>
      <SectionHeader icon={icon} title={title} />
      <div className="admin-list">{children}</div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: 'Pendente',
    confirmed: 'Confirmado',
    completed: 'Concluído',
    cancelled: 'Cancelado',
    waiting: 'Aguardando',
    in_service: 'Em atendimento',
    resolved: 'Resolvido',
    called: 'Chamado',
    done: 'Finalizado',
    online: 'Online',
    degraded: 'Instável',
    offline: 'Offline',
    Aberto: 'Aberto',
    'Coleta até 16h': 'Coleta até 16h',
    'Plantão reduzido': 'Plantão reduzido',
  };
  return <span className={`status-badge status-${statusClass(status)}`}>{labels[status] || status}</span>;
}

function QueueStatusBadge({ item }: { item: QueueEntry }) {
  const isTriaged = item.status === 'waiting_service' && item.triage_color;
  const label = isTriaged
    ? `Aguardando atendimento - classificação ${item.triage_color}`
    : item.status === 'waiting_triage'
      ? 'Aguardando triagem'
      : item.status === 'done'
        ? 'Atendimento finalizado'
        : item.status === 'cancelled'
          ? 'Atendimento cancelado'
          : item.status;
  return <span className={`queue-status ${queuePriorityClass(item.triage_color)}`}>{label}</span>;
}

function QueueDeadline({ item }: { item: QueueEntry }) {
  if (item.status === 'waiting_triage') return <small className="queue-deadline">Aguardando classificação de risco</small>;
  if (item.triage_color === 'Vermelho') return <small className="queue-deadline emergency">Atendimento imediato</small>;
  if (!item.deadline_time) return null;
  return <small className="queue-deadline">Limite para atendimento: {formatTime(item.deadline_time)}</small>;
}

function queuePriorityClass(color?: QueueEntry['triage_color']) {
  if (!color) return 'priority-unclassified';
  return `priority-${color.toLocaleLowerCase('pt-BR')}`;
}

function statusClass(status: string) {
  if (['confirmed', 'resolved', 'online', 'completed', 'done', 'called', 'Aberto'].includes(status)) return 'ok';
  if (['pending', 'waiting', 'degraded', 'Coleta até 16h', 'Plantão reduzido'].includes(status)) return 'warn';
  if (['cancelled', 'offline', 'critical'].includes(status)) return 'danger';
  if (status === 'in_service') return 'info';
  return 'default';
}

function Avatar({ label }: { label: string }) {
  const initials = useMemo(
    () =>
      label
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase(),
    [label],
  );

  if (label.startsWith('/uploads/') || /^https?:\/\//.test(label)) {
    return <img className="avatar avatar-image" src={mediaUrl(label)} alt="Foto do perfil" />;
  }

  return <span className="avatar">{initials}</span>;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function FullPageLoader({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="full-loader">
      <HeartPulse size={32} />
      <span>{label}</span>
    </div>
  );
}

function PanelLoader() {
  return (
    <div className="panel-loader">
      <RefreshCw className="spin" size={24} />
      <span>Sincronizando dados...</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <AlertTriangle size={24} />
      <strong>{message}</strong>
    </div>
  );
}

function pageTitle(page: PortalPageName) {
  return {
    home: 'Início',
    map: 'Unidades de Saúde',
    profile: 'Cadastro',
    records: 'Prontuários',
    triage: 'Triagem',
    queue: 'Fila',
  }[page];
}

function pageSubtitle(page: PortalPageName) {
  return {
    home: 'Resumo do atendimento, próximos passos e avisos importantes.',
    map: 'Encontre a unidade mais próxima de você',
    profile: 'Mantenha seus dados atualizados para agilizar o atendimento.',
    records: 'Histórico clínico, exames e registros de cuidado.',
    triage: 'Informe sintomas e acompanhe a classificação de prioridade.',
    queue: 'Acompanhe sua posição e entre na fila digital das unidades.',
  }[page];
}



function formatDate(value: string, includeTime = true) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function nextDateInput() {
  const date = new Date(Date.now() + 86400000 * 3);
  date.setMinutes(0, 0, 0);
  return date.toISOString().slice(0, 16);
}

function useAutoRefresh(callback: () => void, intervalMs: number) {
  useEffect(() => {
    const timer = window.setInterval(callback, intervalMs);
    return () => window.clearInterval(timer);
  }, [callback, intervalMs]);
}

function presenceInfo(lastSeen?: string | null) {
  if (!lastSeen) {
    return { status: 'offline' as const, label: 'Nunca conectou' };
  }

  const diffMs = Date.now() - Date.parse(lastSeen);
  if (diffMs <= 2 * 60 * 1000) {
    return { status: 'online' as const, label: 'Online agora' };
  }

  if (diffMs <= 15 * 60 * 1000) {
    return { status: 'away' as const, label: `Ausente há ${formatDuration(diffMs)}` };
  }

  return { status: 'offline' as const, label: `Offline há ${formatDuration(diffMs)}` };
}

function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} dia${days > 1 ? 's' : ''}`;
}

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - Date.parse(value);
  if (diffMs < 15000) return 'agora';
  if (diffMs < 60000) return `há ${Math.floor(diffMs / 1000)}s`;
  return `há ${formatDuration(diffMs)}`;
}

function PresenceDot({ status }: { status: 'online' | 'away' | 'offline' }) {
  return <span className={`presence-dot status-${status}`} aria-hidden="true" />;
}

export default App;
