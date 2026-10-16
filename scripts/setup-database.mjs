import { existsSync, readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const connection = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connection) {
  console.error('DATABASE_URL is missing. Connect the Neon database and pull the project environment first.');
  process.exitCode = 1;
} else {
  try {
    const sql = neon(connection);
    const statements = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8').split(';').map(s => s.trim()).filter(Boolean);
    await sql.transaction(statements.map(statement => sql.query(statement)));
    console.log('Durable game room schema is ready.');
  } catch {
    console.error('Database setup failed. Check the configured Neon connection and retry.');
    process.exitCode = 1;
  }
}
