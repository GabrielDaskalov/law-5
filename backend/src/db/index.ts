import pgPromise from 'pg-promise';
import { config } from '../config';

const pgp = pgPromise();

export const db = pgp({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Connection test
export async function testConnection(): Promise<boolean> {
  try {
    const result = await db.one('SELECT NOW()');
    console.log('✓ Database connection successful');
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeConnection(): Promise<void> {
  await pgp.end();
}
