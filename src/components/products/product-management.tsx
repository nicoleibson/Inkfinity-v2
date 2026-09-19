
// src/components/products/product-management.tsx
"use client";

import { useState, useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { auth, database } from '@/lib/firebase-config';
import { ref as dbRef, set, push, onValue, query, orderByChild, equalTo, remove } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import type { UserProfile } from '@/types/user';
import type { Product } from '@/types/product';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


const productSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(3, "Name must be at least 3 characters long."),
    description: z.string().min(10, "Description must be at least 10 characters long."),
    category: z.string().min(2, "Category is required."),
    externalLink: z.string().url("Please enter a valid URL."),
    image: z.any().refine(file => file?.length > 0 || file instanceof File, 'Image is required.'),
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function ProductManagement() {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const { toast } = useToast();

    const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<ProductFormValues>({
        resolver: zodResolver(productSchema),
    });

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            if (firebaseUser) {
                const userRef = dbRef(database, `users/${firebaseUser.uid}`);
                const productsQuery = query(dbRef(database, 'products'), orderByChild('ownerId'), equalTo(firebaseUser.uid));

                onValue(userRef, (snapshot) => {
                    if (snapshot.exists()) {
                        setUser({ uid: firebaseUser.uid, ...snapshot.val() });
                    }
                });

                onValue(productsQuery, (snapshot) => {
                    const productsData: Product[] = [];
                    snapshot.forEach(child => {
                        productsData.push({ id: child.key!, ...child.val() });
                    });
                    setProducts(productsData);
                    setLoading(false);
                });
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const onSubmit: SubmitHandler<ProductFormValues> = async (data) => {
        if (!user) return;
        setIsSubmitting(true);

        try {
            const file = data.image[0] as File;
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const imageDataUri = reader.result as string;

                const productData: Omit<Product, 'id'> = {
                    name: data.name,
                    description: data.description,
                    category: data.category,
                    externalLink: data.externalLink,
                    imageUrl: imageDataUri,
                    storagePath: `local/${user.uid}/${Date.now()}-${file.name}`, // Mock path
                    ownerId: user.uid,
                    createdAt: new Date().toISOString(),
                };

                const productRefKey = editingProduct ? editingProduct.id : push(dbRef(database, 'products')).key;
                if (!productRefKey) {
                    throw new Error("Could not create product reference.");
                }

                await set(dbRef(database, `products/${productRefKey}`), productData);
                
                toast({ title: `Product ${editingProduct ? 'Updated' : 'Added'}`, description: `"${data.name}" has been successfully ${editingProduct ? 'updated' : 'added'}.` });
                reset();
                setEditingProduct(null);
                setIsDialogOpen(false);
            };

        } catch (error) {
            console.error("Product submission error:", error);
            toast({ variant: 'destructive', title: 'Submission Failed' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteProduct = async (product: Product) => {
        try {
            await remove(dbRef(database, `products/${product.id}`));
            toast({title: "Product Deleted"});
        } catch (error) {
             toast({variant: 'destructive', title: "Deletion Failed"});
        }
    }
    
    const openEditDialog = (product: Product) => {
        setEditingProduct(product);
        setValue('name', product.name);
        setValue('description', product.description);
        setValue('category', product.category);
        setValue('externalLink', product.externalLink);
        // Image is not pre-filled for simplicity in edit mode
        setIsDialogOpen(true);
    };

    const openNewDialog = () => {
        setEditingProduct(null);
        reset();
        setIsDialogOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold">Your Product Listings</h2>
                 <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                         <Button onClick={openNewDialog}>
                            <PlusCircle className="mr-2" /> Add New Product
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingProduct ? "Edit Product" : "Add a New Product"}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Product Name</Label>
                                <Input id="name" {...register('name')} />
                                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea id="description" {...register('description')} />
                                {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="category">Category</Label>
                                <Input id="category" {...register('category')} placeholder="e.g., Inks, Needles, Machines" />
                                {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="externalLink">Link to Product</Label>
                                <Input id="externalLink" {...register('externalLink')} placeholder="https://yourstore.com/product" />
                                {errors.externalLink && <p className="text-sm text-destructive">{errors.externalLink.message}</p>}
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="image">Product Image</Label>
                                <Input id="image" type="file" {...register('image')} accept="image/*" />
                                {errors.image && <p className="text-sm text-destructive">{errors.image.message as string}</p>}
                            </div>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="secondary">Cancel</Button>
                                </DialogClose>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="animate-spin" /> : (editingProduct ? "Save Changes" : "Add Product")}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
            
            {loading ? (
                <Loader2 className="mx-auto h-8 w-8 animate-spin" />
            ) : products.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.map(product => (
                        <Card key={product.id}>
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
                                <CardTitle>{product.name}</CardTitle>
                                <CardDescription>{product.category}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground line-clamp-3">{product.description}</p>
                            </CardContent>
                             <CardFooter className="flex justify-between">
                                <Button variant="outline" size="sm" onClick={() => openEditDialog(product)}>Edit</Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4"/></Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>This will permanently delete "{product.name}". This action cannot be undone.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteProduct(product)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            ) : (
                <p className="text-center text-muted-foreground py-8">You haven't listed any products yet.</p>
            )}
        </div>
    );
}
