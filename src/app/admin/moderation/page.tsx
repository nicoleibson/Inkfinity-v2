// src/app/admin/moderation/page.tsx
import { ModerationQueue } from "@/components/admin/moderation-queue";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

export default function AdminModerationPage() {
    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-headline font-bold">Content Moderation Queue</h1>
            <p className="text-muted-foreground">Review artworks reported for deletion. Only Super-Administrators can take action here.</p>
            <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin"/></div>}>
                <ModerationQueue />
            </Suspense>
        </div>
    );
}
