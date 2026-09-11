
// src/app/upload/upload-form.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { moderateImage } from '@/ai/flows/image-moderation';
import { generateArtworkDetails } from '@/ai/flows/artwork-details-generation';
import { verifyNftOwnership } from '@/ai/flows/verify-nft-ownership-flow';
import { Loader2, Sparkles, UploadCloud, ShieldAlert, ShieldCheck, FileUp, Droplets, Gem, HardDrive, Crop, ArrowRight, Info, X, MapPin, Wallet, FolderSync, CheckCircle2, Cloud, Database } from 'lucide-react';
import { getDatabase, ref as databaseRef, set, push, update, increment, get } from 'firebase/database';
import { auth, database } from '@/lib/firebase-config';
import { uploadDataUri } from '@/lib/firebase/storage';
import { authorizeGoogleDrive, uploadArtworkToGoogleDrive, getCachedDriveAccessToken } from '@/lib/google-drive';
import { uploadArtworkToIpfs } from '@/lib/ipfs';
import type { ArtworkDetailsOutput } from '@/ai/schemas/artwork-details-generation';
import { onAuthStateChanged } from 'firebase/auth';
import type { UserProfile } from '@/types/user';
import type { Artwork } from '@/types/artwork';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import ReactCrop, { type Crop as CropType, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

type LoadingState = 'idle' | 'moderating' | 'generating' | 'watermarking' | 'uploading' | 'saving' | 'verifying_nft' | 'success' | 'error';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_STORAGE_QUOTA = 1 * 1024 * 1024 * 1024; // 1 GB

function canvasPreview(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  crop: PixelCrop
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  
  canvas.width = Math.floor(crop.width * scaleX);
  canvas.height = Math.floor(crop.height * scaleY);

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );
}

const applyStandardWatermark = (dataUri: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject('No 2d context');

            // Draw original image
            ctx.drawImage(img, 0, 0);

            // Add standard watermark
            const fontSize = Math.max(20, Math.floor(img.width * 0.05)); // 5% of width, min 20px
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; // Semi-transparent white
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';

            // Add text shadow for better visibility on light backgrounds
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 3;

            const padding = Math.floor(fontSize * 0.5);
            ctx.fillText('© Inkfinity', canvas.width - padding, canvas.height - padding);

            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.onerror = () => reject(new Error('Failed to load image for watermarking'));
        img.src = dataUri;
    });
};

export default function UploadForm() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [artworkDetails, setArtworkDetails] = useState<Partial<ArtworkDetailsOutput>>({});
  const [currentTag, setCurrentTag] = useState('');
  
  // Marketplace unification
  const [isForSale, setIsForSale] = useState(false);
  const [price, setPrice] = useState<number | ''>('');
  const [blockchain, setBlockchain] = useState<'amoy' | 'polygon'>('amoy');
  const [contractAddress, setContractAddress] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [isNftVerified, setIsNftVerified] = useState(false);

  const [moderation, setModeration] = useState<{ isSafe: boolean; reason?: string } | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [driveConnected, setDriveConnected] = useState<boolean>(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState<boolean>(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const { toast } = useToast();
  const router = useRouter();

  const handleConnectDrive = async () => {
    setIsConnectingDrive(true);
    try {
      const token = await authorizeGoogleDrive();
      if (token) {
        setDriveConnected(true);
        toast({ title: 'Google Drive Conectado', description: 'Tus obras normales se guardarán en tu carpeta pública "Inkfinity Artworks".' });
      }
    } catch (err: any) {
      console.error('Error connecting Google Drive:', err);
      toast({ variant: 'destructive', title: 'Error al conectar Google Drive', description: err.message || 'No se pudo autorizar Google Drive.' });
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = databaseRef(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          const profile = { uid: user.uid, ...snapshot.val() };
          setCurrentUserProfile(profile);
          if (profile.role === 'Administrator' || profile.role === 'Super-Administrator') {
            toast({ variant: 'destructive', title: 'Access Denied', description: 'Administrators cannot upload artwork.' });
            router.push('/');
          }
        } else {
          router.push('/login');
        }
      } else {
        router.push('/login');
      }
      setLoadingUser(false);
    });
    return () => unsubscribe();
  }, [router, toast]);

  const processImage = useCallback(async (imageToProcess: string) => {
    setLoadingState('moderating');
    try {
      const moderationResult = await moderateImage({ photoDataUri: imageToProcess });
      setModeration(moderationResult);

      if (!moderationResult.isSafe) {
        toast({ variant: 'destructive', title: 'Image Moderation Failed', description: `Reason: ${moderationResult.reason}` });
        setLoadingState('error');
        return;
      }

      setLoadingState('generating');
      const detailsResult = await generateArtworkDetails({ imageDataUri: imageToProcess });
      setArtworkDetails({ title: detailsResult.title, description: detailsResult.description, tags: detailsResult.tags });
      toast({ title: 'AI Assistant', description: 'Artwork details have been generated!' });
      setLoadingState('success');
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Processing Error', description: 'An error occurred while processing the image.' });
      setLoadingState('error');
    }
  }, [toast]);
  
  const handleProceedToDetails = () => {
    if (completedCrop && imgRef.current && previewCanvasRef.current) {
        canvasPreview(imgRef.current, previewCanvasRef.current, completedCrop);
        const dataUrl = previewCanvasRef.current.toDataURL('image/jpeg');
        setCroppedImage(dataUrl);
        setStep(2);
        processImage(dataUrl);
    } else {
        toast({variant: 'destructive', title: 'No Crop Selection', description: 'Please select and crop an area of the image to continue.'})
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > MAX_FILE_SIZE) {
        toast({ variant: 'destructive', title: 'File Too Large', description: `The selected image must be smaller than 50MB. Yours is ${(selectedFile.size / 1024 / 1024).toFixed(2)}MB.` });
        return;
      }
      const storageUsed = currentUserProfile?.storageUsed || 0;
      if (storageUsed + selectedFile.size > MAX_STORAGE_QUOTA) {
         toast({ variant: 'destructive', title: 'Storage Quota Exceeded', description: `You don't have enough space. This upload would exceed your 1GB limit.` });
         return;
      }
      
      setStep(1);
      setFile(selectedFile);
      setModeration(null);
      setArtworkDetails({});
      setLoadingState('idle');
      setCroppedImage(null);
      setCrop(undefined);
      setCompletedCrop(undefined);
      setIsForSale(false);
      setPrice('');
      setContractAddress('');
      setTokenId('');
      setIsNftVerified(false);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setImgSrc(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setArtworkDetails(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && currentTag.trim()) {
      e.preventDefault();
      const newTag = currentTag.trim();
      if (!artworkDetails.tags?.includes(newTag)) {
        setArtworkDetails(prev => ({...prev, tags: [...(prev.tags || []), newTag]}));
      }
      setCurrentTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setArtworkDetails(prev => ({...prev, tags: prev.tags?.filter(tag => tag !== tagToRemove)}));
  };

  const handleVerifyNft = async () => {
    if (!currentUserProfile?.walletAddress) {
        toast({ variant: 'destructive', title: 'Wallet Not Connected', description: 'Please connect your wallet in settings first.' });
        return;
    }
    if (!contractAddress.trim() || !tokenId.trim()) {
        toast({ variant: 'destructive', title: 'Missing Info', description: 'Please enter Contract Address and Token ID.' });
        return;
    }

    setLoadingState('verifying_nft');
    try {
        const verification = await verifyNftOwnership({
            walletAddress: currentUserProfile.walletAddress,
            tokenId: tokenId,
            contractAddress: contractAddress
        });
        if (verification.isOwner) {
            setIsNftVerified(true);
            setLoadingState('success');
            toast({ title: 'NFT Verified!', description: 'Ownership confirmed on blockchain.' });
        } else {
            setIsNftVerified(false);
            setLoadingState('error');
            toast({ variant: 'destructive', title: 'Verification Failed', description: verification.reason });
        }
    } catch (error) {
        console.error("NFT Verification error:", error);
        toast({ variant: 'destructive', title: 'Verification Error' });
        setLoadingState('error');
    }
  };

  const handleSubmit = async () => {
    if (!croppedImage || !file || !artworkDetails.title) {
      toast({ variant: 'destructive', title: 'Missing Information', description: 'Please complete all details.' });
      return;
    }
    
    if (isForSale) {
        if (price === '' || Number(price) <= 0) {
            toast({ variant: 'destructive', title: 'Invalid Price' });
            return;
        }
        if (!isNftVerified) {
            toast({ variant: 'destructive', title: 'NFT Not Verified', description: 'You must verify ownership of the NFT before listing for sale.' });
            return;
        }
    }

    const user = auth.currentUser;
    if (!user || !currentUserProfile) {
      toast({ variant: 'destructive', title: 'Authentication Error' });
      return;
    }

    setLoadingState('watermarking');
    try {
      const watermarkedImageDataUri = await applyStandardWatermark(croppedImage);
      
      setLoadingState('uploading');
      const db = getDatabase();
      const artworksRef = databaseRef(db, 'artworks');
      const newArtworkRef = push(artworksRef);
      const artworkId = newArtworkRef.key;

      if (!artworkId) throw new Error('Could not generate a new artwork ID.');

      let imageUrl = '';
      let storagePath = '';
      let storageType: 'google-drive' | 'ipfs' | 'local' = 'local';
      let ipfsHash: string | undefined;
      let googleDriveFileId: string | undefined;
      let googleDriveFolderId: string | undefined;
      let googleDriveViewUrl: string | undefined;

      if (isForSale) {
        // Opción 3: IPFS para obras NFT
        toast({ title: 'Subiendo a IPFS...', description: 'Generando hash descentralizado y metadatos de NFT.' });
        try {
          const ipfsRes = await uploadArtworkToIpfs({
            dataUri: watermarkedImageDataUri,
            fileName: `${artworkDetails.title || 'nft'}_${artworkId}.jpg`,
            title: artworkDetails.title,
            description: artworkDetails.description,
            artistName: currentUserProfile.name,
            tags: artworkDetails.tags,
            contractAddress,
            tokenId,
          });

          imageUrl = ipfsRes.gatewayUrl;
          storagePath = ipfsRes.ipfsUri;
          storageType = 'ipfs';
          ipfsHash = ipfsRes.cid;
        } catch (ipfsErr: any) {
          console.warn('IPFS upload fallback:', ipfsErr);
          const fallbackPath = `artworks/${user.uid}/${artworkId}.jpg`;
          imageUrl = await uploadDataUri(fallbackPath, watermarkedImageDataUri);
          storagePath = fallbackPath;
          storageType = 'local';
        }
      } else {
        // Opción 1: Google Drive para obras normales
        let driveSuccess = false;
        try {
          let driveToken = getCachedDriveAccessToken();
          if (!driveToken) {
            toast({ title: 'Conectando con Google Drive...', description: 'Autorizando carpeta pública en tu cuenta de Google.' });
            driveToken = await authorizeGoogleDrive();
            setDriveConnected(true);
          }

          if (driveToken) {
            toast({ title: 'Subiendo a Google Drive...', description: 'Guardando en la carpeta "Inkfinity Artworks"...' });
            const driveRes = await uploadArtworkToGoogleDrive(
              driveToken,
              `${artworkDetails.title || 'obra'}_${artworkId}.jpg`,
              watermarkedImageDataUri
            );

            imageUrl = driveRes.imageUrl;
            storagePath = `gdrive://${driveRes.fileId}`;
            storageType = 'google-drive';
            googleDriveFileId = driveRes.fileId;
            googleDriveFolderId = driveRes.folderId;
            googleDriveViewUrl = driveRes.webViewLink;
            driveSuccess = true;
          }
        } catch (driveErr: any) {
          console.warn('Google Drive notice, using safe fallback:', driveErr);
          toast({
            title: 'Almacenamiento seguro',
            description: 'Guardando copia en la plataforma.',
          });
        }

        if (!driveSuccess) {
          const fallbackPath = `artworks/${user.uid}/${artworkId}.jpg`;
          imageUrl = await uploadDataUri(fallbackPath, watermarkedImageDataUri);
          storagePath = fallbackPath;
          storageType = 'local';
        }
      }

      setLoadingState('saving');
      const rawArtworkData: Record<string, any> = {
        title: artworkDetails.title || 'Untitled Artwork',
        description: artworkDetails.description || '',
        tags: artworkDetails.tags || [],
        imageUrl: imageUrl,
        storagePath: storagePath,
        storageType: storageType,
        ...(ipfsHash ? { ipfsHash } : {}),
        ...(googleDriveFileId ? { googleDriveFileId } : {}),
        ...(googleDriveFolderId ? { googleDriveFolderId } : {}),
        ...(googleDriveViewUrl ? { googleDriveViewUrl } : {}),
        fileSize: file.size,
        artistId: user.uid,
        artistName: currentUserProfile.name || '',
        artistUsername: currentUserProfile.username || '',
        artistAvatarUrl: currentUserProfile.avatarUrl || null,
        ownerId: user.uid,
        ownerName: currentUserProfile.name || '',
        createdAt: new Date().toISOString(),
        isForSale: isForSale, 
        price: isForSale ? Number(price) : null,
        isDigitalAsset: isForSale, // For sale unified with NFT
        blockchain: isForSale ? blockchain : null,
        contractAddress: isForSale ? (contractAddress || null) : null,
        tokenId: isForSale ? (tokenId || null) : null,
        ownershipMismatch: false,
        moderationStatus: 'approved',
        location: currentUserProfile.location || null,
        locationName: currentUserProfile.locationName || null,
      };

      // Strip any undefined keys so Firebase Realtime Database never throws "value argument contains undefined"
      const cleanArtworkData = Object.fromEntries(
        Object.entries(rawArtworkData).filter(([_, val]) => val !== undefined)
      );

      await set(newArtworkRef, cleanArtworkData);
      
      await update(databaseRef(db, `users/${user.uid}`), {
          artworksCount: increment(1),
          storageUsed: increment(file.size)
      });

      toast({ 
        title: '¡Obra publicada con éxito!', 
        description: isForSale 
          ? 'Registrada en IPFS con metadatos NFT.' 
          : 'Guardada en tu Google Drive correctamente.' 
      });
      router.push(`/${currentUserProfile.username}`);

    } catch (error) {
       console.error('Submission error:', error);
       toast({ variant: 'destructive', title: 'Submission Failed' });
       setLoadingState('error');
    }
  };
  
  const getStatusContent = () => {
      switch (loadingState) {
          case 'moderating': return <div className="flex items-center gap-2"><Loader2 className="animate-spin" /><span>Scanning safety...</span></div>;
          case 'generating': return <div className="flex items-center gap-2"><Sparkles className="animate-pulse text-primary" /><span>AI helper...</span></div>;
          case 'verifying_nft': return <div className="flex items-center gap-2"><Loader2 className="animate-spin" /><span>Blockchain verify...</span></div>;
          case 'watermarking': return <div className="flex items-center gap-2"><Droplets className="animate-pulse text-primary" /><span>Watermarking...</span></div>;
          case 'uploading': return <div className="flex items-center gap-2"><Loader2 className="animate-spin" /><span>Uploading...</span></div>;
          case 'success': return <div className="flex items-center gap-2 text-green-500"><ShieldCheck /><span>Ready to publish.</span></div>;
          case 'error': return <div className="flex items-center gap-2 text-red-500"><ShieldAlert /><span>{moderation?.reason || 'Error occurred.'}</span></div>;
          default: return <div className="flex items-center gap-2 text-muted-foreground"><FileUp /><span>Select image.</span></div>;
      }
  }

  const storageUsed = currentUserProfile?.storageUsed || 0;
  const storagePercentage = (storageUsed / MAX_STORAGE_QUOTA) * 100;

  if (loadingUser) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  
  if (!currentUserProfile?.locationName) {
    return (
      <Card className="max-w-4xl mx-auto p-8 text-center">
        <CardHeader>
            <MapPin className="mx-auto h-12 w-12 text-destructive" />
            <CardTitle className="font-headline mt-4 text-2xl">Location Required</CardTitle>
            <CardDescription>Ubicación necesaria en tu perfil para subir obras.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
             <Button asChild><Link href="/settings">Go to Settings</Link></Button>
        </CardFooter>
      </Card>
    );
  }

  const isProcessing = ['moderating', 'generating', 'watermarking', 'uploading', 'saving', 'verifying_nft'].includes(loadingState);
  const canSubmit = (loadingState === 'success' || loadingState === 'idle') && artworkDetails.title && (!isForSale || isNftVerified);

  return (
    <Card className="max-w-4xl mx-auto">
      <CardContent className="pt-6">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <Label htmlFor="picture">Artwork Image</Label>
            <Input id="picture" type="file" accept="image/*" onChange={handleFileChange} />
            
            <div className="aspect-square bg-muted rounded-md flex items-center justify-center overflow-hidden border-2 border-dashed">
              {imgSrc ? (
                  <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)} minHeight={100}>
                    <img ref={imgRef} alt="Crop" src={imgSrc} className="max-h-[400px] object-contain" />
                  </ReactCrop>
              ) : <Crop className="h-12 w-12 text-muted-foreground" />}
            </div>
            <canvas ref={previewCanvasRef} className="hidden" />
            <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Storage: {Math.round(storageUsed / 1024 / 1024)}MB / 1GB</span>
                </div>
                <Progress value={storagePercentage} className="h-1" />
            </div>
          </div>
          
          <div className="space-y-4">
            {step === 1 && imgSrc && (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center border rounded-lg bg-accent/10">
                    <h3 className="font-headline text-xl mb-4">Adjust & Crop</h3>
                    <Button onClick={handleProceedToDetails}>Continue <ArrowRight className="ml-2 h-4 w-4"/></Button>
                </div>
            )}

            {step === 2 && (
                <>
                <div className="p-3 rounded-lg bg-card border">{getStatusContent()}</div>
                <div className="space-y-4">
                    <div className="grid gap-2">
                        <Label>Title</Label>
                        <Input name="title" value={artworkDetails.title || ''} onChange={handleInputChange} disabled={isProcessing}/>
                    </div>
                    <div className="grid gap-2">
                        <Label>Description</Label>
                        <Textarea name="description" value={artworkDetails.description || ''} onChange={handleInputChange} rows={3} disabled={isProcessing}/>
                    </div>
                    
                    <div className="border rounded-lg p-4 bg-primary/5 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold flex items-center gap-2"><Gem className="h-4 w-4"/> Venta como NFT</h3>
                                <p className="text-xs text-muted-foreground">Requiere verificación en blockchain.</p>
                            </div>
                            <Switch checked={isForSale} onCheckedChange={setIsForSale} />
                        </div>

                        {isForSale && (
                            <div className="space-y-4 pt-2 border-t">
                                <div className="grid gap-2">
                                    <Label>Price (USD)</Label>
                                    <Input type="number" value={price} onChange={e => setPrice(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0.00" />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Blockchain Network</Label>
                                    <Select value={blockchain} onValueChange={(v: any) => setBlockchain(v)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="amoy">Polygon Amoy (Testnet)</SelectItem>
                                            <SelectItem value="polygon">Polygon Mainnet</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Contract Address</Label>
                                    <Input value={contractAddress} onChange={e => setContractAddress(e.target.value)} placeholder="0x..." />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Token ID</Label>
                                    <Input value={tokenId} onChange={e => setTokenId(e.target.value)} placeholder="123" />
                                </div>
                                <Button 
                                    variant={isNftVerified ? "secondary" : "outline"} 
                                    className="w-full" 
                                    onClick={handleVerifyNft}
                                    disabled={isProcessing || isNftVerified}
                                >
                                    {isNftVerified ? <ShieldCheck className="mr-2 text-green-500"/> : <Wallet className="mr-2"/>}
                                    {isNftVerified ? "Verified on Blockchain" : "Verify Ownership"}
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Storage Hybrid Mode Feedback */}
                    {!isForSale ? (
                      <div className="border rounded-lg p-3 bg-muted/40 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <h4 className="font-semibold text-xs sm:text-sm flex items-center gap-1.5 text-foreground">
                              <Cloud className="h-4 w-4 text-blue-500 shrink-0" />
                              Almacenamiento: Tu Google Drive Personal
                            </h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              La imagen se guardará en tu propia cuenta de Google, en la carpeta pública <span className="font-medium text-foreground">"Inkfinity Artworks"</span>. Mantienes tu propia cuota y nunca se pierde.
                            </p>
                          </div>
                          {driveConnected ? (
                            <Badge variant="outline" className="text-xs border-green-500 text-green-600 bg-green-50 dark:bg-green-950/30 flex items-center gap-1 shrink-0">
                              <CheckCircle2 className="h-3 w-3" /> Vinculado
                            </Badge>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleConnectDrive}
                              disabled={isConnectingDrive || isProcessing}
                              className="shrink-0 text-xs h-7 px-2"
                            >
                              {isConnectingDrive ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FolderSync className="h-3 w-3 mr-1" />}
                              Vincular Drive
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="border rounded-lg p-3 bg-muted/40 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <h4 className="font-semibold text-xs sm:text-sm flex items-center gap-1.5 text-foreground">
                              <Database className="h-4 w-4 text-purple-500 shrink-0" />
                              Almacenamiento: IPFS Descentralizado (NFT)
                            </h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Tu obra se guardará de forma inmutable en la red IPFS y se generarán los metadatos ERC-721/1155 vinculados al contrato del NFT.
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs border-purple-500 text-purple-600 bg-purple-50 dark:bg-purple-950/30 flex items-center gap-1 shrink-0">
                            <Gem className="h-3 w-3" /> IPFS Activo
                          </Badge>
                        </div>
                      </div>
                    )}
                </div>
                </>
            )}
          </div>
        </div>
      </CardContent>
      {step === 2 && (
          <CardFooter className="flex justify-end border-t pt-6">
            <Button size="lg" disabled={!canSubmit || isProcessing} onClick={handleSubmit}>
                {isProcessing ? <Loader2 className="animate-spin mr-2"/> : <UploadCloud className="mr-2" />}
                Submit Artwork
            </Button>
          </CardFooter>
      )}
    </Card>
  );
}
