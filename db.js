// Camada de persistência: usa Postgres se DATABASE_URL estiver definida
// (é o que o Railway injeta automaticamente quando você adiciona um banco
// Postgres ao projeto). Se não houver DATABASE_URL, cai de volta para um
// arquivo JSON local — útil para rodar rapidamente em localhost.

const fs = require('fs');
const path = require('path');

const DEFAULT_DATA = {
  users: [],
  accounts: [],
  categories: [],
  captions: [],
  videos: [],
  activityLog: []
};

const USE_POSTGRES = !!process.env.DATABASE_URL;

// ---------------- Modo Postgres ----------------
let pool = null;
let ready = null;

if (USE_POSTGRES) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  ready = pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `).then(async () => {
    const { rows } = await pool.query('SELECT data FROM app_state WHERE id = 1');
    if (rows.length === 0) {
      await pool.query('INSERT INTO app_state (id, data) VALUES (1, $1)', [DEFAULT_DATA]);
    }
  });
}

async function loadAsync() {
  await ready;
  const { rows } = await pool.query('SELECT data FROM app_state WHERE id = 1');
  return rows[0] ? rows[0].data : JSON.parse(JSON.stringify(DEFAULT_DATA));
}

async function saveAsync(data) {
  await ready;
  await pool.query(
    'UPDATE app_state SET data = $1, updated_at = now() WHERE id = 1',
    [data]
  );
}

// ---------------- Modo arquivo local (fallback) ----------------
const DB_FILE = path.join(__dirname, 'data', 'db.json');

function loadFile() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
  }
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function saveFile(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ---------------- Interface única exportada ----------------
// load()/save() agora são sempre assíncronas (retornam Promise),
// funcionando tanto no modo Postgres quanto no modo arquivo local.
async function load() {
  return USE_POSTGRES ? loadAsync() : loadFile();
}

async function save(data) {
  return USE_POSTGRES ? saveAsync(data) : saveFile(data);
}

module.exports = { load, save, usingPostgres: USE_POSTGRES };
