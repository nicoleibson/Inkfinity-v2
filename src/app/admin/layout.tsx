// src/app/admin/layout.tsx
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
import { Shield, Server, Users, Gavel, Award } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserSession } from '@/hooks/useUserSession';
import { useEffect, useState } from 'react';
import { auth, database } from '@/lib/firebase-config';
import { get, ref } from 'firebase/database';
import type { UserProfile } from '@/types/user';
import { Loader2 } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUserProfile, setCurrentUserProfile] = useState<Partial<UserProfile> | null>(null);
  const [loading, setLoading] = useState(true);

  useUserSession();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
        if (user) {
            const userRef = ref(database, `users/${user.uid}`);
            get(userRef).then(snapshot => {
                if (snapshot.exists()) {
                    const profile: UserProfile = snapshot.val();
                    setCurrentUserProfile(profile);
                     if (profile.role !== 'Administrator' && profile.role !== 'Super-Administrator') {
                        router.push('/');
                    } else {
                        setLoading(false);
                    }
                } else {
                    router.push('/login');
                }
            });
        } else {
            router.push('/login');
        }
    });
    return () => unsubscribe();
  }, [router]);

  const menuItems = [
    { href: '/admin', label: 'Platform', icon: Server, roles: ['Administrator', 'Super-Administrator'] },
    { href: '/admin/users', label: 'Users', icon: Users, roles: ['Administrator', 'Super-Administrator'] },
    { href: '/admin/moderation', label: 'Moderation', icon: Gavel, roles: ['Super-Administrator'] },
    { href: '/admin/referrals', label: 'My Referrals', icon: Award, roles: ['Administrator'] },
  ];

  if (loading) {
    return (
        <div className="flex justify-center items-center h-screen">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    )
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="border-b">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="font-headline text-xl font-bold">Admin Panel</h1>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {menuItems.map((item) => {
              if (currentUserProfile?.role && !item.roles.includes(currentUserProfile.role)) {
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
        <header className="flex items-center justify-between border-b p-4 sm:p-2 md:hidden">
            <div className="flex items-center gap-2">
                 <Shield className="h-6 w-6 text-primary" />
                 <h1 className="font-headline text-xl font-bold">Admin</h1>
            </div>
            <SidebarTrigger/>
        </header>
        <div className="p-4 sm:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
