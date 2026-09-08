// src/app/dashboard/layout.tsx
'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { BookUser, LayoutDashboard, Package, Shield, Users } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useUserSession } from '@/hooks/useUserSession';
import { auth, database } from '@/lib/firebase-config';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { get, ref } from 'firebase/database';
import type { UserProfile } from '@/types/user';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [userProfile, setUserProfile] = useState<Partial<UserProfile> | null>(null);

  useUserSession();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
            const userRef = ref(database, `users/${user.uid}`);
            get(userRef).then(snapshot => {
                if (snapshot.exists()) {
                    setUserProfile(snapshot.val());
                }
            });
        }
    });
    return () => unsubscribe();
  }, []);

  const menuItems = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, roles: ['Client', 'Tattoo Artist', 'Studio', 'Supply Store'] },
    { href: '/dashboard/bookings', label: 'Bookings', icon: BookUser, roles: ['Client', 'Tattoo Artist', 'Studio'] },
    { href: '/dashboard/studio', label: 'Manage Artists', icon: Users, roles: ['Studio'] },
    { href: '/dashboard/products', label: 'Manage Products', icon: Package, roles: ['Supply Store'] },
  ];

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="border-b">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-primary" />
            <h1 className="font-headline text-xl font-bold">Dashboard</h1>
          </div>
        </SidebarHeader>
        <SidebarContent className="pt-2">
          <SidebarMenu>
            {menuItems.map((item) => {
              if (userProfile?.role && !item.roles.includes(userProfile.role)) {
                return null;
              }
              return (
                <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    >
                    <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center justify-between border-b p-2 md:hidden">
            <div className="flex items-center gap-2">
                 <LayoutDashboard className="h-6 w-6 text-primary" />
                 <h1 className="font-headline text-xl font-bold">Dashboard</h1>
            </div>
            <SidebarTrigger/>
        </header>
        <div className="p-4 sm:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
