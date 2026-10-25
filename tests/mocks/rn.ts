export const Platform = { OS: 'android', select: (o: Record<string, unknown>) => o.android ?? o.default };
export const StyleSheet = { create: <T,>(s: T) => s };
