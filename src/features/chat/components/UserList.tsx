// src/features/chat/components/UserList.tsx

import React, { useState } from 'react';
import { UserProfile } from '../types';
import '../styles/Chat.css';

interface UserListProps {
  users: UserProfile[];
  currentUser: UserProfile;
  onUserSelect?: (user: UserProfile) => void;
}

const getProfilePictureUrl = (profilePicturePath: string) => {
  return profilePicturePath
    ? `https://<SUPABASE_PROJECT_ID>.supabase.co/storage/v1/object/public/profile_images/${profilePicturePath}`
    : '/images/symbolobinfin.png';
};

export default function UserList({ users, currentUser, onUserSelect }: UserListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = users.filter(
    (user) =>
      `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.wallet_address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="user-list">
      <div className="user-list-header">
        <h2 className="user-list-title">Users</h2>
        <input
          type="text"
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="user-search-input"
        />
      </div>
      <div className="user-list-body">
        {filteredUsers.map((user) => (
          <div
            key={user.wallet_address}
            className={`user-list-item ${
              user.wallet_address === currentUser.wallet_address ? 'current-user' : ''
            }`}
            onClick={() => onUserSelect && onUserSelect(user)}
          >
            <div className="user-avatar">
              <img
                src={getProfilePictureUrl(user.profile_picture)}
                alt={`${user.first_name} ${user.last_name}`}
              />
            </div>
            <div className="user-info">
              <div className="user-name">
                {user.first_name} {user.last_name}
              </div>
            </div>
          </div>
        ))}
        {filteredUsers.length === 0 && (
          <div className="user-list-empty">No users found.</div>
        )}
      </div>
    </div>
  );
}
