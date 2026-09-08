// src/components/admin/theme-customization.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { PlatformSettings, ColorScheme } from "@/hooks/usePlatformSettings";
import { Paintbrush } from "lucide-react";

interface ThemeCustomizationProps {
    theme: PlatformSettings['theme'] | null | undefined;
    onThemeChange: (themeType: 'light' | 'dark', colorName: keyof ColorScheme, value: string) => void;
}

const ColorInput = ({ label, value, onChange }: { label: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => {
    const colorValue = value ? value.split(' ').join(', ') : '';
    const colorStyle = `hsl(${colorValue})`;

    return (
        <div className="space-y-2">
            <Label className="capitalize">{label}</Label>
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md border" style={{ backgroundColor: colorStyle }} />
                <Input value={value} onChange={onChange} placeholder="e.g., 225 25% 9%" />
            </div>
        </div>
    );
}

export function ThemeCustomization({ theme, onThemeChange }: ThemeCustomizationProps) {
    if (!theme) return null;

    const renderThemeInputs = (themeType: 'light' | 'dark') => {
        const scheme = theme[themeType];
        if (!scheme) return null;
        return (
            <div className="space-y-4">
                <h4 className="font-semibold capitalize">{themeType} Theme</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(scheme).map(([key, value]) => (
                         <ColorInput 
                            key={`${themeType}-${key}`}
                            label={key}
                            value={value}
                            onChange={(e) => onThemeChange(themeType, key as keyof ColorScheme, e.target.value)}
                         />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2">
                    <Paintbrush />
                    Theme Customization
                </CardTitle>
                <CardDescription>
                    Adjust the HSL color values for the platform's light and dark themes. Changes are reflected live. Click "Save All Settings" below to make them permanent.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {renderThemeInputs('dark')}
                {renderThemeInputs('light')}
            </CardContent>
        </Card>
    );
}
