import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

let dbInstance: Database | null = null;
const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'smm_panel.sqlite');

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  return dbInstance;
}

export function saveDb(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('Failed to save SQLite database to disk:', err);
  }
}

/**
 * Execute a query that returns multiple rows with parameterized values
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  
  if (params.length > 0) {
    stmt.bind(params);
  }

  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

/**
 * Execute a query that returns a single row with parameterized values
 */
export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute an INSERT, UPDATE, or DELETE query and save database state
 */
export async function run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  
  if (params.length > 0) {
    stmt.bind(params);
  }
  
  stmt.step();
  stmt.free();

  const changesResult = db.exec("SELECT changes() as chg, last_insert_rowid() as id");
  let changes = 0;
  let lastInsertRowid = 0;
  
  if (changesResult.length > 0 && changesResult[0].values.length > 0) {
    changes = Number(changesResult[0].values[0][0]) || 0;
    lastInsertRowid = Number(changesResult[0].values[0][1]) || 0;
  }

  saveDb();

  return { changes, lastInsertRowid };
}

/**
 * Execute raw SQL script (such as schema migrations)
 */
export async function exec(sql: string): Promise<void> {
  const db = await getDb();
  db.exec(sql);
  saveDb();
}
