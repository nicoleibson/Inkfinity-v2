import Link from "next/link";

export default function Footer() {
    return (
      <footer className="bg-card border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-center items-center space-x-6 text-sm text-muted-foreground">
             <Link href="/about" className="hover:text-primary transition-colors">
                About
              </Link>
              <Link href="/terms" className="hover:text-primary transition-colors">
                Terms & Conditions
              </Link>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            &copy; {new Date().getFullYear()} Inkfinity. All rights reserved.
          </p>
        </div>
      </footer>
    );
  }
  
