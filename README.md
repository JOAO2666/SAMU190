---
title: SaúdeConnect
emoji: 🩺
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# SaúdeConnect

[![React](https://img.shields.io/badge/React-19-149eca?logo=react)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-3c873a?logo=node.js)](https://nodejs.org/)
[![Vercel](https://img.shields.io/badge/Vercel-online-000000?logo=vercel)](https://saudeconnectl.vercel.app)
[![Android](https://img.shields.io/badge/Android-APK-3DDC84?logo=android)](https://github.com/JOAO2666/SaudeConnectl/raw/main/SaudeConnect_v1.0.0.APK)
[![Documentação](https://img.shields.io/badge/PDF-documentação-0f8b8d)](https://github.com/JOAO2666/SaudeConnectl/raw/main/output/pdf/SaudeConnect-Documentacao-Tecnica.pdf)

Plataforma full-stack para integração em saúde, com portal do paciente, painel administrativo, mapa interativo, API protegida e aplicativo Android via Capacitor.

**Aplicação online:** [saudeconnectl.vercel.app](https://saudeconnectl.vercel.app)

## Downloads

- [Baixar o APK SaúdeConnect v1.0.0](https://github.com/JOAO2666/SaudeConnectl/raw/main/SaudeConnect_v1.0.0.APK)
- [Abrir a documentação técnica e operacional em PDF](output/pdf/SaudeConnect-Documentacao-Tecnica.pdf)
- [Ver as imagens preparadas para a Google Play](store-assets/google-play)

APK: 14,20 MB. SHA-256: `FC8AF2EFDE02A0136650280F82EDC485471105758AC9F9285F5D1108D973CF46`.

## Funcionalidades

### Paciente

- Cadastro e login por e-mail e senha.
- Login com Google OAuth, com criação automática do usuário no primeiro acesso.
- Perfil do cidadão com envio de foto.
- Resumo de consultas, resultados, triagens e posição na fila.
- Mapa OpenStreetMap com unidades, marcadores, popups e rotas, incluindo barra de busca e animações de câmera suaves.
- Prontuários, solicitações de triagem e fila digital.
- Interface responsiva para celular, tablet e computador.
- Animações suaves de interação e respeito à preferência de movimento reduzido.
- Notificações de avisos gerais com botão para ocultar e limpar os avisos na tela.

### Administração e Suporte Técnico

- Acesso especializado: além de Administradores, há um perfil exclusivo para "Suporte Técnico", focado apenas na gestão de usuários, unidades e chamados, garantindo a privacidade dos dados médicos.
- Indicadores operacionais e monitoramento da rede.
- Pesquisa geral por paciente (incluindo busca por CPF), unidade, serviço ou assunto.
- Gestão de agendamentos, triagens (usando o Protocolo de Manchester) e fila de atendimento.
- Gestão de chamados de suporte.
- Controle de integrações e estado de sincronização.
- Administração de usuários e permissões.
- Publicação de comunicados para pacientes e administradores.
- Exportação dos dados operacionais em CSV.
- Histórico de auditoria das ações administrativas.

## Capturas do sistema

| Login | Início |
| --- | --- |
| ![Tela de login](docs/screenshots/01-login-desktop.png) | ![Início do paciente](docs/screenshots/02-inicio-desktop.png) |

| Mapa | Cadastro |
| --- | --- |
| ![Mapa de unidades](docs/screenshots/03-mapa-desktop.png) | ![Cadastro do cidadão](docs/screenshots/04-cadastro-desktop.png) |

| Prontuários | Triagem |
| --- | --- |
| ![Prontuários](docs/screenshots/05-prontuarios-desktop.png) | ![Triagem](docs/screenshots/06-triagem-desktop.png) |

| Fila digital | Administração |
| --- | --- |
| ![Fila digital](docs/screenshots/07-fila-desktop.png) | ![Painel administrativo](docs/screenshots/08-admin-desktop.png) |

As capturas em formato vertical para publicação ficam em [`store-assets/google-play`](store-assets/google-play).

Arquivo editável no Figma: [abrir projeto SaúdeConnect](https://www.figma.com/design/kzGAK3I48gMUbqezc1fbdk)

## Tecnologias

- React 19, TypeScript, Vite e React Router.
- Node.js, Express e SQLite com `better-sqlite3`.
- JWT, `bcryptjs`, Passport Google OAuth, Zod, Helmet e rate limit.
- Leaflet e OpenStreetMap.
- Capacitor 8 para Android.
- Puppeteer para testes visuais e geração de capturas.
- ReportLab para a documentação em PDF.
- Vercel para a demonstração web.

## Autenticação e segurança

O sistema possui autenticação própria no back-end e não depende do Supabase.

- Senhas protegidas com hash `bcrypt`; a senha original não é armazenada.
- Sessões JWT registradas no banco e revogadas no logout.
- Perfis `user` e `admin`, com rotas administrativas protegidas.
- Google OAuth para acesso e cadastro automático de novos usuários.
- Validação de entradas com Zod.
- Cabeçalhos de segurança, CORS configurável e limitação de requisições.
- Registro de IP, agente do navegador, expiração e auditoria.

Antes de uma publicação de produção, altere os usuários iniciais, configure um `JWT_SECRET` forte e mantenha `GOOGLE_CLIENT_SECRET` apenas nos segredos do provedor.

## Executar localmente

Requisitos: Node.js 20 ou mais recente e npm.

```bash
npm install
npm run build
npm run start
```

Acesse `http://localhost:3001`.

**Usuários de teste:**

* **Admin:** `admin@saudeconnect.com` / `Admin@12345`
* **Paciente:** `paciente@saudeconnect.com` / `Paciente@12345`

Para desenvolvimento com atualização automática:

```bash
npm run dev
```

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste os valores:

```env
PORT=3001
JWT_SECRET=troque-por-um-segredo-longo
JWT_TTL=7d
DATA_DIR=./data
CLIENT_ORIGIN=http://localhost:5173,http://localhost:3001
CLIENT_URL=http://localhost:5173
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
```

## Testes e documentação

```bash
npm run lint
npm run build
node scripts/smoke-visual.mjs
npm run screenshots
```

Para regenerar o PDF:

```bash
python -m pip install -r requirements-docs.txt
python scripts/generate-documentation.py
```

O arquivo final é salvo em [`output/pdf/SaudeConnect-Documentacao-Tecnica.pdf`](output/pdf/SaudeConnect-Documentacao-Tecnica.pdf).

## Publicação na Vercel

O projeto inclui `vercel.json` e a função serverless `api/[...path].js`.

```bash
vercel --prod
```

Configure na Vercel:

```env
JWT_SECRET=um-segredo-longo-e-aleatorio
JWT_TTL=7d
CLIENT_URL=https://saudeconnectl.vercel.app
CLIENT_ORIGIN=https://saudeconnectl.vercel.app
GOOGLE_CLIENT_ID=seu-client-id-google
GOOGLE_CLIENT_SECRET=seu-client-secret-google
GOOGLE_CALLBACK_URL=https://saudeconnectl.vercel.app/api/auth/google/callback
```

No Google Cloud, autorize:

```text
Origem JavaScript: https://saudeconnectl.vercel.app
URI de redirecionamento: https://saudeconnectl.vercel.app/api/auth/google/callback
```

Na demonstração serverless, o SQLite e os uploads usam armazenamento temporário. Para uso real com persistência garantida, conecte um banco e um serviço de arquivos gerenciados.

## Android

O projeto nativo está em [`android`](android) e o APK final está na raiz do repositório.

Para gerar uma nova compilação de teste:

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-25.0.1.8-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:VITE_API_URL='https://saudeconnectl.vercel.app/api'
npm run mobile:apk
```

O Gradle gera `android/app/build/outputs/apk/debug/app-debug.apk`. Para publicar na Google Play, use uma assinatura Android privada e gere uma compilação `release` em formato AAB.

## Estrutura principal

```text
src/                    interface React
server/                 API, autenticação e banco
api/                    adaptação serverless da Vercel
android/                projeto Capacitor Android
docs/screenshots/       capturas para o GitHub
store-assets/           imagens para lojas
output/pdf/             documentação final
scripts/                testes e geração de materiais
```

## Licença e uso de dados

Este repositório é uma demonstração técnica. Não use dados reais de pacientes sem adequar infraestrutura, consentimento, controle de acesso, retenção, backups e conformidade com a LGPD.
