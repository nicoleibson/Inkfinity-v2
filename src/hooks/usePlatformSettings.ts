// src/hooks/usePlatformSettings.ts
"use client";

import { useEffect, useState, useCallback } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/lib/firebase-config';
import { DEFAULT_NETWORK, type NetworkName } from '@/lib/blockchain';

export type ColorScheme = {
    background: string;
    foreground: string;
    card: string;
    primary: string;
    secondary: string;
    accent: string;
    border: string;
    input: string;
}

export type PlatformSettings = {
  network: NetworkName;
  lastNftSync?: string;
  studioRegistrationFee?: number;
  supplyStoreRegistrationFee?: number;
  artistMembershipTiers?: {
    tier1: number;
    tier2: number;
    tier3: number;
  };
  theme?: {
    dark: ColorScheme;
    light: ColorScheme;
  }
};

export function usePlatformSettings() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const settingsRef = ref(database, 'platform_settings');

    const unsubscribe = onValue(settingsRef, 
      (snapshot) => {
        if (snapshot.exists()) {
          setSettings(snapshot.val());
        } else {
          setSettings({ network: DEFAULT_NETWORK }); // default settings (WorldChain mainnet — WLD)
        }
        setLoading(false);
      }, 
      (err) => {
        console.error(err);
        setError("Failed to fetch platform settings. You may not have permission.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const updateThemeSetting = useCallback((themeType: 'light' | 'dark', colorName: keyof ColorScheme, value: string) => {
    setSettings(prev => {
        if (!prev) return null;
        
        const newTheme = { ...prev.theme };
        newTheme[themeType] = {
            ...newTheme[themeType],
            [colorName]: value
        } as ColorScheme;

        return {
            ...prev,
            theme: newTheme as { dark: ColorScheme; light: ColorScheme }
        }
    });
  }, []);

  return { settings, loading, error, updateThemeSetting };
}
