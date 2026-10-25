import Link from "next/link";
import { Palette, Shield, Gem, Sparkles, Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="w-full bg-card/60 backdrop-blur-md border-t border-border/80 text-foreground transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8 mb-12">
          {/* Brand Column */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="inline-flex items-center space-x-2.5 group">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                <Palette className="h-5 w-5 text-primary transition-transform group-hover:scale-110 duration-200" />
              </div>
              <span className="font-headline text-2xl font-bold tracking-wider text-foreground">
                Inkfinity
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
              The premier platform connecting tattoo enthusiasts, master artists, and creative studios. Discover curated portfolios, book consultations, and verify authentic art.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>All Systems Operational</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
                <Gem className="h-3.5 w-3.5" />
                <span>Web3 Verified</span>
              </div>
            </div>
          </div>

          {/* Column 2: Discover */}
          <div className="space-y-3">
            <h4 className="font-headline text-xs font-bold uppercase tracking-wider text-foreground">
              Discover
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/search?cat=artwork" className="hover:text-primary transition-colors">
                  Explore Artworks
                </Link>
              </li>
              <li>
                <Link href="/search?cat=artist" className="hover:text-primary transition-colors">
                  Featured Artists
                </Link>
              </li>
              <li>
                <Link href="/search?cat=studio" className="hover:text-primary transition-colors">
                  Tattoo Studios
                </Link>
              </li>
              <li>
                <Link href="/search?cat=supply_store" className="hover:text-primary transition-colors">
                  Supply Stores
                </Link>
              </li>
              <li>
                <Link href="/search?q=Realism&cat=artwork" className="hover:text-primary transition-colors">
                  Trending Styles
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Artists & Studios */}
          <div className="space-y-3">
            <h4 className="font-headline text-xs font-bold uppercase tracking-wider text-foreground">
              For Artists
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/upload" className="hover:text-primary transition-colors">
                  Upload Portfolio Art
                </Link>
              </li>
              <li>
                <Link href="/rewards" className="hover:text-primary transition-colors">
                  Inkfinity Rewards
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-primary transition-colors">
                  Artist Dashboard
                </Link>
              </li>
              <li>
                <Link href="/bookings" className="hover:text-primary transition-colors">
                  Booking Requests
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-primary transition-colors">
                  Join as an Artist
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Legal & Info */}
          <div className="space-y-3">
            <h4 className="font-headline text-xs font-bold uppercase tracking-wider text-foreground">
              Platform
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/about" className="hover:text-primary transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-primary transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/search" className="hover:text-primary transition-colors">
                  Advanced Search
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-primary transition-colors">
                  Sign In / Register
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>
            &copy; {new Date().getFullYear()} Inkfinity Network. Crafted for the global tattoo community.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms & Conditions
            </Link>
            <Link href="/about" className="hover:text-foreground transition-colors">
              Safety & Verification
            </Link>
            <span className="text-muted-foreground/60">•</span>
            <span className="flex items-center gap-1">
              Made with <Heart className="h-3 w-3 text-red-500 fill-red-500" /> for ink art
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
  
