// src/app/dashboard/products/page.tsx
"use client";

import { Suspense } from 'react';
import ProductManagement from '@/components/products/product-management';
import { Loader2 } from 'lucide-react';

export default function ProductsDashboardPage() {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-headline font-bold">Manage Your Products</h1>
                <p className="text-muted-foreground mt-2">
                    Add, edit, or remove the products you advertise on your profile.
                </p>
            </div>
            <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>}>
                <ProductManagement />
            </Suspense>
        </div>
    );
}
