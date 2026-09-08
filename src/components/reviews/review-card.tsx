// src/components/reviews/review-card.tsx
"use client";

import type { Review } from '@/types/review';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface ReviewCardProps {
  review: Review;
}

export function ReviewCard({ review }: ReviewCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Link href={`/${review.authorName}`} className="flex items-center gap-3 group">
            <Avatar className="h-10 w-10">
                <AvatarImage src={review.authorAvatarUrl} />
                <AvatarFallback>{review.authorName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
                <p className="font-semibold group-hover:text-primary">{review.authorName}</p>
                <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}</p>
            </div>
        </Link>
        <div className="flex items-center gap-1 text-amber-400">
            {[...Array(5)].map((_, i) => (
                <Star key={i} className={`w-5 h-5 ${i < review.rating ? 'fill-amber-400' : 'fill-muted stroke-muted-foreground'}`} />
            ))}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">{review.text}</p>
      </CardContent>
    </Card>
  );
}
