
// src/components/search/artist-result-card.tsx
import type { UserProfile } from '@/types/user';
import Link from 'next/link';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Building, MessageSquare, Loader2, Package } from 'lucide-react';

interface ArtistResultCardProps {
  user: UserProfile;
  currentUser?: UserProfile | null;
  onCreateChat?: (user: UserProfile) => void;
  isCreatingChat?: boolean;
}

const roleIcons: Record<string, React.ElementType> = {
    'Tattoo Artist': User,
    'Studio': Building,
    'Supply Store': Package,
};

export function ArtistResultCard({ user, currentUser, onCreateChat, isCreatingChat }: ArtistResultCardProps) {
  const Icon = roleIcons[user.role] || User;

  const handleMessageClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onCreateChat?.(user);
  };

  return (
    <Card className="overflow-hidden transition-all duration-300 hover:border-primary/60 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col group">
      <Link href={`/${user.username}`} className="block flex-grow">
        <CardContent className="p-4 flex flex-col items-center text-center gap-4">
          <Avatar className="h-24 w-24 border-2 border-primary/50">
            <AvatarImage src={user.avatarUrl} alt={user.name} />
            <AvatarFallback>
              <Icon className="w-10 h-10"/>
            </AvatarFallback>
          </Avatar>
          <div className="flex-grow overflow-hidden">
            <p className="font-headline text-lg truncate font-semibold group-hover:text-primary">{user.name}</p>
            <p className="text-sm text-muted-foreground truncate">@{user.username}</p>
            <Badge variant="secondary" className="mt-2">{user.role}</Badge>
          </div>
        </CardContent>
      </Link>
      {currentUser && currentUser.uid !== user.uid && onCreateChat && (currentUser.role === 'Administrator' || currentUser.role === 'Super-Administrator' || user.role === 'Administrator' || user.role === 'Super-Administrator') && (
        <CardFooter className="p-2 border-t">
          <Button variant="ghost" className="w-full" onClick={handleMessageClick} disabled={isCreatingChat}>
            {isCreatingChat ? <Loader2 className="animate-spin"/> : <MessageSquare />}
            Message
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
