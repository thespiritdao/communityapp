import React from 'react';
import { Avatar } from './Avatar';
import { Name } from './Name';
import { Address } from './Address';
import type { Address as AddressType } from 'viem'; // assuming Address type comes from viem

type ProfileHeaderProps = {
  address: AddressType;
  className?: string;
};

export function ProfileHeader({ address, className }: ProfileHeaderProps) {
  return (
    <div className={`profile-header flex items-center gap-4 ${className}`}>
      <Avatar address={address} />
      <div>
        <Name address={address} />
        <Address address={address} />
      </div>
    </div>
  );
}
