import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Card } from '../../src/ui/Card';
import { Icon } from '../../src/ui/Icon';
import { StepDots } from '../../src/ui/StepDots';
import { ChunkyButton } from '../../src/ui/ChunkyButton';
import { SpeechBubble } from '../../src/ui/SpeechBubble';
import { BottomSheet } from '../../src/ui/BottomSheet';
import { useHardwareBack } from '../../src/ui/hooks';
import { usePrefs } from '../../src/ui/prefs';
import { playSfx } from '../../src/ui/sfx';
import type { SoundId } from '../../src/ui/assets';
import { C, R, SP } from '../../src/ui/theme';
import { useApp } from '../../src/state/app';
import * as P from '../../src/state/progress';
import { logError } from '../../src/state/errorlog';
import { DECKS } from '../../src/content';
import { DUEL, STOP } from '../../src/content/copy';
import { duelAnswer, duelCurrent, duelDone, duelStart, duelSummary, type DuelState } from '../../src/learning/duelRound';
import { useSay } from '../../src/stop/useSay';

type Phase = 'ask' | 'right' | 'wrong';

/** S5. Pair Duel: drag the card to a side or tap a side. No timer, no score history. */
export default function Duel() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const deck = DECKS.find((d) => d.id === deckId);
  const router = useRouter();
  const app = useApp();
  const { say, stop } = useSay();
  const { reduceMotion } = usePrefs();
  const { width } = useWindowDimensions();
  const [round, setRound] = useState<DuelState | null>(() => (deck ? duelStart(deck) : null));
  const [phase, setPhase] = useState<Phase>('ask');
  const [flash, setFlash] = useState<string | null>(null);
  const [leave, setLeave] = useState(false);
  const [asked, setAsked] = useState(0);
  const pos = useRef(new Animated.ValueXY()).current;
  const fade = useRef(new Animated.Value(1)).current;
  const wobble = useRef(new Animated.Value(0)).current;
  const zonesTop = useRef(0);
  const zonesRef = useRef<View>(null);
  const live = useRef({ phase, round, submit: (_: string) => {} });

  const profile = app.active;
  const item = round ? duelCurrent(round) : null;
  const n = deck?.sides.length ?? 2;
  const colW = (width - SP.side * 2 - 12 * (n - 1)) / n;

  const exit = () => { stop(); if (router.canGoBack()) router.back(); else router.replace('/(tabs)/home'); };
  useHardwareBack(() => { if (!round || duelDone(round)) { exit(); return true; } setLeave(true); return true; });
  useEffect(() => { if (!deck || !profile) router.replace('/(tabs)/home'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Each new item: reset the card, play the sound or read the sentence.
  useEffect(() => {
    if (!item) return;
    pos.setValue({ x: 0, y: 0 }); fade.setValue(1); wobble.setValue(0); setPhase('ask'); setFlash(null);
    if (item.kind === 'sound' && item.sound) playSfx(item.sound as SoundId);
    else if (item.text) say(item.text);
  }, [item?.id, asked]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (sideId: string) => {
    if (!deck || !item || !round || !profile || phase !== 'ask') return;
    const correct = sideId === item.side;
    const firstTry = !(item.id in round.firstTry);
    void (async () => {
      try {
        const out = await P.answerNaming(app.db, profile.id, item.concept ?? deck.concept, 'duel', item.id, sideId, correct, firstTry);
        await app.refresh(); if (out.rankUp) app.showRankUp(out.rankUp);
      } catch (e) { void logError('duel', e); }
    })();
    if (correct) {
      setPhase('right'); setFlash(sideId); playSfx('pop');
      if (!reduceMotion) Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: false }).start();
      setTimeout(() => { setRound((r) => (r ? duelAnswer(r, true) : r)); setAsked((a) => a + 1); }, reduceMotion ? 350 : 650);
    } else {
      setPhase('wrong'); playSfx('notquite'); say(item.reason);
      Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      if (!reduceMotion) Animated.sequence([-1, 1, -1, 1, 0].map((v) => Animated.timing(wobble, { toValue: v, duration: 80, useNativeDriver: false }))).start();
    }
  };
  live.current = { phase, round, submit };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => live.current.phase === 'ask',
    onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      const col = Math.floor((g.moveX - SP.side) / (colW + 12));
      if (g.moveY > zonesTop.current && col >= 0 && col < n && deck) { void live.current.submit(deck.sides[col].id); return; }
      Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
  }), [colW, n, deck]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!deck || !profile || !round) return null;

  if (duelDone(round)) {
    const s = duelSummary(round);
    return (
      <Screen>
        <T v="display" center>{DUEL.end.replace('{n}', String(s.right)).replace('{total}', String(s.total))}</T>
        {s.missed.length === 0 ? <SpeechBubble text={DUEL.perfect} expression="happy" binduSize={72} /> : (
          <View style={{ gap: 10 }}>
            <T v="h2">{DUEL.missed}</T>
            {s.missed.map((m) => (
              <Card key={m.id}>
                <T v="choice">{m.kind === 'sound' ? 'The sound you heard' : m.text}</T>
                <T color="#4A5565">{m.reason}</T>
              </Card>
            ))}
          </View>
        )}
        <ChunkyButton label={STOP.done} onPress={exit} />
      </Screen>
    );
  }
  if (!item) return null;

  return (
    <Screen scroll={false} style={{ justifyContent: 'space-between' }}>
      <View style={{ gap: 8 }}>
        <T v="h2">{deck.title}</T>
        <StepDots total={round.items.length} done={Math.min(round.items.length, round.items.length - new Set(round.queue).size)} />
        <T v="label" color="#4A5565">{DUEL.hint}</T>
      </View>

      <View style={{ alignItems: 'center', minHeight: 170 }}>
        <Animated.View {...pan.panHandlers}
          style={{ width: width - 80, opacity: fade, transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate: wobble.interpolate({ inputRange: [-1, 1], outputRange: ['-6deg', '6deg'] }) }] }}>
          <Card pad={20} fill={flash ? 'rgba(63,174,90,0.15)' : C.paper}>
            {item.kind === 'sound' ? (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <Icon name="speaker" size={64} />
                <ChunkyButton small kind="ghost" icon="speaker" label={DUEL.listen} onPress={() => item.sound && playSfx(item.sound as SoundId)} />
              </View>
            ) : <T v="h2" center>{item.text}</T>}
          </Card>
        </Animated.View>
      </View>

      {phase === 'wrong' ? (
        <View style={{ gap: 10 }}>
          <SpeechBubble text={item.reason} expression="encouraging" binduSize={48} />
          <ChunkyButton label={STOP.next} onPress={() => { setRound((r) => (r ? duelAnswer(r, false) : r)); setAsked((a) => a + 1); }} />
        </View>
      ) : null}

      <View ref={zonesRef} onLayout={() => zonesRef.current?.measureInWindow((_x, y) => { zonesTop.current = y; })} style={{ flexDirection: 'row', gap: 12, minHeight: 200 }}>
        {deck.sides.map((s) => (
          <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`Put it in ${s.label}`} disabled={phase !== 'ask'} onPress={() => submit(s.id)}
            style={{ width: colW, borderRadius: R.card, borderWidth: 2, borderColor: C.ink, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8,
              backgroundColor: flash === s.id ? 'rgba(63,174,90,0.2)' : C.selectedFill }}>
            <Icon name={s.icon} size={n > 2 ? 56 : 72} />
            <T v="h2" center>{s.label}</T>
            {flash === s.id ? <Icon name="check" size={32} /> : null}
          </Pressable>
        ))}
      </View>

      <BottomSheet visible={leave} onClose={() => setLeave(false)} scroll={false}>
        <View style={{ padding: 20, gap: 14 }}>
          <T v="h2">{DUEL.leaveTitle}</T>
          <T>{STOP.leaveBody}</T>
          <ChunkyButton label={STOP.keepGoing} onPress={() => setLeave(false)} />
          <ChunkyButton kind="ghost" label={STOP.leave} onPress={() => { setLeave(false); exit(); }} />
        </View>
      </BottomSheet>
    </Screen>
  );
}
