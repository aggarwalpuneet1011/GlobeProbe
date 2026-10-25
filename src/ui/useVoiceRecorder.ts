import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { stopSpeaking } from './voice';
import { logError } from '../state/errorlog';

export type RecState = 'idle' | 'recording' | 'denied';
/** Why start() returned false: the child said no, Android will not ask again (open Settings), or the recorder itself failed. */
export type RecError = 'denied' | 'blocked' | 'failed' | null;
export interface Recording { uri: string; seconds: number; silent: boolean }

const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };
const SILENCE_DB = -48;   // metering never rose above this: nothing was said
const MIN_SECONDS = 2;

/** Mic recording with a level meter for the waveform. Auto-stops at `maxSeconds` (Case Files: 45 s). */
export function useVoiceRecorder(maxSeconds: number, onAutoStop?: (r: Recording | null) => void) {
  const recorder = useAudioRecorder(OPTIONS);
  const rs = useAudioRecorderState(recorder, 120);
  const [state, setState] = useState<RecState>('idle');
  const [error, setError] = useState<RecError>(null);
  const errorRef = useRef<RecError>(null);
  const fail = (e: RecError) => { errorRef.current = e; setError(e); };
  const peak = useRef(-160);
  const stopping = useRef(false);

  const stop = useCallback(async (): Promise<Recording | null> => {
    if (stopping.current) return null;
    stopping.current = true;
    try {
      const ms = rs.durationMillis;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      setState('idle');
      const uri = recorder.uri;
      if (!uri) return null;
      const seconds = ms / 1000;
      return { uri, seconds, silent: seconds < MIN_SECONDS || peak.current < SILENCE_DB };
    } catch { setState('idle'); return null; }
    finally { stopping.current = false; }
  }, [recorder, rs.durationMillis]);

  const start = useCallback(async (): Promise<boolean> => {
    fail(null);
    stopSpeaking();
    // The permission call used to sit outside the try: any native error was swallowed and the mic button "did nothing" (FEEDBACK #3).
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setState('denied'); fail(perm.canAskAgain === false ? 'blocked' : 'denied'); return false; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      peak.current = -160;
      recorder.record();
      setState('recording');
      return true;
    } catch (e) { void logError('mic-start', e); setState('idle'); fail('failed'); return false; }
  }, [recorder]);

  useEffect(() => {
    if (rs.isRecording && typeof rs.metering === 'number') peak.current = Math.max(peak.current, rs.metering);
  }, [rs.isRecording, rs.metering]);

  useEffect(() => {
    if (state === 'recording' && rs.durationMillis >= maxSeconds * 1000) void stop().then((r) => onAutoStop?.(r));
  }, [rs.durationMillis, state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { try { void recorder.stop(); } catch { /* not recording */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const level = state === 'recording' && typeof rs.metering === 'number' ? Math.max(0, Math.min(1, (rs.metering + 60) / 60)) : 0;
  return { state, error, errorRef, level, seconds: rs.durationMillis / 1000, start, stop };
}
