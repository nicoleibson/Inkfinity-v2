// src/components/admin/admin-stats.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Palette, UserCheck, DollarSign, PieChart as PieChartIcon } from "lucide-react";
import { database } from "@/lib/firebase-config";
import { ref, get } from "firebase/database";
import type { UserProfile } from "@/types/user";
import { Skeleton } from "../ui/skeleton";
import type { Artwork } from "@/types/artwork";
import { Bar, BarChart, ResponsiveContainer, Tooltip, Pie, PieChart, Cell } from "recharts";
import { StatCard } from "../ui/stat-card";
import type { ChartData } from "@/types/stats";

type Stats = {
    totalUsers: number;
    totalArtworks: number;
    totalRevenue: number;
    pendingRequests: number;
    salesData: ChartData[];
    userRoleData: ChartData[];
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--secondary))", "#82ca9d", "#ffc658"];

export function AdminStats() {
  const [stats, setStats] = useState<Partial<Stats>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
        setLoading(true);
        try {
            const usersRef = ref(database, 'users');
            const artworksRef = ref(database, 'artworks');

            const [usersSnap, artworksSnap] = await Promise.all([
                get(usersRef),
                get(artworksRef),
            ]);
            
            const roleCounts: {[key: string]: number} = {};
            let pendingRequests = 0;

            if (usersSnap.exists()) {
                usersSnap.forEach(userSnap => {
                    const user = userSnap.val() as UserProfile;
                    roleCounts[user.role] = (roleCounts[user.role] || 0) + 1;
                    if (user.artistRequestStatus === 'pending') {
                        pendingRequests++;
                    }
                });
            }

            const totalArtworks = artworksSnap.exists() ? artworksSnap.size : 0;
            
            let totalRevenue = 0;
            const salesDataMap: { [key: string]: number } = {};

            if (artworksSnap.exists()) {
                 artworksSnap.forEach(artworkSnap => {
                    const artwork = artworkSnap.val() as Artwork;
                    if (artwork.saleHistory) {
                        Object.values(artwork.saleHistory).forEach(sale => {
                             totalRevenue += sale.price;
                             const month = new Date(sale.timestamp).toLocaleString('default', { month: 'short' });
                             salesDataMap[month] = (salesDataMap[month] || 0) + sale.price;
                        });
                    }
                });
            }

            const salesData = Object.keys(salesDataMap).map(month => ({
                name: month,
                value: salesDataMap[month],
            })).slice(-12);
            
            const userRoleData = Object.entries(roleCounts).map(([name, value]) => ({ name, value }));

            setStats({
                totalUsers: usersSnap.size, 
                totalArtworks, totalRevenue,
                pendingRequests,
                salesData,
                userRoleData,
            });

        } catch (error) {
            console.error("Failed to fetch admin stats:", error);
        } finally {
            setLoading(false);
        }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Users" value={stats.totalUsers || 0} icon={Users} />
            <StatCard title="Total Artworks" value={stats.totalArtworks || 0} icon={Palette} />
            <StatCard title="Pending Requests" value={stats.pendingRequests || 0} icon={UserCheck} />
            <StatCard title="Total Revenue" value={`$${(stats.totalRevenue || 0).toLocaleString()}`} icon={DollarSign} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="lg:col-span-4">
                <CardHeader>
                    <CardTitle className="text-lg font-medium">Platform Revenue</CardTitle>
                </CardHeader>
                <CardContent className="pl-0">
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stats.salesData}>
                           <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                           <Bar dataKey="value" name="Sales" unit="$" style={{ fill: "hsl(var(--primary))" }} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="lg:col-span-3">
                <CardHeader>
                    <CardTitle className="text-lg font-medium">User Role Distribution</CardTitle>
                </CardHeader>
                 <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                            <Pie data={stats.userRoleData || []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                                {(stats.userRoleData || []).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
