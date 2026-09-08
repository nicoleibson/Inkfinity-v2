// src/components/dashboard/dashboard-stats.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gem, HardDrive, Users, Image as ImageIcon, DollarSign, Package, BookUser, LayoutGrid, CheckCircle, Clock } from "lucide-react";
import { auth, database } from "@/lib/firebase-config";
import { onAuthStateChanged } from "firebase/auth";
import { ref, onValue, get, query, orderByChild, equalTo } from "firebase/database";
import type { UserProfile } from "@/types/user";
import { Skeleton } from "../ui/skeleton";
import { useRouter } from "next/navigation";
import { Bar, BarChart, Pie, PieChart, Cell, ResponsiveContainer } from "recharts";
import type { Artwork } from "@/types/artwork";
import { StatCard } from "../ui/stat-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "../ui/chart";
import type { ChartData } from "@/types/stats";
import type { Booking } from "@/types/booking";

const MAX_STORAGE_GB = 1;
const MAX_STORAGE_QUOTA = MAX_STORAGE_GB * 1024 * 1024 * 1024; // 1 GB
const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--secondary))", "#82ca9d", "#ffc658"];


type Stats = {
    totalRevenue: number;
    salesData: ChartData[];
    productCount: number;
    bookingsCount: number;
    residentArtistsCount: number;
    bookingStatusData: ChartData[];
}

