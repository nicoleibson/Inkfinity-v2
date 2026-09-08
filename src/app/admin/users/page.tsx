// src/app/admin/users/page.tsx
import UserManagementTable from "./user-management-table";
import { UserSync } from "@/components/admin/user-sync";

export default function AdminUsersPage() {
    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <h1 className="text-3xl font-headline font-bold">User Management</h1>
                <p className="text-muted-foreground">View, manage, and edit all users on the platform.</p>
            </div>
            
            <UserSync />

            <UserManagementTable />
        </div>
    );
}
