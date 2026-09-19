
// src/components/products/product-card.tsx
import type { Product } from '@/types/product';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Card className="overflow-hidden transition-all duration-300 hover:border-primary/60 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col">
      <CardHeader>
          <div className="aspect-video relative mb-4">
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                style={{ objectFit: 'cover' }}
                className="rounded-md"
                unoptimized={
                  product.imageUrl.startsWith('data:') ||
                  product.imageUrl.includes('lh3.googleusercontent.com') ||
                  product.imageUrl.startsWith('/uploads')
                }
              />
          </div>
          <CardTitle className="font-headline text-lg">{product.name}</CardTitle>
          <CardDescription>{product.category}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
          <p className="text-sm text-muted-foreground line-clamp-3">{product.description}</p>
      </CardContent>
      <CardFooter>
          <Button asChild className="w-full">
              <a href={product.externalLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2" /> View Product
              </a>
          </Button>
      </CardFooter>
    </Card>
  );
}
