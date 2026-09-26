import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const baseUrl = process.env.APP_URL || 'http://localhost:3001';
const chromePath =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const docsDir = path.resolve(process.cwd(), 'docs', 'screenshots');
const playDir = path.resolve(process.cwd(), 'store-assets', 'google-play');
const logPath = path.resolve(process.cwd(), 'artifacts', 'screenshots-generation.log');

fs.mkdirSync(docsDir, { recursive: true });
fs.mkdirSync(playDir, { recursive: true });
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, '');

const screens = [
  {
    slug: 'login',
    title: 'Login',
    path: '/login',
    auth: null,
    waitFor: '.auth-shell',
  },
  {
    slug: 'inicio',
    title: 'Inicio do paciente',
    path: '/app',
    auth: 'patient',
    waitFor: '.metric-card',
  },
  {
    slug: 'mapa',
    title: 'Mapa de unidades',
    path: '/app/mapa',
    auth: 'patient',
    waitFor: '.leaflet-map',
    afterLoad: async (page) => {
      await page
        .waitForSelector('.leaflet-marker-icon, .health-marker', { timeout: 10000 })
        .catch(() => undefined);
      await page.click('.leaflet-marker-icon, .health-marker').catch(() => undefined);
      await sleep(700);
    },
  },
  {
    slug: 'cadastro',
    title: 'Cadastro do cidadao',
    path: '/app/cadastro',
    auth: 'patient',
    waitFor: '.photo-uploader',
  },
  {
    slug: 'prontuarios',
    title: 'Prontuarios',
    path: '/app/prontuarios',
    auth: 'patient',
    waitFor: '.timeline',
  },
  {
    slug: 'triagem',
    title: 'Triagem',
    path: '/app/triagem',
    auth: 'patient',
    waitFor: '.action-panel',
  },
  {
    slug: 'fila',
    title: 'Fila',
    path: '/app/fila',
    auth: 'patient',
    waitFor: '.queue-board',
  },
  {
    slug: 'admin',
    title: 'Painel administrativo',
    path: '/admin',
    auth: 'admin',
    waitFor: '.admin-panel',
  },
];

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
progress('Chrome iniciado.');

const issues = [];
const page = await browser.newPage();
progress('Pagina de captura preparada.');

page.on('pageerror', (error) => issues.push(error.message));
page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) issues.push(message.text());
});
page.on('requestfailed', (request) => {
  const url = request.url();
  if (!url.includes('tile.openstreetmap.org')) {
    issues.push(`Falha ao carregar ${url}: ${request.failure()?.errorText}`);
  }
});

const tokens = {
  patient: await login('paciente@saudeconnect.com', 'Paciente@12345'),
  admin: await login('admin@saudeconnect.com', 'Admin@12345'),
};
progress('Sessoes de teste autenticadas.');

for (const [index, screen] of screens.entries()) {
  const prefix = `${String(index + 1).padStart(2, '0')}-${screen.slug}`;

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1, isMobile: false });
  await captureScreen(page, screen, {
    path: path.join(docsDir, `${prefix}-desktop.png`),
    fullPage: false,
  });

  await page.setViewport({
    width: 360,
    height: 640,
    deviceScaleFactor: 3,
    isMobile: true,
  });
  await captureScreen(page, screen, {
    path: path.join(playDir, `${prefix}-${screen.slug}.jpg`),
    fullPage: false,
    type: 'jpeg',
    quality: 94,
  });
}

await browser.close();

if (issues.length) {
  console.error(issues.join('\n'));
  process.exit(1);
}

console.log(`Capturas para README salvas em ${docsDir}`);
console.log(`Capturas para Play Store salvas em ${playDir}`);

async function login(email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao autenticar ${email}: ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.token;
}

async function captureScreen(page, screen, options) {
  progress(`Abrindo ${screen.title} para ${path.basename(options.path)}...`);
  if (!screen.auth) {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
  } else {
    if (!page.url().startsWith(baseUrl)) {
      await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    }
    await page.evaluate((token) => localStorage.setItem('saudeconnect.token', token), tokens[screen.auth]);
  }

  await page.goto(`${baseUrl}${screen.path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(screen.waitFor, { timeout: 15000 });
  await sleep(700);

  if (screen.afterLoad) {
    await screen.afterLoad(page);
  }

  await page.screenshot(options);
  progress(`Arquivo salvo: ${options.path}`);

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  );
  if (hasOverflow) {
    issues.push(`Overflow horizontal em ${screen.title}.`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function progress(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(logPath, `${line}\n`);
}
