// Live Open-Meteo data: fetched only when Home or Sky Today opens, online, cache older than 60 min, never more than every 15 min.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useApp } from './app';
import * as Q from '../db/queries';
import { cacheState, fetchAll, shouldFetch, type CacheState, type TideSnap, type WeatherSnap } from '../live/openmeteo';
import { nowIso } from '../util/time';
import { logError } from './errorlog';

interface LiveCtx {
  weather: Record<string, WeatherSnap>;
  tide: TideSnap | null;
  fetchedAt: string | null;
  state: CacheState;
  loading: boolean;
  online: boolean | null;
  refreshIfNeeded: () => Promise<void>;
}
const Ctx = createContext<LiveCtx>({ weather: {}, tide: null, fetchedAt: null, state: 'hidden', loading: false, online: null, refreshIfNeeded: async () => {} });
export const useLive = () => useContext(Ctx);

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const { db } = useApp();
  const [weather, setWeather] = useState<Record<string, WeatherSnap>>({});
  const [tide, setTide] = useState<TideSnap | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const busy = useRef(false);
  const lastRef = useRef<string | null>(null);

  const loadCache = useCallback(async () => {
    const [w, t] = await Promise.all([Q.getCache<WeatherSnap>(db, 'weather'), Q.getCache<TideSnap>(db, 'tide')]);
    const map: Record<string, WeatherSnap> = {};
    for (const r of w) map[r.placeId] = r.data;
    setWeather(map);
    setTide(t[0]?.data ?? null);
    const last = await Q.lastLiveFetch(db);
    lastRef.current = last; setFetchedAt(last);
  }, [db]);

  useEffect(() => { loadCache().catch((e) => logError('liveCache', e)); }, [loadCache]);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false));
    return () => unsub();
  }, []);

  const refreshIfNeeded = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const net = await NetInfo.fetch();
      const isOnline = !!net.isConnected && net.isInternetReachable !== false;
      setOnline(isOnline);
      const now = nowIso();
      if (!shouldFetch(isOnline, lastRef.current, now)) return;
      setLoading(true);
      const res = await fetchAll((u) => fetch(u) as never, now);
      if (!res.weather.length && !res.tide) return;
      for (const w of res.weather) await Q.putCache(db, w.placeId, 'weather', w, now);
      if (res.tide) await Q.putCache(db, res.tide.placeId, 'tide', res.tide, now);
      await loadCache();
    } catch (e) { void logError('liveFetch', e); }
    finally { busy.current = false; setLoading(false); }
  }, [db, loadCache]);

  const value = useMemo<LiveCtx>(() => ({
    weather, tide, fetchedAt, loading, online, refreshIfNeeded,
    state: cacheState(fetchedAt, nowIso()),
  }), [weather, tide, fetchedAt, loading, online, refreshIfNeeded]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
