
// src/app/about/page.tsx

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Palette, Shield, Users, BookUser, ShoppingCart } from "lucide-react";
import CopyButton from "@/components/ui/CopyButton"; // Import the new copy button

export default function AboutPage() {
    // Using a placeholder wallet address. Remember to set this in your environment variables.
    const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS || "0xAbCdEf1234567890123456789012345678901234";

    return (
        <div className="max-w-4xl mx-auto space-y-12">
            <section className="text-center">
                <h1 className="text-5xl font-headline font-bold text-primary">About Inkfinity</h1>
                <p className="mt-4 text-lg text-muted-foreground">
                    A decentralized ecosystem for the tattoo community, powered by creativity, passion, and Web3 technology.
                </p>
            </section>
            
             <section>
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline text-2xl">Our Core Features</CardTitle>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-6 text-muted-foreground">
                        <div className="flex items-start gap-4">
                            <Palette className="h-8 w-8 text-primary mt-1 shrink-0" />
                            <div>
                                <h3 className="font-semibold text-foreground">Artist Portfolios</h3>
                                <p>Showcase your portfolio with AI-assisted uploads, watermarking, and profile customization.</p>
                            </div>
                        </div>
                         <div className="flex items-start gap-4">
                            <ShoppingCart className="h-8 w-8 text-primary mt-1 shrink-0" />
                            <div>
                                <h3 className="font-semibold text-foreground">Digital & Physical Marketplace</h3>
                                <p>Sell your art as digital assets (NFTs) or offer physical products like merchandise and supplies.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <BookUser className="h-8 w-8 text-primary mt-1 shrink-0" />
                            <div>
                                <h3 className="font-semibold text-foreground">Direct Booking System</h3>
                                <p>Manage your schedule with our integrated booking system, including deposits and reviews.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <Shield className="h-8 w-8 text-primary mt-1 shrink-0" />
                            <div>
                                <h3 className="font-semibold text-foreground">Secure & Decentralized</h3>
                                <p>Leveraging blockchain for secure, peer-to-peer transactions and ownership verification.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </section>

            <section>
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline text-2xl">How It Works</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 text-muted-foreground">
                        <div className="flex items-start gap-4">
                            <Users className="h-8 w-8 text-primary mt-1 shrink-0" />
                            <div>
                                <h3 className="font-semibold text-foreground">For Artists & Studios</h3>
                                <p>Showcase your portfolio by uploading your artwork. Our AI assistants help you generate titles, descriptions, and tags. You can list your digital art for sale as NFTs or sell physical products like merchandise and supplies. Manage your bookings, interact with clients via direct chat, and build your brand within a vibrant community.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <Users className="h-8 w-8 text-primary mt-1 shrink-0" />
                            <div>
                                <h3 className="font-semibold text-foreground">For Clients & Enthusiasts</h3>
                                <p>Discover incredible tattoo art from around the world. Use our advanced search to find artists by style and location. Follow your favorite creators, book appointments, and purchase unique digital assets or physical products directly from artists and suppliers. Engage with the community, leave reviews, and build your personal collection of digital art.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </section>
            
            <section>
                <Card className="bg-card border-primary/20 shadow-lg shadow-primary/10">
                    <CardHeader className="text-center">
                         <div className="flex justify-center mb-4">
                            <Heart className="h-12 w-12 text-accent" />
                        </div>
                        <CardTitle className="font-headline text-2xl">Support the Platform</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-center">
                        <p className="text-muted-foreground">
                            Inkfinity is a passion project dedicated to empowering the tattoo community. If you enjoy the platform and want to support its continued development, maintenance, and new features, please consider making a donation.
                        </p>
                        <div className="p-4 bg-background rounded-md border">
                            <div className="flex items-center justify-center gap-x-2 break-all">
                                <p className="font-mono text-primary">{platformWallet}</p>
                                <CopyButton textToCopy={platformWallet} />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Your contributions help us cover server costs and fuel future innovations. Thank you for your support!
                        </p>
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}
