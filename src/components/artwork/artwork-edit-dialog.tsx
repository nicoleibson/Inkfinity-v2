// src/components/artwork/artwork-edit-dialog.tsx
"use client";

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { database } from '@/lib/firebase-config';
import { ref, update } from 'firebase/database';
import { Loader2 } from 'lucide-react';
import type { Artwork } from '@/types/artwork';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface ArtworkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artwork: Artwork;
}

export function ArtworkEditDialog({ open, onOpenChange, artwork }: ArtworkEditDialogProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    tags: [] as string[],
    isForSale: false,
    isDigitalAsset: false,
    blockchain: 'amoy' as 'amoy' | 'polygon',
    contractAddress: '',
    tokenId: '',
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (artwork) {
      setFormData({
        title: artwork.title || '',
        description: artwork.description || '',
        tags: artwork.tags || [],
        isForSale: artwork.isForSale || false,
        isDigitalAsset: artwork.isDigitalAsset || false,
        blockchain: artwork.blockchain || 'amoy',
        contractAddress: artwork.contractAddress || '',
        tokenId: artwork.tokenId || '',
      });
    }
  }, [artwork, open]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({...prev, tags: e.target.value.split(',').map(tag => tag.trim())}));
  };

  const handleSwitchChange = (name: 'isForSale' | 'isDigitalAsset', checked: boolean) => {
    setFormData(prev => ({...prev, [name]: checked}));
  };

  const handleSaveChanges = async () => {
    setLoading(true);
    if (formData.isDigitalAsset && (!formData.contractAddress.trim() || !formData.tokenId.trim())) {
        toast({ variant: 'destructive', title: 'Digital Asset Info Incomplete', description: 'Please provide a valid contract address and token ID.' });
        setLoading(false);
        return;
    }

    try {
      const artworkRef = ref(database, `artworks/${artwork.id}`);
      const updates: any = {
        title: formData.title,
        description: formData.description,
        tags: formData.tags,
        isForSale: formData.isForSale,
        price: null,
        isDigitalAsset: formData.isDigitalAsset,
        blockchain: formData.isDigitalAsset ? formData.blockchain : null,
        contractAddress: formData.isDigitalAsset ? formData.contractAddress : null,
        tokenId: formData.isDigitalAsset ? formData.tokenId : null,
      };

      await update(artworkRef, updates);
      toast({
        title: 'Artwork Updated',
        description: 'Your artwork details have been successfully saved.',
      });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Update error:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error.message || 'Could not save changes.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">Edit Artwork Details</DialogTitle>
          <DialogDescription>
            Make changes to your artwork. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" value={formData.title} onChange={handleInputChange} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" value={formData.description} onChange={handleInputChange} rows={4} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input id="tags" name="tags" value={formData.tags.join(', ')} onChange={handleTagsChange} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
                <h3 className="font-medium">Publicada en la Blockchain</h3>
                <p className="text-sm text-muted-foreground">
                    La obra queda enlazada y verificada en-chain. Inkfinity no gestiona transacciones de esta obra.
                </p>
            </div>
            <Switch
                checked={formData.isForSale}
                onCheckedChange={(checked) => handleSwitchChange('isForSale', checked)}
                aria-label="Published on blockchain"
            />
          </div>
           <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                    <h3 className="font-medium">Is this a Digital Asset (NFT)?</h3>
                    <p className="text-sm text-muted-foreground">
                        Link an existing NFT for this artwork.
                    </p>
                </div>
                <Switch
                    checked={formData.isDigitalAsset}
                    onCheckedChange={(checked) => handleSwitchChange('isDigitalAsset', checked)}
                    aria-label="Is this a digital asset"
                />
            </div>
             {formData.isDigitalAsset && (
                <div className="space-y-4 p-4 border rounded-md">
                    <div className="grid gap-2">
                        <Label htmlFor="blockchain">Blockchain</Label>
                        <Select value={formData.blockchain} onValueChange={(v) => setFormData(prev => ({...prev, blockchain: v as any}))}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="amoy">Amoy (Testnet)</SelectItem>
                                <SelectItem value="polygon">Polygon (Mainnet)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="contractAddress">Contract Address</Label>
                        <Input id="contractAddress" value={formData.contractAddress} onChange={e => setFormData(prev => ({...prev, contractAddress: e.target.value}))} placeholder="0x..."/>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="tokenId">Token ID</Label>
                        <Input id="tokenId" value={formData.tokenId} onChange={e => setFormData(prev => ({...prev, tokenId: e.target.value}))} placeholder="e.g., 123"/>
                    </div>
                </div>
            )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" onClick={handleSaveChanges} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
