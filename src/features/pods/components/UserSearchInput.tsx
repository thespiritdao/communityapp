'use client';

import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Users, User, Search } from 'lucide-react';
import { supabase } from '../../../utils/supabaseClient';

interface UserProfile {
  wallet_address: string;
  first_name?: string;
  last_name?: string;
  profile_picture?: string;
}

interface UserSearchInputProps {
  onUserSelect: (user: UserProfile) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const UserSearchInput: React.FC<UserSearchInputProps> = ({
  onUserSelect,
  placeholder = 'Search for a member...',
  disabled = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load all users on component mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoadingUsers(true);
        const { data, error } = await supabase
          .from('user_profiles')
          .select('wallet_address, first_name, last_name, profile_picture')
          .order('first_name', { ascending: true });

        if (error) {
          console.error('Error fetching users:', error);
        } else {
          setUsers(data || []);
        }
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);

  // Filter users based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredUsers([]);
      setIsDropdownOpen(false);
      return;
    }

    const filtered = users.filter((user) => {
      const fullName =
        `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
      const search = searchTerm.toLowerCase();
      return (
        fullName.includes(search) ||
        user.wallet_address?.toLowerCase().includes(search)
      );
    });

    setFilteredUsers(filtered.slice(0, 10)); // Limit to 10 results
    setIsDropdownOpen(filtered.length > 0);
  }, [searchTerm, users]);

  // Handle clicks outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);

  const handleUserSelect = (user: UserProfile) => {
    onUserSelect(user);
    setSearchTerm('');
    setIsDropdownOpen(false);
    inputRef.current?.blur();
  };

  const getDisplayName = (user: UserProfile) => {
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return `${user.wallet_address?.slice(0, 6)}...${user.wallet_address?.slice(-4)}`;
  };

  const getProfilePictureUrl = (user: UserProfile) => {
    if (!user.profile_picture) return null;

    if (user.profile_picture.startsWith('http')) {
      return user.profile_picture;
    }

    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile_images/${user.profile_picture}`;
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={loadingUsers ? 'Loading users...' : placeholder}
          disabled={disabled || loadingUsers}
          className="pl-10 pr-4"
          onFocus={() => {
            if (filteredUsers.length > 0) {
              setIsDropdownOpen(true);
            }
          }}
        />
      </div>

      {/* Dropdown */}
      {isDropdownOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredUsers.map((user) => (
            <button
              key={user.wallet_address}
              onClick={() => handleUserSelect(user)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                  {getProfilePictureUrl(user) ? (
                    <img
                      src={getProfilePictureUrl(user)!}
                      alt={getDisplayName(user)}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove(
                          'hidden',
                        );
                      }}
                    />
                  ) : (
                    <User className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {getDisplayName(user)}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {user.wallet_address?.slice(0, 8)}...
                    {user.wallet_address?.slice(-6)}
                  </p>
                </div>
              </div>
            </button>
          ))}

          {searchTerm && filteredUsers.length === 0 && !loadingUsers && (
            <div className="px-4 py-8 text-center text-gray-500">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No users found matching "{searchTerm}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserSearchInput;
