
// src/components/layout/header.tsx
"use client";

import Link from "next/link";
import {
  Palette,
  User,
  Settings,
  LogOut,
  Search,
  Upload,
  Gem,
  LayoutGrid,
  Shield,
  LogIn,
  Wallet,
  BookUser,
  LayoutDashboard,
  MessageSquare,
  Users as FollowingIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserSession } from "@/hooks/useUserSession";
import { auth, database } from "@/lib/firebase-config";
import { signOut } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import type { User as FirebaseUser } from "firebase/auth";
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { useWallet } from "@/context/wallet-provider";
import type { UserProfile } from "@/types/user";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from "./theme-toggle";

const navLinks = [
  { href: "/search", label: "Search", icon: Search, auth: false, adminOnly: false },
  { href: "/upload", label: "Upload", icon: Upload, auth: true, adminOnly: false },
  { href: "/rewards", label: "Rewards", icon: Gem, auth: true, adminOnly: false },
];

export default function Header() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<Partial<UserProfile> | null>(null);
  
  const { toast } = useToast();
  const router = useRouter();
  const { connectWallet, disconnectWallet, walletAddress, isConnected } = useWallet();

  // This hook now receives the userProfile and handles session logic
  useUserSession(userProfile as UserProfile);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDbRef = ref(database, `users/${currentUser.uid}`);
        const unsubscribeDb = onValue(userDbRef, (snapshot) => {
            if (snapshot.exists()) {
                setUserProfile({uid: currentUser.uid, ...snapshot.val()});
            } else {
                setUserProfile(null);
            }
        });
        
        return () => unsubscribeDb();
      } else {
        setUserProfile(null);
        if (isConnected) {
          disconnectWallet();
        }
      }
    });
    return () => unsubscribeAuth();
  }, [isConnected, disconnectWallet]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      toast({
        title: "Signed Out",
        description: "You have been successfully signed out.",
      });
      router.push("/");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Sign Out Failed",
        description: "An error occurred while signing out.",
      });
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "??";
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  
  const isAdmin = userProfile?.role === 'Administrator' || userProfile?.role === 'Super-Administrator';
  const isArtist = userProfile?.role === 'Tattoo Artist' || userProfile?.role === 'Studio';
  const isSupplyStore = userProfile?.role === 'Supply Store';
  const canSeeBookings = ['Client', 'Tattoo Artist', 'Studio'].includes(userProfile?.role || '');
  const canSeeCollection = ['Client', 'Tattoo Artist', 'Studio'].includes(userProfile?.role || '');

  return (
    <header className="bg-card/80 backdrop-blur-lg sticky top-0 z-50 border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-2">
              <Palette className="h-8 w-8 text-primary" />
              <span className="font-headline text-2xl font-bold tracking-wider text-foreground">
                Inkfinity
              </span>
            </Link>
            <nav className="hidden md:flex items-center space-x-6">
              {navLinks.map((link) => {
                 if (link.adminOnly && !isAdmin) return null;
                 if (!link.adminOnly && isAdmin) return null;
                 if (link.auth && !user) return null;
                 if (link.href === '/upload' && !isArtist) return null;
                 if (link.href === '/rewards' && isAdmin) return null;

                return (
                  <Button key={link.href} variant="ghost" asChild>
                    <Link href={link.href}>
                      <link.icon className="mr-2" />
                      {link.label}
                    </Link>
                  </Button>
                )
              })}
            </nav>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <ThemeToggle />
            {user ? (
              <>
                {!isAdmin && (
                  <>
                    <Badge variant="outline" className="hidden sm:flex items-center gap-2 text-primary border-primary/30 h-9">
                        <Gem />
                        <span>{(userProfile?.points || 0).toLocaleString()}</span>
                    </Badge>
                    <NotificationBell userProfile={userProfile as UserProfile} />
                  </>
                )}
                {isConnected && !isAdmin ? (
                  <Button variant="outline" className="hidden sm:inline-flex border-green-500/50 hover:bg-green-500/10 text-green-400">
                    <Wallet />
                    {formatAddress(walletAddress!)}
                  </Button>
                ) : (
                  !isAdmin && (
                    <Button variant="outline" className="hidden sm:inline-flex border-primary/50 hover:bg-primary/10" onClick={connectWallet}>
                      <Wallet />
                      Connect Wallet
                    </Button>
                  )
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                      <Avatar className="h-10 w-10 border-2 border-primary/50">
                        <AvatarImage src={userProfile?.avatarUrl || undefined} alt="User avatar" />
                        <AvatarFallback>{getInitials(userProfile?.name || user?.displayName)}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end">
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {!isAdmin && (
                      <>
                        <DropdownMenuItem asChild disabled={!userProfile?.username}>
                          <Link href={`/${userProfile?.username || ''}`}><User /><span>Profile</span></Link>
                        </DropdownMenuItem>
                         <DropdownMenuItem asChild>
                            <Link href="/dashboard"><LayoutDashboard /><span>Dashboard</span></Link>
                         </DropdownMenuItem>
                            {canSeeCollection && (
                                <DropdownMenuItem asChild>
                                    <Link href="/collection"><LayoutGrid /><span>My Collection</span></Link>
                                </DropdownMenuItem>
                            )}
                             <DropdownMenuItem asChild>
                                <Link href="/following"><FollowingIcon /><span>Following</span></Link>
                            </DropdownMenuItem>
                            {canSeeBookings && (
                                <DropdownMenuItem asChild>
                                    <Link href="/dashboard/bookings"><BookUser /><span>Bookings</span></Link>
                                </DropdownMenuItem>
                            )}
                         <DropdownMenuItem asChild>
                            <Link href="/chat"><MessageSquare /><span>Messages</span></Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem asChild>
                      <Link href="/settings"><Settings /><span>Settings</span></Link>
                    </DropdownMenuItem>
                    {isAdmin && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                            <Link href="/admin"><Shield /><span>Admin Panel</span></Link>
                            </DropdownMenuItem>
                        </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Button asChild>
                  <Link href="/login">
                    <LogIn />
                    Login / Sign Up
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
