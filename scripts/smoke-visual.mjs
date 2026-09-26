import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const baseUrl = process.env.APP_URL || 'http://localhost:3001';
const chromePath =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outputDir = path.resolve(process.cwd(), 'artifacts', 'screenshots');
fs.mkdirSync(outputDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
const issues = [];
page.on('pageerror', (error) => issues.push(error.message));
page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) issues.push(message.text());
});
page.on('requestfailed', (request) => {
  issues.push(`Falha ao carregar ${request.url()}: ${request.failure()?.errorText}`);
});

async function save(name) {
  const filePath = path.join(outputDir, name);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function hasOverflow() {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  );
}

await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
try {
  await page.waitForSelector('.auth-shell', { timeout: 15000 });
} catch (error) {
  fs.writeFileSync(path.join(outputDir, 'debug.html'), await page.content(), 'utf8');
  throw new Error(
    `Interface nao montou. URL=${page.url()} Issues=${issues.join(' | ') || 'sem erros capturados'} Cause=${error.message}`,
  );
}
await save('login-desktop.png');
if (await hasOverflow()) issues.push('Overflow horizontal na tela de login desktop.');

await page.type('input[type="email"]', 'paciente@saudeconnect.com');
await page.type('input[type="password"]', 'Paciente@12345');
await page.click('.primary-action');
await page.waitForSelector('.app-shell', { timeout: 15000 });
await save('paciente-desktop.png');
if (await hasOverflow()) issues.push('Overflow horizontal no painel do paciente desktop.');

await page.goto(`${baseUrl}/app/mapa`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.leaflet-map .leaflet-marker-icon, .health-marker', { timeout: 15000 });
await save('mapa-desktop.png');
if (await hasOverflow()) issues.push('Overflow horizontal na pagina de mapa desktop.');

await page.goto(`${baseUrl}/app`, { waitUntil: 'networkidle0' });
await page.setViewport({ width: 390, height: 900, isMobile: true, deviceScaleFactor: 2 });
await page.waitForSelector('.metric-card', { timeout: 15000 });
await save('paciente-mobile.png');
if (await hasOverflow()) issues.push('Overflow horizontal no painel do paciente mobile.');

await page.evaluate(() => localStorage.clear());
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
await page.type('input[type="email"]', 'admin@saudeconnect.com');
await page.type('input[type="password"]', 'Admin@12345');
await page.click('.primary-action');
await page.waitForSelector('.admin-panel', { timeout: 15000 });
await save('admin-desktop.png');
if (await hasOverflow()) issues.push('Overflow horizontal no painel admin desktop.');

await browser.close();

if (issues.length) {
  console.error(issues.join('\n'));
  process.exit(1);
}

console.log(`Capturas salvas em ${outputDir}`);
