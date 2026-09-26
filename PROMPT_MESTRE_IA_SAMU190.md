# PROMPT MESTRE DE ENGENHARIA DE SOFTWARE: ECOSSISTEMA SAMU 190 (DUAL-APP TIPO UBER)

> **Instruções para o Usuário**: Copie todo o conteúdo abaixo e cole no seu modelo/agente de IA (Antigravity, Claude 3.7/Sonnet, Codex, Cursor, ChatGPT, etc.) para gerar o projeto completo e funcional.

---

```markdown
Você é um Engenheiro de Software Sênior especialista em Sistemas Críticos em Tempo Real, Geolocalização e Aplicações Mobile com React, Node.js, WebSockets e Capacitor.

### MISSÃO
Construir do zero, ou refatorar o projeto existente, implementando o ecossistema completo **SAMU 190** — uma plataforma de chamada e despacho de ambulâncias em tempo real com a mesma experiência, fluidez e dinâmica do Uber, porém adaptada para emergências médicas do SUS/SAMU.

O sistema é estritamente composto por:
1. **App 1: SAMU 190 - Cidadão (Paciente/Solicitante)**: Aplicativo mobile/web para solicitar socorro com 1 toque, geolocalização automática por GPS, triagem rápida (Manchester), radar de busca de viatura mais próxima, tela de acompanhamento ao vivo da ambulância com rota traçada, velocidade, tempo estimado (ETA), telemetria em tempo real, chat/ligação de emergência e guia interativo de primeiros socorros durante a espera (ex: metrônomo de massagem cardíaca).
2. **App 2: SAMU 190 - Socorrista (Condutor/Paramédico)**: Aplicativo mobile/web para a equipe de resgate com controle de plantão (Online/Offline), seleção de viatura (USA - Suporte Avançado / UTI Móvel, USB - Suporte Básico, Motolância), alerta sonoro estridente de ocorrência com contagem regressiva (20s) para aceite, navegação no mapa curva a curva até a vítima e posteriormente até o hospital, transmissão contínua de telemetria GPS (a cada 2 segundos) e preenchimento ágil do Boletim de Atendimento Pré-Hospitalar (BAPH) a bordo.
3. **Backend em Tempo Real (Node.js + Socket.io + LibSQL/SQLite)**: Motor de despacho espacial que calcula a viatura disponível mais próxima adequada à gravidade do paciente, gerencia a máquina de estados rigorosa do chamado, roteia eventos de telemetria e sincroniza o painel da Central de Regulação Médica.
4. **Painel Web da Central de Regulação Médica**: Dashboard operacional desktop para o Médico Regulador visualizar toda a frota de ambulâncias em tempo real no mapa, acompanhar chamados ativos e intervir se necessário.

---

### STACK TECNOLÓGICA OBRIGATÓRIA
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS (ou CSS moderno modular com design system limpo e responsivo), Lucide React (ícones), Leaflet + React-Leaflet + OpenStreetMap (ou MapLibre), Web Audio API / Howler (sons de sirene e alertas sonoros de alta prioridade).
- **Mobile**: Capacitor 8 configurado para compilar APK Android dos dois apps (`com.samu190.cidadao` e `com.samu190.socorrista`), com permissões de GPS fino (`ACCESS_FINE_LOCATION`), GPS em segundo plano e Notificações Push de alta prioridade.
- **Backend**: Node.js 20+, Express 5, Socket.io 4.8+, LibSQL / SQLite (`@libsql/client`), Zod (validação de schemas), JWT (autenticação com cookies e headers Bearer), bcryptjs.
- **Roteamento Viário**: Open Source Routing Machine (OSRM API pública `https://router.project-osrm.org`) para traçar rotas viárias reais entre ambulância, vítima e hospital com cálculo exato de distância e ETA.

---

