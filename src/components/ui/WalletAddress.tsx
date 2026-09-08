'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const WalletAddress = () => {
  // IMPORTANT: Replace this with your actual wallet address
  const walletAddress = '0xAbCdEf1234567890123456789012345678901234';
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4">Support Our Platform</h2>
      <p className="mb-4">Help us grow by sending donations to our crypto wallet. Your support is greatly appreciated!</p>
      <div className="flex w-full max-w-sm items-center space-x-2">
        <Input type="text" value={walletAddress} readOnly />
        <Button onClick={handleCopy}>
          {copySuccess ? 'Copied!' : 'Copy'}
        </Button>
      </div>
    </div>
  );
};

export default WalletAddress;
