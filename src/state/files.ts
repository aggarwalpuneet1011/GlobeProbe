// App-private storage for photos and recordings: documentDirectory/photos/{profileId}/{uuid}.jpg and audio/{profileId}/{uuid}.m4a.
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

const base = () => FileSystem.documentDirectory ?? '';

async function ensureDir(dir: string) {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

async function store(kind: 'photos' | 'audio', ext: string, profileId: string, fromUri: string): Promise<string> {
  const dir = `${base()}${kind}/${profileId}/`;
  await ensureDir(dir);
  const dest = `${dir}${Crypto.randomUUID()}.${ext}`;
  await FileSystem.copyAsync({ from: fromUri, to: dest });
  try { await FileSystem.deleteAsync(fromUri, { idempotent: true }); } catch { /* cache copy: fine to leave */ }
  return dest;
}
export const savePhoto = (profileId: string, uri: string) => store('photos', 'jpg', profileId, uri);
export const saveAudio = (profileId: string, uri: string) => store('audio', 'm4a', profileId, uri);

export async function removeProfileFiles(profileId: string) {
  for (const k of ['photos', 'audio']) { try { await FileSystem.deleteAsync(`${base()}${k}/${profileId}/`, { idempotent: true }); } catch { /* ignore */ } }
}
