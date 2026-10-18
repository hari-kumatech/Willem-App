// Runs once when the app server starts.
// MEK Movers: daily backup of its data (backups/mek-movers/, last 30 days), checked at start and every hour,
// the same schedule the stand-alone server.js used.
export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const g = globalThis as typeof globalThis & { __mekMoversBackupTimer?: NodeJS.Timeout };
  if (g.__mekMoversBackupTimer) return;

  const run = async () => {
    try {
      const { dailyBackup } = await import('@/modules/movers/backup');
      const file = await dailyBackup();
      if (file) console.info(`[mek-movers] daily backup written: ${file}`);
    } catch (error) {
      // Database not up yet or not reachable: try again next hour
      console.warn('[mek-movers] daily backup skipped:', error instanceof Error ? error.message : error);
    }
  };
  // Not awaited: the server must not wait for the database to start
  setTimeout(run, 15_000);
  g.__mekMoversBackupTimer = setInterval(run, 60 * 60 * 1000);
}
