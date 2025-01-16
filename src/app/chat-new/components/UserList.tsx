import React from 'react';
import { UserProfile } from '../types';

interface UserListProps {
  users: UserProfile[];
  currentUser: UserProfile;
}

export default function UserList({ users, currentUser }: UserListProps) {
  return (
    <div className="h-full">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold">Users</h2>
      </div>
      <div className="overflow-y-auto">
        {users.map((user) => (
          <div
            key={user.wallet_address}
            className={`p-4 border-b hover:bg-gray-50 flex items-center space-x-3 ${
              user.wallet_address === currentUser.wallet_address ? 'bg-blue-50' : ''
            }`}
          >
            <div className="w-10 h-10 rounded-full overflow-hidden">
              <img
                src={user.profile_picture || 'https://via.placeholder.com/40'}
                alt={`${user.first_name} ${user.last_name}`}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="font-medium">
                {user.first_name} {user.last_name}
              </div>
              <div className="text-sm text-gray-500">
                {user.wallet_address.slice(0, 6)}...{user.wallet_address.slice(-4)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}