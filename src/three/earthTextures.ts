import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { EARTH_TEXTURES } from '../ui/assets';
import { logError } from '../state/errorlog';

export type EarthSet = { day: THREE.Texture; night?: THREE.Texture; clouds?: THREE.Texture; spec?: THREE.Texture; bump?: THREE.Texture };
/** 1 = plain day map. 2 = + clouds, specular, relief, atmosphere. 3 = + custom shaders (glow, city lights at night). */
export type GlobeLevel = 1 | 2 | 3;

const getSize = (uri: string) => new Promise<{ width: number; height: number }>((res, rej) => Image.getSize(uri, (width, height) => res({ width, height }), rej));

/**
 * Builds a THREE texture straight from a bundled image, without THREE.TextureLoader.
 * TextureLoader needs a browser DOM (`document.createElementNS`) unless @react-three/fiber's native polyfill is applied to the same copy of three,
 * which is exactly what failed on device. expo-gl uploads `{ localUri }` data natively, which is what this relies on.
 */
export async function loadEarthTexture(module: number): Promise<THREE.Texture> {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const size = asset.width && asset.height ? { width: asset.width, height: asset.height } : await getSize(uri);
  const tex = new THREE.Texture();
  // expo-gl special case: `data.localUri` is decoded and uploaded natively.
  (tex as unknown as { image: unknown }).image = { data: { localUri: uri }, width: size.width, height: size.height };
  (tex as unknown as { isDataTexture: boolean }).isDataTexture = true;
  tex.flipY = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;   // repeat horizontally so the 180 degree seam has no line
  tex.needsUpdate = true;
  return tex;
}

/** Loads the textures a level needs, in parallel. Returns null while loading; calls onFail once if anything cannot be loaded. */
export function useEarthTextures(level: GlobeLevel, onFail: (e: unknown) => void): EarthSet | null {
  const [set, setSet] = useState<EarthSet | null>(null);
  useEffect(() => {
    let alive = true;
    setSet(null);
    (async () => {
      try {
        const [day, night, clouds, spec, bump] = await Promise.all([
          loadEarthTexture(EARTH_TEXTURES.day),
          level >= 3 ? loadEarthTexture(EARTH_TEXTURES.night) : Promise.resolve(undefined),
          level >= 2 ? loadEarthTexture(EARTH_TEXTURES.clouds) : Promise.resolve(undefined),
          level >= 2 ? loadEarthTexture(EARTH_TEXTURES.spec) : Promise.resolve(undefined),
          level >= 2 ? loadEarthTexture(EARTH_TEXTURES.bump) : Promise.resolve(undefined),
        ]);
        if (alive) setSet({ day, night, clouds, spec, bump });
      } catch (e) {
        void logError(`globe-tex-L${level}`, e);
        if (alive) onFail(e);
      }
    })();
    return () => { alive = false; };
  }, [level]); // eslint-disable-line react-hooks/exhaustive-deps
  return set;
}
