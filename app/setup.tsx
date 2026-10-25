import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../src/ui/Screen';
import { T } from '../src/ui/Text';
import { C, BINDU_COLOURS } from '../src/ui/theme';
import { Bindu } from '../src/ui/Bindu';
import { SpeechBubble } from '../src/ui/SpeechBubble';
import { ChunkyButton, TextLink } from '../src/ui/ChunkyButton';
import { PinPad } from '../src/ui/PinPad';
import { KeyField } from '../src/ui/KeyField';
import { Card } from '../src/ui/Card';
import { Icon } from '../src/ui/Icon';
import { SETUP } from '../src/content/copy';
import { hasPin, setPin } from '../src/state/pin';
import { useApp } from '../src/state/app';
import { MAX_NAME } from '../src/db/queries';
import { speak } from '../src/ui/voice';
import { logError } from '../src/state/errorlog';

type Step = 'hello1' | 'hello2' | 'pin' | 'pin2' | 'key' | 'profile' | 'onboard';

/** First launch: Bindu hello, Parent PIN twice, optional Gemini key, first profile, 60 s child onboarding. */
export default function Setup() {
  const router = useRouter();
  const app = useApp();
  const [step, setStep] = useState<Step>('hello1');
  const [firstPin, setFirstPin] = useState('');
  const [msg, setMsg] = useState('');
  const [padKey, setPadKey] = useState(0);
  const [name, setName] = useState('');
  const [colour, setColour] = useState<string>('blue');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // A PIN already exists (for example the last profile was deleted): go straight to creating a profile.
    void hasPin().then((has) => { if (has) setStep('profile'); setChecked(true); });
  }, []);

  useEffect(() => { if (step === 'hello1') void speak(SETUP.hello); if (step === 'hello2') void speak(SETUP.intro2); }, [step]);

  const onPin = (pin: string) => { setFirstPin(pin); setMsg(''); setStep('pin2'); setPadKey((k) => k + 1); };
  const onPin2 = async (pin: string) => {
    if (pin !== firstPin) { setMsg(SETUP.pinMismatch); setStep('pin'); setFirstPin(''); setPadKey((k) => k + 1); return; }
    try { await setPin(pin); setStep('key'); } catch (e) { void logError('setPin', e); setMsg('Could not save the PIN. Try again.'); setStep('pin'); }
  };

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      const p = await app.createProfile(name, colour);
      await app.selectProfile(p.id);
      setStep('onboard');
    } catch (e) { void logError('createProfile', e); setErr('Could not create the profile. Try again.'); }
    setBusy(false);
  };
  const finish = async () => {
    await app.patchActive({ onboarded: true });
    router.replace('/(tabs)/home');
  };

  if (!checked) return null;

  if (step === 'hello1' || step === 'hello2') {
    return (
      <Screen scroll={false} style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Bindu size={160} expression={step === 'hello1' ? 'happy' : 'curious'} />
        <SpeechBubble text={step === 'hello1' ? SETUP.hello : SETUP.intro2} binduSize={0} />
        <View style={{ alignSelf: 'stretch' }}>
          <ChunkyButton label={step === 'hello1' ? 'Next' : SETUP.grownUp} onPress={() => setStep(step === 'hello1' ? 'hello2' : 'pin')} />
        </View>
      </Screen>
    );
  }

  if (step === 'pin' || step === 'pin2') {
    return (
      <Screen scroll={false} style={{ justifyContent: 'center' }}>
        <T v="h1" center>{SETUP.grownUp}</T>
        <T v="h2" center>{step === 'pin' ? SETUP.setPin : SETUP.confirmPin}</T>
        {msg ? <T v="body" center color={C.ink}>{msg}</T> : null}
        <PinPad resetKey={padKey} onComplete={step === 'pin' ? onPin : onPin2} />
        <T v="label" color={C.ink2} center>The PIN keeps the Parent Zone for grown-ups.</T>
      </Screen>
    );
  }

  if (step === 'key') {
    return (
      <Screen>
        <T v="h1">{SETUP.keyOptional}</T>
        <T v="body" color={C.ink2}>A Gemini key lets Bindu answer "Why?" questions and listen to case answers. Everything else works without it.</T>
        <Card><KeyField /></Card>
        <ChunkyButton label="Next" onPress={() => setStep('profile')} />
        <TextLink label={SETUP.later} onPress={() => setStep('profile')} />
      </Screen>
    );
  }

  if (step === 'profile') {
    return (
      <Screen>
        <T v="h1">{SETUP.createProfile}</T>
        <T v="label" color={C.ink2}>{SETUP.nameLabel}</T>
        <TextInput
          value={name} onChangeText={(t) => setName(t.slice(0, MAX_NAME))} maxLength={MAX_NAME}
          accessibilityLabel="Name" placeholder="Name" placeholderTextColor={C.ink2} autoCapitalize="words"
          style={{ minHeight: 60, borderWidth: 2, borderColor: C.ink, borderRadius: 20, backgroundColor: C.paper, paddingHorizontal: 16, fontFamily: 'Baloo2_700Bold', fontSize: 22, color: C.ink }}
        />
        <T v="label" color={C.ink2}>{SETUP.binduColour}</T>
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(BINDU_COLOURS).map(([k, hex]) => (
            <ColourDot key={k} name={k} hex={hex} selected={colour === k} onPress={() => setColour(k)} />
          ))}
        </View>
        {err ? <T v="body">{err}</T> : null}
        <ChunkyButton label={SETUP.go} onPress={create} disabled={!name.trim() || busy} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} style={{ justifyContent: 'center', alignItems: 'center' }}>
      <Bindu size={160} expression="curious" />
      <SpeechBubble text={SETUP.onboard} binduSize={0} />
      <View style={{ alignSelf: 'stretch', gap: 4 }}>
        <ChunkyButton label={SETUP.go} onPress={finish} />
        <TextLink label={SETUP.skip} onPress={finish} />
      </View>
    </Screen>
  );
}

function ColourDot({ name, hex, selected, onPress }: { name: string; hex: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name} Bindu`} accessibilityState={{ selected }} onPress={onPress}
      style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: hex, borderWidth: selected ? 4 : 2, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
      {selected ? <Icon name="check" size={28} /> : null}
    </Pressable>
  );
}
