// Camera-only photos (CAMERA permission only, no gallery, no location). The photo is copied into app-private storage.
import * as ImagePicker from 'expo-image-picker';
import { savePhoto } from '../state/files';
import { logError } from '../state/errorlog';

export type PhotoResult = { ok: true; path: string } | { ok: false; reason: 'denied' | 'cancelled' | 'failed' };

export async function takePhoto(profileId: string): Promise<PhotoResult> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'denied' };
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: false, exif: false });
    if (res.canceled || !res.assets?.[0]?.uri) return { ok: false, reason: 'cancelled' };
    return { ok: true, path: await savePhoto(profileId, res.assets[0].uri) };
  } catch (e) {
    void logError('camera', e);
    return { ok: false, reason: 'failed' };
  }
}
