import './network';
import { neon } from '@neondatabase/serverless';
export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('The database is not configured');
  return neon(url);
}
