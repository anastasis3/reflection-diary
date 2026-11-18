/**
 * The entry point: configuration check, storage, port, shutdown.
 *
 * Everything that is about *running* the process lives here, and nothing that
 * is about handling a request. See src/app.js for the application itself.
 */
import config, { checkConfig } from './config/index.js';
import { initStorage } from './repositories/index.js';
import { createApp } from './app.js';

checkConfig();
const storage = await initStorage();

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Reflection diary listening on http://localhost:${config.port}`);
  console.log(`  interface      http://localhost:${config.port}/`);
  console.log(`  API            http://localhost:${config.port}/api/health`);
  console.log(`  documentation  http://localhost:${config.port}/docs/`);
  console.log(
    storage.driver === 'supabase'
      ? `  storage        Supabase (PostgreSQL + Auth), ${storage.prompts} questions loaded`
      : `  storage        memory driver, data file ${storage.file}`,
  );
});

/** Stop cleanly so that an in-flight request finishes first. */
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down.`);
  server.close(async () => {
    if (config.storage.driver === 'supabase') {
      const { close } = await import('./data/db.js');
      await close();
    } else {
      const { default: store } = await import('./data/store.js');
      store.save();
    }
    process.exit(0);
  });
  // Do not hang for ever on a stuck connection.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default server;