export function DashboardStats() {
  const [userProfile, setUserProfile] = useState<Partial<UserProfile> | null>(null);
  const [stats, setStats] = useState<Partial<Stats>>({});
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        onValue(userRef, async (snapshot) => {
          if (snapshot.exists()) {
            const profile = { uid: user.uid, ...snapshot.val() };
            setUserProfile(profile);
            
            const fetchedStats: Partial<Stats> = {};

            if (['Tattoo Artist', 'Studio', 'Client'].includes(profile.role)) {
                let bookingsQuery;
                if (profile.role === 'Client') {
                    bookingsQuery = query(ref(database, 'bookings'), orderByChild('clientId'), equalTo(user.uid));
                } else {
                    bookingsQuery = query(ref(database, 'bookings'), orderByChild('artistId'), equalTo(user.uid));
                }
                const bookingsSnap = await get(bookingsQuery);
                let bookings: Booking[] = [];
                if(bookingsSnap.exists()){
                    bookingsSnap.forEach(snap => { bookings.push(snap.val()); });
                }
                fetchedStats.bookingsCount = bookings.length;
                
                const bookingStatusCounts = bookings.reduce((acc, booking) => {
                    acc[booking.status] = (acc[booking.status] || 0) + 1;
                    return acc;
                }, {} as {[key: string]: number});
                
                fetchedStats.bookingStatusData = Object.entries(bookingStatusCounts).map(([name, value]) => ({ name, value }));

            }

            if (['Tattoo Artist', 'Studio'].includes(profile.role)) {
                const salesDataMap: { [key: string]: number } = {};
                let revenue = 0;
                
                const artworksQuery = query(ref(database, 'artworks'), orderByChild('artistId'), equalTo(user.uid));
                const artworksSnap = await get(artworksQuery);
                if (artworksSnap.exists()) {
                    artworksSnap.forEach(artworkSnap => {
                        const artwork = artworkSnap.val() as Artwork;
                        if (artwork.saleHistory) {
                            Object.values(artwork.saleHistory).forEach(sale => {
                                if (sale.fromOwnerId === user.uid) { 
                                    revenue += sale.price;
                                    const month = new Date(sale.timestamp).toLocaleString('default', { month: 'short' });
                                    salesDataMap[month] = (salesDataMap[month] || 0) + sale.price;
                                }
                            });
                        }
                    });
                }
                
                fetchedStats.totalRevenue = revenue;
                fetchedStats.salesData = Object.keys(salesDataMap).map(month => ({
                    name: month,
                    value: salesDataMap[month],
                })).slice(-12);
            }
            
            if (profile.role === 'Supply Store') {
                const productsQuery = query(ref(database, 'products'), orderByChild('ownerId'), equalTo(user.uid));
                const productsSnap = await get(productsQuery);
                fetchedStats.productCount = productsSnap.exists() ? productsSnap.size : 0;
            }

            if (profile.role === 'Studio') {
                fetchedStats.residentArtistsCount = profile.residentArtists ? Object.keys(profile.residentArtists).length : 0;
            }
            
            setStats(fetchedStats);
          }
          setLoading(false);
        });
      } else {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  
  if (!userProfile) {
    return null;
  }
  
  const storageUsed = userProfile.storageUsed || 0;
  const storagePercentage = (storageUsed / MAX_STORAGE_QUOTA) * 100;
  
  const renderClientStats = () => (
     <div className="grid gap-4 grid-cols-2">
        <StatCard title="Points" value={userProfile.points?.toLocaleString() || 0} icon={Gem} />
        <StatCard title="Following" value={userProfile.followingCount?.toLocaleString() || 0} icon={Users} />
        <StatCard title="In Collection" value={userProfile.collectionCount?.toLocaleString() || 0} icon={LayoutGrid} />
        <StatCard title="Bookings" value={stats.bookingsCount?.toLocaleString() || 0} icon={BookUser} />
     </div>
  );

  const renderArtistStats = () => (
    <>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard title="Points" value={userProfile.points?.toLocaleString() || 0} icon={Gem} />
            <StatCard title="Followers" value={userProfile.followersCount?.toLocaleString() || 0} icon={Users} />
            <StatCard title="Artworks" value={userProfile.artworksCount?.toLocaleString() || 0} icon={ImageIcon} />
            <StatCard title="Total Revenue" value={`$${(stats.totalRevenue || 0).toLocaleString()}`} icon={DollarSign} />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="lg:col-span-4">
                <CardHeader>
                    <CardTitle>Your Sales</CardTitle>
                </CardHeader>
                <CardContent className="pl-0">
                     <ChartContainer config={{}} className="h-[250px] w-full">
                        <BarChart accessibilityLayer data={stats.salesData}>
                           <ChartTooltip 
                                content={<ChartTooltipContent 
                                    formatter={(value) => `$${value.toLocaleString()}`} 
                                />}
                           />
                           <Bar dataKey="value" fill="var(--color-fill)" radius={4} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>
            <Card className="lg:col-span-3">
                 <CardHeader>
                    <CardTitle>Booking Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={{}} className="h-[250px] w-full">
                       <PieChart>
                         <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                         <Pie data={stats.bookingStatusData} dataKey="value" nameKey="name" innerRadius={50}>
                           {stats.bookingStatusData?.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                           ))}
                         </Pie>
                       </PieChart>
                    </ChartContainer>
                </CardContent>
            </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
             <Card>
                <CardHeader>
                    <CardTitle>Storage Usage</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center p-0">
                    <ChartContainer config={{
                        storage: { label: "Storage", color: "hsl(var(--primary))" }
                    }} className="h-[250px] w-full">
                        <PieChart>
                           <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                           <Pie
                             data={[{name: 'used', value: storagePercentage, fill: 'var(--color-storage)'}, {name: 'free', value: 100 - storagePercentage, fill: 'var(--color-muted)'}]}
                             dataKey="value"
                             nameKey="name"
                             innerRadius={60}
                             strokeWidth={5}
                           >
                             <Cell key="used" fill="var(--color-storage)" />
                             <Cell key="free" fill="var(--color-muted)" />
                           </Pie>
                        </PieChart>
                    </ChartContainer>
                </CardContent>
            </Card>
        </div>
    </>
  );
  
  const renderStudioStats = () => (
     <>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <StatCard title="Points" value={userProfile.points?.toLocaleString() || 0} icon={Gem} />
            <StatCard title="Followers" value={userProfile.followersCount?.toLocaleString() || 0} icon={Users} />
            <StatCard title="Resident Artists" value={stats.residentArtistsCount?.toLocaleString() || 0} icon={Users} />
            <StatCard title="Total Revenue" value={`$${(stats.totalRevenue || 0).toLocaleString()}`} icon={DollarSign} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader><CardTitle>Studio Sales</CardTitle></CardHeader>
                <CardContent className="p-0">
                     <ChartContainer config={{}} className="h-[250px] w-full">
                        <BarChart accessibilityLayer data={stats.salesData}>
                            <ChartTooltip content={<ChartTooltipContent formatter={(value) => `$${value.toLocaleString()}`} />} />
                            <Bar dataKey="value" fill="var(--color-primary)" radius={4}/>
                        </BarChart>
                     </ChartContainer>
                </CardContent>
            </Card>
             <Card>
                 <CardHeader>
                    <CardTitle>Booking Status</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <ChartContainer config={{}} className="h-[250px] w-full">
                       <PieChart>
                           <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                           <Pie data={stats.bookingStatusData} dataKey="value" nameKey="name" innerRadius={50}>
                             {stats.bookingStatusData?.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                             ))}
                           </Pie>
                       </PieChart>
                    </ChartContainer>
                </CardContent>
            </Card>
        </div>
    </>
  )

  const renderSupplyStoreStats = () => (
     <div className="grid gap-4 grid-cols-2">
        <StatCard title="Followers" value={userProfile.followersCount?.toLocaleString() || 0} icon={Users} />
        <StatCard title="Products Listed" value={stats.productCount?.toLocaleString() || 0} icon={Package} />
    </div>
  );

  const renderStatsByRole = () => {
    switch (userProfile.role) {
        case 'Client':
            return renderClientStats();
        case 'Tattoo Artist':
            return renderArtistStats();
        case 'Studio':
            return renderStudioStats();
        case 'Supply Store':
            return renderSupplyStoreStats();
        default:
            return <p>No stats available for your role.</p>;
    }
  }

  return (
    <div className="space-y-4">
        {renderStatsByRole()}
    </div>
  );
}
