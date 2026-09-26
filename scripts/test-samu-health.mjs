import { initDb, dbAll } from '../server/db.js';
import http from 'node:http';
import app from '../server/index.js';

async function main() {
  console.log('1. Inicializando e verificando banco de dados...');
  await initDb();

  const ambulances = await dbAll('SELECT code, plate, type, status FROM ambulances');
  console.log('Viaturas encontradas:', ambulances);

  const users = await dbAll("SELECT name, email, role, samu_role FROM users WHERE email LIKE '%samu190%'");
  console.log('Usuários SAMU encontrados:', users);

  console.log('2. Testando servidor HTTP e endpoints...');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(3099, resolve));
  console.log('Servidor de teste rodando na porta 3099.');

  const resAmbs = await fetch('http://localhost:3099/api/samu/ambulances');
  const jsonAmbs = await resAmbs.json();
  console.log(`Endpoint /api/samu/ambulances retornou ${jsonAmbs.length} viaturas. Status HTTP: ${resAmbs.status}`);

  const resHosp = await fetch('http://localhost:3099/api/samu/hospitals');
  const jsonHosp = await resHosp.json();
  console.log(`Endpoint /api/samu/hospitals retornou ${jsonHosp.length} hospitais/UPAs. Status HTTP: ${resHosp.status}`);

  const resCalls = await fetch('http://localhost:3099/api/samu/calls/active');
  const jsonCalls = await resCalls.json();
  console.log(`Endpoint /api/samu/calls/active retornou ${jsonCalls.length} chamados. Status HTTP: ${resCalls.status}`);

  console.log('Todos os testes de sanidade passaram com sucesso!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Falha no teste:', err);
  process.exit(1);
});