### MÁQUINA DE ESTADOS DO CHAMADO (LÓGICA RÍGIDA)
1. `requested`: Cidadão acionou o botão SOS e preencheu triagem inicial rápida.
2. `searching`: Backend ativou o radar de busca e localizou viaturas disponíveis no raio.
3. `offered`: Alerta com som de sirene e contagem regressiva disparado para a viatura mais próxima. Se o socorrista recusar ou passar 20s sem resposta, passa automaticamente para a próxima viatura.
4. `dispatched` / `en_route_pickup`: Socorrista aceitou o chamado. Ambulância em deslocamento até o local do solicitante. Rota e telemetria ativas no mapa do cidadão e do condutor.
5. `arrived_scene`: Ambulância chegou ao local da ocorrência. Solicitante notificado com som de chegada.
6. `transporting`: Vítima estabilizada e embarcada na ambulância. Socorrista seleciona o Hospital de Destino e inicia deslocamento.
7. `arrived_hospital`: Ambulância chegou ao Pronto-Socorro / Hospital de Referência.
8. `completed`: Paciente entregue à equipe hospitalar, boletim finalizado e viatura liberada para novos chamados.
9. `cancelled`: Cancelamento antes do despacho ou report de trote pela Central/Socorrista.

---

### ESTRUTURA DO BANCO DE DADOS (LIBSQL / SQLITE)
Crie e inicialize as seguintes tabelas completas:

```sql
-- Usuários (Cidadãos, Condutores/Socorristas, Médicos Reguladores e Administradores)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('citizen', 'driver', 'doctor', 'admin')) DEFAULT 'citizen',
  cpf TEXT,
  phone TEXT,
  avatar TEXT,
  created_at TEXT NOT NULL
);

-- Viaturas do SAMU
CREATE TABLE IF NOT EXISTS ambulances (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,           -- Ex: "USA-01", "USB-03", "MOTO-01"
  plate TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('USA', 'USB', 'VIR', 'MOTOLANCIA')),
  status TEXT NOT NULL CHECK (status IN ('offline', 'available', 'busy', 'maintenance')) DEFAULT 'offline',
  current_driver_id TEXT REFERENCES users(id),
  current_lat REAL,
  current_lng REAL,
  current_heading REAL DEFAULT 0,
  last_ping_at TEXT,
  updated_at TEXT NOT NULL
);

-- Hospitais e Unidades de Pronto Atendimento (Destinos de Transporte)
CREATE TABLE IF NOT EXISTS hospital_units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                  -- 'HOSPITAL_GERAL', 'UPA', 'MATERNIDADE', 'TRAUMA'
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  phone TEXT NOT NULL,
  emergency_beds_available INTEGER DEFAULT 5
);

-- Chamados de Emergência (As Corridas de Ambulância)
CREATE TABLE IF NOT EXISTS emergency_calls (
  id TEXT PRIMARY KEY,
  citizen_id TEXT NOT NULL REFERENCES users(id),
  ambulance_id TEXT REFERENCES ambulances(id),
  driver_id TEXT REFERENCES users(id),
  target_hospital_id TEXT REFERENCES hospital_units(id),
  status TEXT NOT NULL CHECK (status IN (
    'requested', 'searching', 'dispatched', 'en_route_pickup',
    'arrived_scene', 'transporting', 'arrived_hospital', 'completed', 'cancelled'
  )) DEFAULT 'requested',
  severity_color TEXT NOT NULL CHECK (severity_color IN ('Azul', 'Verde', 'Amarelo', 'Laranja', 'Vermelho')),
  chief_complaint TEXT NOT NULL,
  symptoms_summary TEXT,
  patient_name TEXT,
  patient_age INTEGER,
  patient_conscious INTEGER DEFAULT 1,
  patient_breathing INTEGER DEFAULT 1,
  pickup_lat REAL NOT NULL,
  pickup_lng REAL NOT NULL,
  pickup_address TEXT NOT NULL,
  destination_lat REAL,
  destination_lng REAL,
  destination_address TEXT,
  eta_minutes INTEGER,
  distance_km REAL,
  requested_at TEXT NOT NULL,
  accepted_at TEXT,
  arrived_scene_at TEXT,
  left_scene_at TEXT,
  arrived_hospital_at TEXT,
  completed_at TEXT,
  cancellation_reason TEXT
);

-- Pings de Telemetria de Trajeto
CREATE TABLE IF NOT EXISTS telemetry_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emergency_call_id TEXT NOT NULL REFERENCES emergency_calls(id) ON DELETE CASCADE,
  ambulance_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  speed REAL,
  heading REAL,
  recorded_at TEXT NOT NULL
);

-- Mensagens de Chat da Ocorrência
CREATE TABLE IF NOT EXISTS emergency_messages (
  id TEXT PRIMARY KEY,
  emergency_call_id TEXT NOT NULL REFERENCES emergency_calls(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Boletim de Atendimento Pré-Hospitalar (BAPH Digital)
CREATE TABLE IF NOT EXISTS baph_records (
  id TEXT PRIMARY KEY,
  emergency_call_id TEXT NOT NULL UNIQUE REFERENCES emergency_calls(id),
  glasgow_score INTEGER,
  systolic_bp INTEGER,
  diastolic_bp INTEGER,
  heart_rate INTEGER,
  oxygen_saturation INTEGER,
  respiratory_rate INTEGER,
  procedures_performed TEXT,
  observations TEXT,
  created_at TEXT NOT NULL
);
```

