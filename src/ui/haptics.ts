import * as Haptics from 'expo-haptics';

// Light on press and slider steps, Success on correct and stamp, nothing on not-quite.
export const hapticLight = () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
export const hapticMedium = () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };
export const hapticTick = () => { void Haptics.selectionAsync().catch(() => {}); };
export const hapticSuccess = () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };
