import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from 'src/components/ui/card';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';

interface BountyCardProps {
  id: string;
  title: string;
  description: string;
  category: string;
  value: {
    amount: string;
    token: 'SYSTEM' | 'SELF';
  };
  status: 'open' | 'in-progress' | 'completed';
  createdAt: Date;
  onBid?: () => void;
}

export const BountyCard: React.FC<BountyCardProps> = ({
  id,
  title,
  description,
  category,
  value,
  status,
  onBid,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-500';
      case 'in-progress':
        return 'bg-orange-500';
      case 'completed':
        return 'bg-orange-300';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <Card 
      className="w-full max-w-md mx-auto bounty-card" 
      data-status={status}
    >
      <CardHeader className="relative bounty-header">
        <div className="absolute top-2 right-2">
          <Badge variant="outline" className={`bounty-status ${status}`}>
            {status}
          </Badge>
        </div>
        <CardTitle className="text-xl font-bold bounty-title">{title}</CardTitle>
      </CardHeader>
      <CardContent className="bounty-content">
        <div className="space-y-4">
          <p className="text-gray-600 bounty-description">{description}</p>
          <div className="flex justify-between items-center bounty-meta">
            <Badge variant="secondary" className="bounty-category">{category}</Badge>
            <div className="text-right">
              <p className="font-semibold bounty-value">
                {value.amount} {value.token}
              </p>
            </div>
          </div>
          {status === 'open' && onBid && (
            <Button onClick={onBid} className="w-full bounty-btn">
              Bid on Bounty
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}; 