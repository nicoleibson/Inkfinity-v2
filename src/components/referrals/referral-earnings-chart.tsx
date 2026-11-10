"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { formatEther } from "ethers";
import { TrendingUp } from "lucide-react";

interface EarningsWeek {
  totalWei: string;
  activatedReferrals: number;
  status: string;
}

interface ReferralEarningsChartProps {
  earnings: Record<string, EarningsWeek>;
}

export function ReferralEarningsChart({ earnings }: ReferralEarningsChartProps) {
  // Sort by week key and take last 12
  const sortedWeeks = Object.entries(earnings || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12);

  const data = sortedWeeks.map(([weekKey, week]) => ({
    week: weekKey.replace(/^\d{4}-/, ''), // Show just W01, W02, etc.
    wld: parseFloat(formatEther(BigInt(week.totalWei || '0'))),
    referrals: week.activatedReferrals || 0,
  }));

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Weekly Earnings
          </CardTitle>
          <CardDescription>Your commission earnings by week</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No earnings data yet. Share your referral code to start earning!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <TrendingUp className="h-5 w-5" /> Weekly Earnings
        </CardTitle>
        <CardDescription>Commission earnings by week (WLD)</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number) => [`${value.toFixed(4)} WLD`, 'Earnings']}
            />
            <Bar dataKey="wld" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
