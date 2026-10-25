import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { C } from './theme';
import { T } from './Text';
import { ChunkyButton, IconButton } from './ChunkyButton';
import { getKey, keyHint, removeKey, setKey, testKey } from '../ai/gemini';
import { PARENT } from '../content/copy';

type Status = 'idle' | 'testing' | 'ok' | 'fail' | 'offline';

/** Gemini key entry: masked field with eye toggle, Paste, Test key (saves on success), Remove key. Shows only the last 4 characters. */
export function KeyField({ onChange }: { onChange?: (hasKey: boolean) => void }) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => { void keyHint().then(setHint); }, []);

  const test = async () => {
    const k = value.trim();
    if (!k) return;
    setStatus('testing');
    const r = await testKey(k);
    if (r.ok) {
      await setKey(k);
      setValue(''); setHint(await keyHint()); setStatus('ok'); onChange?.(true);
    } else setStatus(r.error === 'NETWORK' ? 'offline' : 'fail');
  };
  const remove = async () => { await removeKey(); setHint(null); setStatus('idle'); onChange?.(false); };
  const paste = async () => { try { setValue((await Clipboard.getStringAsync()).trim()); setStatus('idle'); } catch { /* clipboard unavailable */ } };

  return (
    <View style={{ gap: 12 }}>
      {hint ? <T v="body">Saved key: {hint}</T> : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={value} onChangeText={(t) => { setValue(t); setStatus('idle'); }}
          secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} spellCheck={false}
          placeholder="Paste your Gemini API key" placeholderTextColor={C.ink2}
          accessibilityLabel="Gemini API key"
          style={{ flex: 1, minHeight: 56, borderWidth: 2, borderColor: C.ink, borderRadius: 16, backgroundColor: C.paper, paddingHorizontal: 14, fontFamily: 'Nunito_600SemiBold', fontSize: 16, color: C.ink }}
        />
        <IconButton icon={show ? 'hint' : 'lock'} label={show ? 'Hide key' : 'Show key'} onPress={() => setShow((s) => !s)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <ChunkyButton kind="ghost" label="Paste" onPress={paste} style={{ flex: 1 }} small />
        <ChunkyButton kind="secondary" label={status === 'testing' ? 'Testing…' : 'Test key'} onPress={test} disabled={!value.trim() || status === 'testing'} style={{ flex: 1 }} small />
      </View>
      {status === 'ok' ? <T v="label" color={C.greenDark}>{PARENT.keyWorks}</T> : null}
      {status === 'fail' ? <T v="label" color={C.ink}>{PARENT.keyFails}</T> : null}
      {status === 'offline' ? <T v="label" color={C.ink}>No internet right now, so the key could not be tested. Try again when online.</T> : null}
      {hint ? <ChunkyButton kind="ghost" label="Remove key" onPress={remove} small /> : null}
    </View>
  );
}
