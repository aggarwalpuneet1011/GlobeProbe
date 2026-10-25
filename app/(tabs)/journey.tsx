import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StopCardSheet } from '../../src/ui/StopCard';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, TRAIL_COLOUR } from '../../src/ui/theme';
import { T } from '../../src/ui/Text';
import { StopNode, NODE, type NodeState } from '../../src/ui/StopNode';
import { BottomSheet } from '../../src/ui/BottomSheet';
import { ChunkyButton } from '../../src/ui/ChunkyButton';
import { Icon } from '../../src/ui/Icon';
import { useToast } from '../../src/ui/Toast';
import { useApp } from '../../src/state/app';
import { CONCEPTS, deckForConcept, getConcept } from '../../src/content';
import { SYSTEM, STOP, HOME } from '../../src/content/copy';
import { isOpen } from '../../src/learning/nextStop';
import { knowItAllowed } from '../../src/learning/mastery';
import { EDGES, JOURNEY_HEIGHT, POS } from '../../src/ui/journeyLayout';
import { nowIso } from '../../src/util/time';
import type { ConceptId } from '../../src/types';

const NEEDS = Object.fromEntries(CONCEPTS.map((c) => [c.id, c.needs])) as Record<ConceptId, ConceptId[]>;
const LEGEND = [['Water', TRAIL_COLOUR.water], ['Air', TRAIL_COLOUR.air], ['Coast', C.ochre]] as const;

/** S3. A winding illustrated trail, not a list. Three coloured trails (Water, Air, Coast) start at the bottom; C06 sits where Water and Air meet. */
export default function Journey() {
  const router = useRouter();
  const app = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [card, setCard] = useState<ConceptId | null>(null);
  useFocusEffect(useCallback(() => { void app.refresh(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const H = JOURNEY_HEIGHT;
  const pt = (id: ConceptId) => ({ x: POS[id].x * width, y: H - POS[id].y });
  const progMap = useMemo(() => new Map(app.progress.map((p) => [p.conceptId, p])), [app.progress]);

  const trails = useMemo(() => EDGES.map((e) => {
    const a = pt(e.from), b = pt(e.to);
    const p = Skia.Path.Make();
    p.moveTo(a.x, a.y);
    const my = (a.y + b.y) / 2;
    p.cubicTo(a.x, my, b.x, my, b.x, b.y);
    return { p, trail: e.trail };
  }), [width]); // eslint-disable-line react-hooks/exhaustive-deps

  const stateOf = (id: ConceptId): NodeState => {
    const p = progMap.get(id);
    if (!p) return 'locked';
    if (p.level >= 4) return 'mastered';
    if (p.level >= 3) return 'stamped';
    if (!isOpen(id, progMap, NEEDS)) return 'locked';
    if (p.startedAt && p.stopStep > 0 && p.stopStep < 6) return 'progress';
    return 'open';
  };
  const unmet = (id: ConceptId) => NEEDS[id].filter((n) => (progMap.get(n)?.stopStep ?? 0) < 6);

  const onNode = (id: ConceptId) => {
    const st = stateOf(id);
    if (st === 'locked') {
      toast(SYSTEM.lockedStop.replace('{prereq}', unmet(id).map((n) => getConcept(n).short).join(' and ')));
      return;
    }
    if (st === 'stamped' || st === 'mastered') { setCard(id); return; }
    router.push(`/stop/${id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 64 + 24 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, gap: 8 }}>
          <T v="h1">Journey</T>
          <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
            {LEGEND.map(([name, col]) => (
              <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: col, borderWidth: 2, borderColor: C.ink }} />
                <T v="label">{name}</T>
              </View>
            ))}
          </View>
        </View>
        <View style={{ height: H + 70, marginTop: 8 }}>
          <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height: H + 70 }}>
            {trails.map((t, i) => (
              <React.Fragment key={i}>
                <Path path={t.p} color={C.ink} style="stroke" strokeWidth={18} strokeCap="round" />
                <Path path={t.p} color={t.trail === 'coast' ? C.sand : TRAIL_COLOUR[t.trail]} style="stroke" strokeWidth={12} strokeCap="round" />
              </React.Fragment>
            ))}
          </Canvas>
          {CONCEPTS.map((c) => {
            const p = pt(c.id);
            const p0 = progMap.get(c.id);
            const st = stateOf(c.id);
            return (
              <View key={c.id} style={{ position: 'absolute', left: p.x - 60, top: p.y - (NODE + 12) / 2 }}>
                <StopNode icon={c.icon} state={st} stepsDone={p0?.stopStep ?? 0} label={c.short}
                  subLabel={st === 'locked' ? `Needs: ${unmet(c.id).map((n) => getConcept(n).short).join(', ')}` : undefined}
                  onPress={() => onNode(c.id)} />
              </View>
            );
          })}
        </View>
      </ScrollView>

      <StopCardSheet conceptId={card} onClose={() => setCard(null)} />
    </View>
  );
}
