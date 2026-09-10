
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
  Menu,
  ChevronRight,
  Sparkles,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserSession } from "@/hooks/useUserSession";
import { auth, database } from "@/lib/firebase-config";
import { signOut } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import { useRouter, usePathname } from "next/navigation";
import type { User as FirebaseUser } from "firebase/auth";
import { useEffect, useState, useCallback } from "react";
import { ref, onValue } from "firebase/database";
import { useWallet } from "@/context/wallet-provider";
import type { UserProfile } from "@/types/user";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from "./theme-toggle";

const navLinks = [
  { href: "/search", label: "Explore & Search", icon: Search, auth: false, adminOnly: false },
  { href: "/upload", label: "Upload Art", icon: Upload, auth: true, adminOnly: false },
  { href: "/rewards", label: "Rewards", icon: Gem, auth: true, adminOnly: false },
];

export default function Header() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<Partial<UserProfile> | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const { connectWallet, disconnectWallet, walletAddress, isConnected } = useWallet();

  // Keyboard shortcut (Cmd+K or Ctrl+K) to open search on desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        router.push("/search");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  // This hook receives the userProfile and handles session logic
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
      setMobileMenuOpen(false);
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
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };
  
  const isAdmin = userProfile?.role === 'Administrator' || userProfile?.role === 'Super-Administrator';
  const isArtist = userProfile?.role === 'Tattoo Artist' || userProfile?.role === 'Studio';
  const canSeeBookings = ['Client', 'Tattoo Artist', 'Studio'].includes(userProfile?.role || '');
  const canSeeCollection = ['Client', 'Tattoo Artist', 'Studio'].includes(userProfile?.role || '');

  return (
    <header className="bg-card/90 backdrop-blur-xl sticky top-0 z-50 border-b border-border/80 shadow-sm transition-colors duration-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand and Desktop Nav */}
          <div className="flex items-center space-x-6 lg:space-x-8">
            <Link href="/" className="flex items-center space-x-2.5 group">
              <div className="p-1.5 rounded-xl bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                <Palette className="h-6 w-6 text-primary transition-transform group-hover:scale-110 duration-200" />
              </div>
              <span className="font-headline text-2xl font-bold tracking-wider text-foreground">
                Inkfinity
              </span>
            </Link>

            <nav className="hidden md:flex items-center space-x-1 lg:space-x-1.5">
              {navLinks.map((link) => {
                 if (link.adminOnly && !isAdmin) return null;
                 if (!link.adminOnly && isAdmin) return null;
                 if (link.auth && !user) return null;
                 if (link.href === '/upload' && !isArtist) return null;
                 if (link.href === '/rewards' && isAdmin) return null;

                const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));

                return (
                  <Button 
                    key={link.href} 
                    variant="ghost" 
                    asChild 
                    className={`rounded-lg px-3.5 transition-all text-sm ${
                      isActive 
                        ? "bg-primary/15 text-primary font-semibold hover:bg-primary/20 shadow-xs" 
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/70 font-medium"
                    }`}
                  >
                    <Link href={link.href} className="flex items-center gap-2">
                      <link.icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      <span>{link.label}</span>
                    </Link>
                  </Button>
                );
              })}
            </nav>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Desktop Quick Search Trigger */}
            <button
              onClick={() => router.push('/search')}
              className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/80 bg-muted/30 hover:bg-accent/60 text-xs text-muted-foreground hover:text-foreground transition-all duration-200 w-44 group cursor-pointer"
              title="Search artworks, artists and styles"
              aria-label="Search Inkfinity"
            >
              <Search className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="flex-1 text-left truncate">Search styles...</span>
              <kbd className="inline-flex h-4 select-none items-center rounded border border-border/80 bg-card px-1 font-mono text-[10px] text-muted-foreground">
                ⌘K
              </kbd>
            </button>

            <ThemeToggle />

            {user ? (
              <>
                {!isAdmin && (
                  <>
                    <Link href="/rewards" className="hidden sm:inline-flex" title="View your rewards points">
                      <Badge variant="outline" className="flex items-center gap-1.5 text-primary border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors h-9 px-3 rounded-lg cursor-pointer">
                        <Gem className="h-4 w-4 text-primary" />
                        <span className="font-semibold">{(userProfile?.points || 0).toLocaleString()}</span>
                      </Badge>
                    </Link>
                    <NotificationBell userProfile={userProfile as UserProfile} />
                  </>
                )}

                {isConnected && !isAdmin ? (
                  <Button
                    variant="outline"
                    onClick={disconnectWallet}
                    className="hidden lg:inline-flex border-green-500/40 bg-green-500/5 hover:bg-green-500/10 text-green-500 dark:text-green-400 gap-1.5 h-9 rounded-lg"
                    title="Click to disconnect wallet"
                  >
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <Wallet className="h-4 w-4" />
                    <span>{formatAddress(walletAddress!)}</span>
                  </Button>
                ) : (
                  !isAdmin && (
                    <Button
                      variant="outline"
                      className="hidden lg:inline-flex border-primary/40 hover:bg-primary/10 gap-1.5 h-9 rounded-lg"
                      onClick={connectWallet}
                    >
                      <Wallet className="h-4 w-4 text-primary" />
                      <span>Connect Wallet</span>
                    </Button>
                  )
                )}

                {/* Desktop Profile Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 border border-primary/30 hover:border-primary transition-all">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={userProfile?.avatarUrl || undefined} alt="User avatar" className="object-cover" />
                        <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                          {getInitials(userProfile?.name || user?.displayName)}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-60 z-[100]" align="end" sideOffset={8} collisionPadding={12}>
                    <div className="px-3 py-2">
                      <p className="text-sm font-semibold truncate">{userProfile?.name || user?.displayName || "Member"}</p>
                      <p className="text-xs text-muted-foreground truncate">@{userProfile?.username || "user"}</p>
                      {userProfile?.role && (
                        <span className="inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                          {userProfile.role}
                        </span>
                      )}
                    </div>
                    <DropdownMenuSeparator />
                    {!isAdmin && (
                      <>
                        <DropdownMenuItem asChild disabled={!userProfile?.username}>
                          <Link href={`/${userProfile?.username || ''}`} className="cursor-pointer">
                            <User className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>Profile</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/dashboard" className="cursor-pointer">
                            <LayoutDashboard className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>Dashboard</span>
                          </Link>
                        </DropdownMenuItem>
                        {canSeeCollection && (
                          <DropdownMenuItem asChild>
                            <Link href="/collection" className="cursor-pointer">
                              <LayoutGrid className="h-4 w-4 mr-2 text-muted-foreground" />
                              <span>My Collection</span>
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem asChild>
                          <Link href="/following" className="cursor-pointer">
                            <FollowingIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>Following</span>
                          </Link>
                        </DropdownMenuItem>
                        {canSeeBookings && (
                          <DropdownMenuItem asChild>
                            <Link href="/dashboard/bookings" className="cursor-pointer">
                              <BookUser className="h-4 w-4 mr-2 text-muted-foreground" />
                              <span>Bookings</span>
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem asChild>
                          <Link href="/chat" className="cursor-pointer">
                            <MessageSquare className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>Messages</span>
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem asChild>
                      <Link href="/settings" className="cursor-pointer">
                        <Settings className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href="/admin" className="cursor-pointer font-medium text-primary">
                            <Shield className="h-4 w-4 mr-2" />
                            <span>Admin Panel</span>
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive cursor-pointer">
                      <LogOut className="h-4 w-4 mr-2" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button asChild size="sm" className="hidden sm:inline-flex rounded-lg">
                <Link href="/login" className="flex items-center gap-1.5">
                  <LogIn className="h-4 w-4" />
                  <span>Login / Sign Up</span>
                </Link>
              </Button>
            )}

            {/* Mobile Navigation Trigger Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden rounded-lg h-9 w-9 text-foreground hover:bg-accent focus:outline-none"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Toggle navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer (Sheet) */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="right" className="w-[85vw] sm:w-[380px] p-0 flex flex-col bg-background/95 backdrop-blur-2xl border-l border-border/80 z-[150]">
          <SheetHeader className="p-5 border-b border-border/70 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-xl bg-primary/10 border border-primary/20">
                <Palette className="h-5 w-5 text-primary" />
              </div>
              <SheetTitle className="font-headline text-xl font-bold tracking-wider">
                Inkfinity
              </SheetTitle>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {/* User Profile Info Card in Drawer */}
            {user ? (
              <div className="rounded-2xl border border-border/80 bg-card/60 p-4 space-y-3 shadow-sm">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-12 w-12 border-2 border-primary/40">
                    <AvatarImage src={userProfile?.avatarUrl || undefined} alt="User avatar" className="object-cover" />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {getInitials(userProfile?.name || user?.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate text-foreground">
                      {userProfile?.name || user?.displayName || "Member"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{userProfile?.username || "user"}
                    </p>
                    {userProfile?.role && (
                      <span className="inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                        {userProfile.role}
                      </span>
                    )}
                  </div>
                </div>

                {!isAdmin && (
                  <div className="flex items-center justify-between pt-2 border-t border-border/60">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Gem className="h-3.5 w-3.5 text-primary" /> Rewards Points:
                    </span>
                    <Link
                      href="/rewards"
                      onClick={() => setMobileMenuOpen(false)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {(userProfile?.points || 0).toLocaleString()} pts
                    </Link>
                  </div>
                )}

                {!isAdmin && (
                  <div className="pt-2 border-t border-border/60">
                    {isConnected ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-green-500 flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                          {formatAddress(walletAddress!)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={disconnectWallet}
                          className="h-7 text-xs text-muted-foreground hover:text-destructive px-2"
                        >
                          Disconnect
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={connectWallet}
                        className="w-full text-xs h-8 border-primary/30 hover:bg-primary/10 text-primary gap-1.5"
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        Connect Web3 Wallet
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3 text-center">
                <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Welcome to Inkfinity</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Discover world-class tattoo art and connect directly with verified artists.
                  </p>
                </div>
                <Button asChild className="w-full rounded-xl" onClick={() => setMobileMenuOpen(false)}>
                  <Link href="/login">
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In / Register
                  </Link>
                </Button>
              </div>
            )}

            {/* Primary Navigation Links */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
                Explore
              </p>
              <Button
                variant="ghost"
                asChild
                className="w-full justify-start h-11 px-3 rounded-xl text-base font-normal hover:bg-accent/80"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Link href="/search" className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted text-foreground">
                    <Search className="h-4 w-4" />
                  </div>
                  <span>Search Art & Artists</span>
                </Link>
              </Button>

              {isArtist && (
                <Button
                  variant="ghost"
                  asChild
                  className="w-full justify-start h-11 px-3 rounded-xl text-base font-normal hover:bg-accent/80"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Link href="/upload" className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Upload className="h-4 w-4" />
                    </div>
                    <span>Upload Artwork</span>
                  </Link>
                </Button>
              )}

              {!isAdmin && (
                <Button
                  variant="ghost"
                  asChild
                  className="w-full justify-start h-11 px-3 rounded-xl text-base font-normal hover:bg-accent/80"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Link href="/rewards" className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                      <Gem className="h-4 w-4" />
                    </div>
                    <span>Rewards & Badges</span>
                  </Link>
                </Button>
              )}
            </div>

            {/* User Account Navigation Links */}
            {user && (
              <div className="space-y-1 pt-2 border-t border-border/70">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
                  My Account
                </p>

                {!isAdmin && (
                  <>
                    {userProfile?.username && (
                      <Button
                        variant="ghost"
                        asChild
                        className="w-full justify-start h-10 px-3 rounded-xl text-sm font-normal hover:bg-accent/80"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Link href={`/${userProfile.username}`} className="flex items-center gap-3">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>My Profile</span>
                        </Link>
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      asChild
                      className="w-full justify-start h-10 px-3 rounded-xl text-sm font-normal hover:bg-accent/80"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Link href="/dashboard" className="flex items-center gap-3">
                        <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                        <span>Dashboard</span>
                      </Link>
                    </Button>

                    {canSeeCollection && (
                      <Button
                        variant="ghost"
                        asChild
                        className="w-full justify-start h-10 px-3 rounded-xl text-sm font-normal hover:bg-accent/80"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Link href="/collection" className="flex items-center gap-3">
                          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                          <span>My Collection</span>
                        </Link>
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      asChild
                      className="w-full justify-start h-10 px-3 rounded-xl text-sm font-normal hover:bg-accent/80"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Link href="/following" className="flex items-center gap-3">
                        <FollowingIcon className="h-4 w-4 text-muted-foreground" />
                        <span>Following</span>
                      </Link>
                    </Button>

                    {canSeeBookings && (
                      <Button
                        variant="ghost"
                        asChild
                        className="w-full justify-start h-10 px-3 rounded-xl text-sm font-normal hover:bg-accent/80"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Link href="/dashboard/bookings" className="flex items-center gap-3">
                          <BookUser className="h-4 w-4 text-muted-foreground" />
                          <span>Bookings</span>
                        </Link>
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      asChild
                      className="w-full justify-start h-10 px-3 rounded-xl text-sm font-normal hover:bg-accent/80"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Link href="/chat" className="flex items-center gap-3">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <span>Messages</span>
                      </Link>
                    </Button>
                  </>
                )}

                <Button
                  variant="ghost"
                  asChild
                  className="w-full justify-start h-10 px-3 rounded-xl text-sm font-normal hover:bg-accent/80"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Link href="/settings" className="flex items-center gap-3">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <span>Settings</span>
                  </Link>
                </Button>

                {isAdmin && (
                  <Button
                    variant="ghost"
                    asChild
                    className="w-full justify-start h-10 px-3 rounded-xl text-sm font-medium text-primary hover:bg-primary/10"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Link href="/admin" className="flex items-center gap-3">
                      <Shield className="h-4 w-4" />
                      <span>Admin Panel</span>
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Drawer Footer Actions */}
          <div className="p-4 border-t border-border/80 bg-card/40 space-y-2">
            {user && (
              <Button
                variant="outline"
                className="w-full justify-center h-10 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 gap-2"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                <span>Log Out</span>
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

