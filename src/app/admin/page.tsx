// src/app/admin/page.tsx
"use client";

import { Suspense } from "react";
import AdminPanel from "./admin-panel";
import { AdminStats } from "@/components/admin/admin-stats";
import { Loader2 } from "lucide-react";
import { ThemeCustomization } from "@/components/admin/theme-customization";
import { usePlatformSettings, type PlatformSettings, type ColorScheme } from "@/hooks/usePlatformSettings";

export default function AdminPlatformPage() {
    const { settings, loading, updateThemeSetting } = usePlatformSettings();
    
    if (loading) {
        return (
            <div className="flex justify-center items-center h-96">
                <Loader2 className="h-16 w-16 animate-spin" />
            </div>
        )
    }

    return (
        <div className="space-y-8">
             <h1 className="text-3xl font-headline font-bold">Platform Overview</h1>
             <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>}>
                <AdminStats />
            </Suspense>
            <ThemeCustomization theme={settings?.theme} onThemeChange={updateThemeSetting} />
            <AdminPanel />
        </div>
    );
}
