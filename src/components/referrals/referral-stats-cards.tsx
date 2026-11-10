"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Coins, Clock, CheckCircle } from "lucide-react";
import { formatEther } from "ethers";

interface EarningsWeek {
  totalWei: string;
  activatedReferrals: number;
  status: string;
}

interface ReferralStatsCardsProps {
  totalReferrals: number;
  earnings: Record<string, EarningsWeek>;
}

export function ReferralStatsCards({ totalReferrals, earnings }: ReferralStatsCardsProps) {
  const weeks = Object.values(earnings || {});
  
  const totalWei = weeks.reduce((acc, w) => acc + BigInt(w.totalWei || '0'), BigInt(0));
  const totalWld = parseFloat(formatEther(totalWei));
  
  const pendingWei = weeks.filter(w => w.status === 'open' || w.status === 'payoutScheduled').reduce((acc, w) => acc + BigInt(w.totalWei || '0'), BigInt(0));
  const pendingWld = parseFloat(formatEther(pendingWei));
  
  const paidWei = weeks.filter(w => w.status === 'paid').reduce((acc, w) => acc + BigInt(w.totalWei || '0'), BigInt(0));
  const paidWld = parseFloat(formatEther(paidWei));

  const stats = [
    { title: "Total Referrals", value: totalReferrals.toString(), icon: Users, description: "Users who signed up with your code" },
    { title: "Total Commissions", value: `${totalWld.toFixed(4)} WLD`, icon: Coins, description: "All-time earned commissions" },
    { title: "Pending", value: `${pendingWld.toFixed(4)} WLD`, icon: Clock, description: "Awaiting payout" },
    { title: "Paid Out", value: `${paidWld.toFixed(4)} WLD`, icon: CheckCircle, description: "Successfully received" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
