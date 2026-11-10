"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Receipt } from "lucide-react";
import { formatEther } from "ethers";

interface EarningsWeek {
  totalWei: string;
  activatedReferrals: number;
  status: string;
  lastActivationAt?: string;
}

interface PayoutWeek {
  weekKey: string;
  status: string;
  amountPoints?: string;
  paidAt?: string;
  onChain?: {
    txHash: string;
    chain: string;
  };
  external?: {
    provider: string;
    reference: string;
    status: string;
  };
}

interface ReferralPayoutsTableProps {
  earnings: Record<string, EarningsWeek>;
  payouts: Record<string, PayoutWeek>;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: 'Pending', variant: 'outline' },
  payoutScheduled: { label: 'Scheduled', variant: 'secondary' },
  generated: { label: 'Generated', variant: 'secondary' },
  paid: { label: 'Paid', variant: 'default' },
  payoutFailed: { label: 'Failed', variant: 'destructive' },
  walletRequired: { label: 'Wallet Required', variant: 'destructive' },
};

export function ReferralPayoutsTable({ earnings, payouts }: ReferralPayoutsTableProps) {
  const sortedWeeks = Object.entries(earnings || {})
    .sort(([a], [b]) => b.localeCompare(a)); // newest first

  if (sortedWeeks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Payout History
          </CardTitle>
          <CardDescription>Track the status of your commission payouts</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No payout history yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <Receipt className="h-5 w-5" /> Payout History
        </CardTitle>
        <CardDescription>Track the status of your commission payouts</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week</TableHead>
              <TableHead>Amount (WLD)</TableHead>
              <TableHead>Referrals</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Transaction</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedWeeks.map(([weekKey, week]) => {
              const payout = payouts?.[weekKey];
              const status = week.status || 'open';
              const config = statusConfig[status] || statusConfig.open;
              const wld = parseFloat(formatEther(BigInt(week.totalWei || '0')));
              const txHash = payout?.onChain?.txHash;

              return (
                <TableRow key={weekKey}>
                  <TableCell className="font-mono text-sm">{weekKey}</TableCell>
                  <TableCell className="font-semibold">{wld.toFixed(4)}</TableCell>
                  <TableCell>{week.activatedReferrals || 0}</TableCell>
                  <TableCell>
                    <Badge variant={config.variant}>{config.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {txHash ? (
                      <a
                        href={`https://worldscan.org/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline text-sm"
                      >
                        {txHash.slice(0, 8)}...{txHash.slice(-6)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : payout?.external?.reference ? (
                      <span className="text-sm text-muted-foreground">{payout.external.provider}: {payout.external.reference}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
