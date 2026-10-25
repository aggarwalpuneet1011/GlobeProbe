// Local-only error log (no crash reporters). One text file in the app's private storage, capped.
import * as FileSystem from 'expo-file-system/legacy';

const PATH = () => `${FileSystem.documentDirectory}error_log.txt`;
const MAX_BYTES = 64 * 1024;

export async function logError(where: string, err: unknown) {
  try {
    const msg = err instanceof Error ? `${err.message}\n${(err.stack ?? '').split('\n').slice(0, 4).join('\n')}` : String(err);
    let prev = '';
    try { prev = await FileSystem.readAsStringAsync(PATH()); } catch { /* first write */ }
    const next = `${prev}[${new Date().toISOString()}] ${where}: ${msg}\n`;
    await FileSystem.writeAsStringAsync(PATH(), next.length > MAX_BYTES ? next.slice(next.length - MAX_BYTES) : next);
  } catch { /* logging must never throw */ }
}
export async function readErrorLog(): Promise<string> {
  try { return await FileSystem.readAsStringAsync(PATH()); } catch { return ''; }
}
export async function clearErrorLog() { try { await FileSystem.deleteAsync(PATH(), { idempotent: true }); } catch { /* ignore */ } }
