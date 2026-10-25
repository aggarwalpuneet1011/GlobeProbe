import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, PanResponder, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R } from './theme';
import { usePrefs } from './prefs';

/** Paper sheet, top radius 28, grab handle 40x5, max height 85%. Slides up 300 ms. Android back closes only the sheet. */
export function BottomSheet({ visible, onClose, children, scroll = true }: { visible: boolean; onClose: () => void; children: React.ReactNode; scroll?: boolean }) {
  const { reduceMotion } = usePrefs();
  const insets = useSafeAreaInsets();
  const H = Dimensions.get('window').height;
  const y = useRef(new Animated.Value(H)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      y.setValue(reduceMotion ? 0 : H);
      if (!reduceMotion) Animated.timing(y, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      if (reduceMotion) { setMounted(false); return; }
      Animated.timing(y, { toValue: H, duration: 200, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) y.setValue(g.dy); },
    onPanResponderRelease: (_, g) => { if (g.dy > 90 || g.vy > 0.9) onClose(); else Animated.spring(y, { toValue: 0, useNativeDriver: true }).start(); },
  })).current;

  if (!mounted) return null;
  const Body = scroll ? ScrollView : View;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(31,42,55,0.45)' }} onPress={onClose} />
        <Animated.View style={{
          maxHeight: '85%', backgroundColor: C.paper, borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet,
          borderWidth: 2, borderBottomWidth: 0, borderColor: C.ink, paddingBottom: Math.max(insets.bottom, 12), transform: [{ translateY: y }],
        }}>
          <View {...pan.panHandlers} style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 10 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: C.stone }} />
          </View>
          <Body {...(scroll ? { keyboardShouldPersistTaps: 'handled', contentContainerStyle: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 } } : { style: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 } })}>
            {children}
          </Body>
        </Animated.View>
      </View>
    </Modal>
  );
}