---

### PROTOCOLO DE WEBSOCKET / SOCKET.IO
Configure as seguintes salas (*rooms*):
- `incident:${callId}`: Sala compartilhada entre o solicitante (cidadão), a equipe da ambulância despachada e a central de regulação.
- `driver:${driverId}`: Sala individual do motorista para recepção de alertas de despacho privados.
- `dispatch_central`: Sala dos operadores/médicos da central para monitorar todas as viaturas e chamados.

Eventos Obrigatórios:
1. `driver:register_shift` -> `{ ambulanceId, lat, lng }`: coloca o socorrista online e aloca a viatura.
2. `driver:location_ping` -> `{ lat, lng, speed, heading, callId? }`: atualiza a posição no banco e faz broadcast para a sala do chamado e central.
3. `citizen:create_call` -> `{ pickupLat, pickupLng, pickupAddress, severityColor, chiefComplaint, patientName, patientAge, patientConscious, patientBreathing }`. O servidor executa o algoritmo de despacho, localiza a viatura mais próxima e emite `driver:dispatch_offer` com timer de 20s.
4. `driver:accept_offer` -> `{ callId }`: vincula a viatura, altera status para `en_route_pickup`, calcula a rota OSRM e avisa o cidadão via `call:accepted`.
5. `driver:advance_status` -> `{ callId, nextStatus, targetHospitalId? }`: transiciona os estados com registro dos timestamps.
6. `incident:chat_message` -> `{ callId, message }`: troca mensagens instantâneas em tempo real.

---

### TELAS E EXPERIÊNCIA DO USUÁRIO DETALHADA

#### 1. APP DO CIDADÃO (SAMU 190):
- **Tela 1: Home / Botão de Pânico 1-Toque**:
  - Grande botão vermelho pulsante com ícone de emergência e vibração haptic.
  - Endereço atual detectado automaticamente via GPS (`navigator.geolocation`) e reverse geocoding.
  - Seletor rápido de tipo de ocorrência: "Parada Cardíaca / Desmaio", "Acidente de Trânsito", "Dificuldade Respiratória", "Hemorragia Severa", "Outro".
  - Triagem em 3 perguntas rápidas com botões Sim/Não (Consciente? Respirando? Sangramento ativo?).
- **Tela 2: Radar de Busca (Estilo Uber)**:
  - Animação de radar escaneando com efeito sonoro suave e pulso visual.
  - Mensagem: "Contatando Central de Regulação e localizando viatura mais rápida...".
  - Opção de cancelamento com confirmação rápida.
- **Tela 3: Em Atendimento / Acompanhamento ao Vivo (Tela Principal)**:
  - Mapa Leaflet ocupando a tela com rota desenhada em vermelho/azul.
  - Marcador da ambulância com ícone personalizado (desenhado com giro/heading realista conforme se desloca).
  - Card inferior flutuante com dados da viatura: Prefixo (Ex: "USA-02 - UTI Móvel"), Placa, Nome do Condutor, Tempo Estimado de Chegada (ETA) em destaque ("Chega em 4 min").
  - Botão de Ação Rápida: "Guia de Primeiros Socorros" (abre gaveta modal com instruções ilustradas e metrônomo de massagem cardíaca com som ritmado de 100-120 bpm).
  - Botão "Compartilhar Trajeto no WhatsApp" (gera link para familiares acompanharem o resgate).
  - Chat direto em tempo real com a equipe da ambulância.

