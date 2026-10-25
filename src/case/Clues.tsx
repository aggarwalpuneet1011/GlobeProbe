import React from 'react';
import { View } from 'react-native';
import type { Clue } from '../types';
import { T } from '../ui/Text';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { C } from '../ui/theme';

/** One clue card: photo-style illustration, note, witness, bar chart, tide rows or thermometers. */
export function ClueCard({ clue }: { clue: Clue }) {
  switch (clue.kind) {
    case 'photo':
      return <Card><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon name={clue.icon} size={72} /><T style={{ flex: 1 }}>{clue.text}</T></View></Card>;
    case 'note':
      return <Card fill="#FFF3D6"><View style={{ flexDirection: 'row', gap: 10 }}><Icon name="magnifier" size={36} /><T style={{ flex: 1 }}>{clue.text}</T></View></Card>;
    case 'witness':
      return <Card><T v="label" color="#4A5565">{clue.who} says:</T><T>“{clue.text}”</T></Card>;
    case 'bars': {
      const max = Math.max(1, ...clue.bars.map((b) => b.value));
      return (
        <Card>
          <T v="h2">{clue.title}</T>
          {clue.bars.map((b) => (
            <View key={b.label} style={{ gap: 3, minHeight: 44, justifyContent: 'center' }} accessible accessibilityLabel={`${b.label}: ${b.value} ${clue.unit}`}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T v="choice">{b.label}</T><T v="label">{b.value} {clue.unit}</T></View>
              <View style={{ height: 16, borderRadius: 8, backgroundColor: C.todo, overflow: 'hidden', borderWidth: 1.5, borderColor: C.ink }}>
                <View style={{ width: `${Math.max(3, (b.value / max) * 100)}%`, height: '100%', backgroundColor: C.sea }} />
              </View>
            </View>
          ))}
        </Card>
      );
    }
    case 'tides':
      return (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name="tide" size={40} /><T v="h2" style={{ flex: 1 }}>{clue.title}</T></View>
          {clue.rows.map((r) => <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T v="choice">{r.label}</T><T v="choice">{r.time}</T></View>)}
        </Card>
      );
    case 'thermos': {
      const hi = Math.max(...clue.items.map((i) => i.value)), lo = Math.min(0, ...clue.items.map((i) => i.value));
      return (
        <Card>
          <T v="h2">{clue.title}</T>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 120 }}>
            {clue.items.map((i) => (
              <View key={i.label} style={{ alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`${i.label}: ${i.value} degrees`}>
                <T v="label">{i.value}°</T>
                <View style={{ width: 22, height: 20 + ((i.value - lo) / Math.max(1, hi - lo)) * 60, borderRadius: 11, backgroundColor: C.coral, borderWidth: 2, borderColor: C.ink }} />
                <T v="label" center style={{ maxWidth: 90 }}>{i.label}</T>
              </View>
            ))}
          </View>
        </Card>
      );
    }
  }
}
