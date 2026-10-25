// Parent Zone export: one JSON file plus the profile's photos, zipped, handed to the share sheet.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';
import { base64ToBytes, bytesToBase64 } from '../util/b64';

export interface ExportResult { ok: boolean; photos: number; message?: string }

export async function exportAndShare(profileName: string, data: Record<string, unknown>, photoPaths: string[]): Promise<ExportResult> {
  const files: Record<string, Uint8Array> = { 'globeprobe-export.json': strToU8(JSON.stringify(data, null, 2)) };
  let photos = 0;
  for (const p of photoPaths) {
    try {
      const b64 = await FileSystem.readAsStringAsync(p, { encoding: FileSystem.EncodingType.Base64 });
      files[`photos/${p.split('/').pop() ?? `photo${photos}.jpg`}`] = base64ToBytes(b64);
      photos++;
    } catch { /* a missing photo should not block the export */ }
  }
  const zip = zipSync(files, { level: 1 });
  const safe = profileName.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 20) || 'profile';
  const dest = `${FileSystem.cacheDirectory}globeprobe_${safe}.zip`;
  await FileSystem.writeAsStringAsync(dest, bytesToBase64(zip), { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) return { ok: false, photos, message: 'Sharing is not available on this phone.' };
  await Sharing.shareAsync(dest, { mimeType: 'application/zip', dialogTitle: 'Export GlobeProbe progress', UTI: 'public.zip-archive' });
  return { ok: true, photos };
}
