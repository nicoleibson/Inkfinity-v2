// src/types/chat.ts

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: any; // ServerTimestamp
  isRead: boolean;
}

export interface Chat {
  id: string;
  participants: { [key: string]: boolean }; // uids of participants
  participantInfo: {
    [key: string]: {
      name: string;
      avatarUrl: string;
    };
  };
  lastMessage: {
    text: string;
    timestamp: any; // ServerTimestamp
    senderId: string;
  };
  createdAt: any; // ServerTimestamp
}
