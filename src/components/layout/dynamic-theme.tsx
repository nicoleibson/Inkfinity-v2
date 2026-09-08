// src/components/layout/dynamic-theme.tsx
"use client";

import { useEffect } from 'react';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import type { ColorScheme } from '@/hooks/usePlatformSettings';

function generateCssVariables(scheme: ColorScheme | undefined, selector: string) {
  if (!scheme) return '';
  return `
    ${selector} {
      ${Object.entries(scheme)
        .map(([key, value]) => `--${key}: ${value};`)
        .join('\n')}
    }
  `;
}

export function DynamicTheme() {
  const { settings } = usePlatformSettings();

  useEffect(() => {
    if (settings?.theme) {
      const styleTagId = 'dynamic-theme-styles';
      let styleTag = document.getElementById(styleTagId) as HTMLStyleElement | null;
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleTagId;
        document.head.appendChild(styleTag);
      }
      
      const lightThemeCss = generateCssVariables(settings.theme.light, '.light, :root');
      const darkThemeCss = generateCssVariables(settings.theme.dark, '.dark');
      
      styleTag.innerHTML = lightThemeCss + darkThemeCss;
    }
  }, [settings?.theme]);

  return null; // This component does not render anything
}
