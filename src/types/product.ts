// src/types/product.ts

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  storagePath: string;
  externalLink: string;
  ownerId: string; // UID of the Supply Store owner
  createdAt: string;
}
