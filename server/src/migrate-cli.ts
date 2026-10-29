import { migrate } from './migrate.js';
import { pool } from './db.js';

try {
  await migrate();
  console.log('Migrace dokončeny');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
