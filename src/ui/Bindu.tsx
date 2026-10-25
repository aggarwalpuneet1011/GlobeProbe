import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { BINDU_IMAGES, type BinduExpression } from './assets';
import { usePrefs } from './prefs';

/** Bindu the water droplet. Bobs ±3 dp over 2.4 s and blinks (happy-eyes for 120 ms) every 4 to 6 s. Both stop under Reduce motion. */
export function Bindu({ size = 72, expression = 'neutral', style, still }: { size?: number; expression?: BinduExpression; style?: StyleProp<ViewStyle>; still?: boolean }) {
  const { reduceMotion } = usePrefs();
  const bob = useRef(new Animated.Value(0)).current;
  const [blink, setBlink] = useState(false);
  const animate = !reduceMotion && !still;

  useEffect(() => {
    if (!animate) { bob.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [animate, bob]);

  useEffect(() => {
    if (!animate || expression === 'happy') return;
    let t: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => { setBlink(true); t2 = setTimeout(() => { setBlink(false); schedule(); }, 120); }, 4000 + Math.random() * 2000);
    };
    schedule();
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [animate, expression]);

  const shown = blink ? 'happy' : expression;
  return (
    <Animated.View
      accessible accessibilityLabel="Bindu, a water droplet"
      style={[{ width: size, height: size, transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] }) }] }, style]}>
      <Image source={BINDU_IMAGES[shown]} style={{ width: size, height: size }} resizeMode="contain" />
    </Animated.View>
  );
}

export const BinduRow = View;
