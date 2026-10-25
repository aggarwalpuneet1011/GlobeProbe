import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { C } from './theme';
import { T } from './Text';
import { Icon } from './Icon';
import { BottomSheet } from './BottomSheet';
import { PinPad } from './PinPad';
import { PARENT } from '../content/copy';
import { pinLockMinutes, verifyPin } from '../state/pin';
import { hapticMedium } from './haptics';

const HOLD_MS = 3000;

/** Lock icon: press and hold for 3 seconds, then the 4-digit PIN. Calls onUnlocked after a right PIN. */
export function ParentGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [lockedFor, setLockedFor] = useState(0);
  const [padKey, setPadKey] = useState(0);
  const prog = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    Animated.timing(prog, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };
  const start = () => {
    prog.setValue(0);
    Animated.timing(prog, { toValue: 1, duration: HOLD_MS, useNativeDriver: false }).start();
    timer.current = setTimeout(async () => {
      timer.current = null;
      hapticMedium();
      prog.setValue(0);
      const m = await pinLockMinutes();
      setLockedFor(m); setMsg(m ? PARENT.locked.replace('{m}', String(m)) : '');
      setOpen(true);
    }, HOLD_MS);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const check = async (pin: string) => {
    const r = await verifyPin(pin);
    if (r.ok) { setOpen(false); setMsg(''); onUnlocked(); return; }
    setPadKey((k) => k + 1);
    if (r.lockedMinutes > 0) { setLockedFor(r.lockedMinutes); setMsg(PARENT.locked.replace('{m}', String(r.lockedMinutes))); }
    else setMsg(`That PIN did not match. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left.`);
  };

  const width = prog.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Parent Zone. Press and hold for 3 seconds."
          onPressIn={start} onPressOut={cancel}
          style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: C.ink, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="lock" size={32} />
        </Pressable>
        <View style={{ width: 64, height: 6, borderRadius: 3, backgroundColor: C.todo, overflow: 'hidden' }}>
          <Animated.View style={{ width, height: 6, backgroundColor: C.night }} />
        </View>
        <T v="label" color={C.ink2} center>{PARENT.holdHint}</T>
      </View>
      <BottomSheet visible={open} onClose={() => setOpen(false)} scroll={false}>
        <T v="h1" center>{PARENT.pinTitle}</T>
        {msg ? <T v="body" center>{msg}</T> : null}
        <View style={{ alignItems: 'center', paddingBottom: 12 }}>
          <PinPad resetKey={padKey} onComplete={check} disabled={lockedFor > 0} />
        </View>
      </BottomSheet>
    </>
  );
}