#### 2. APP DO MOTORISTA / SOCORRISTA:
- **Tela 1: Painel de Plantão (Online / Offline)**:
  - Botão de alternar plantão (Verde = Disponível para Chamados; Cinza = Fora de Serviço).
  - Seleção da viatura do dia (Lista de viaturas do banco: USA, USB, Motolância).
  - Mapa mostrando posição atual do veículo e raio de cobertura.
- **Tela 2: Modal de Despacho em Tela Cheia (Oferta de Ocorrência)**:
  - Som de sirene de emergência alto tocando em loop contínuo.
  - Alerta piscante com a cor da gravidade (Manchester Vermelho/Laranja).
  - Círculo de contagem regressiva de 20 segundos.
  - Dados cruciais: Queixa Principal, Distância até o local (ex: 2.3 km), Idade do paciente, Estado de consciência.
  - Dois botões gigantes: "ACEITAR OCORRÊNCIA" (Verde) e "RECUSAR" (Cinza).
- **Tela 3: Navegação Turn-by-Turn até a Vítima**:
  - Mapa centralizado com rota dinâmica traçada via OSRM.
  - Botão de ação grande na base da tela: **"CHEGUEI AO LOCAL DA OCORRÊNCIA"**.
  - Acesso ao chat com o solicitante.
- **Tela 4: Atendimento na Cena & Seleção de Hospital**:
  - Botão: **"INICIAR TRANSPORTE AO HOSPITAL"**.
  - Seletor de Hospital de Referência (com indicação de vagas e distância).
  - Mini-ficha clínica para o médico/enfermeiro da equipe anotar rapidamente: Escala de Glasgow (3 a 15), Pressão Arterial, Frequência Cardíaca, Saturação de O2.
- **Tela 5: Rota até o Hospital & Finalização**:
  - Rota traçada até a emergência do hospital escolhido.
  - Botão: **"CHEGADA AO HOSPITAL"** -> seguido de **"FINALIZAR ATENDIMENTO & LIBERAR VIATURA"**.

#### 3. CENTRAL DE REGULAÇÃO MÉDICA (PAINEL WEB):
- Mapa com todas as ambulâncias cadastradas (marcadores coloridos por status: Verde = Disponível, Vermelho = Em Ocorrência, Cinza = Offline).
- Tabela lateral com fila de chamados ativos e tempos de espera.
- Capacidade do Médico Regulador de despachar manualmente uma viatura específica ou alterar a prioridade da ocorrência.

---

### DADOS MOCK INICIAIS (SEED AUTOMÁTICO)
Ao iniciar o banco pela primeira vez, insira automaticamente:
1. Três usuários:
   - Cidadão: `paciente@samu190.gov.br` / `Samu@12345`
   - Motorista/Socorrista: `socorrista@samu190.gov.br` / `Samu@12345`
   - Médico Regulador: `regulador@samu190.gov.br` / `Samu@12345`
2. Três viaturas:
   - `USA-01` (UTI Móvel - Suporte Avançado)
   - `USB-02` (Suporte Básico)
   - `MOTO-01` (Motolância Rápida)
3. Dois Hospitais/UPAs de referência com coordenadas geográficas válidas.

---

### INSTRUÇÕES DE EXECUÇÃO
1. Crie os arquivos de forma modular, limpa e completamente funcionais.
2. Não deixe funções vazias, marcadores `// TODO: implementar mais tarde` ou simulações falsas. Todos os botões, rotas e sockets devem responder com precisão.
3. Forneça scripts no `package.json` para rodar simultaneamente o servidor backend com Socket.io e as aplicações frontend, além do comando de sincronização Capacitor (`npm run mobile:sync`).
4. Inicie a implementação agora mesmo!
```
