'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Input } from '@/components/ui/input';
import { X, User } from 'lucide-react';

interface UserProfile {
  wallet_address: string;
  first_name: string;
  last_name: string;
  profile_picture?: string;
}

interface UserSelectorProps {
  value: string; // wallet address
  onChange: (walletAddress: string) => void;
  placeholder?: string;
  excludeAddresses?: string[]; // Don't show already selected users
}

export function UserSelector({
  value,
  onChange,
  placeholder = 'Search by name or paste wallet address...',
  excludeAddresses = [],
}: UserSelectorProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load all users
  useEffect(() => {
    async function fetchUsers() {
      try {
        const { data, error } = await supabase
          .from('public_profiles')
          .select('wallet_address, first_name, last_name, profile_picture');

        if (error) {
          console.error('Error fetching users:', error);
        } else {
          setUsers(data || []);
        }
      } catch (err) {
        console.error('Exception fetching users:', err);
      }
    }

    fetchUsers();
  }, []);

  // Find selected user when value changes
  useEffect(() => {
    if (value && users.length > 0) {
      const user = users.find(
        (u) => u.wallet_address.toLowerCase() === value.toLowerCase(),
      );
      setSelectedUser(user || null);
      if (!user && value.startsWith('0x')) {
        // User manually entered a wallet address
        setSearchQuery(value);
      }
    } else {
      setSelectedUser(null);
    }
  }, [value, users]);

  // Filter users based on search
  useEffect(() => {
    if (!searchQuery) {
      setFilteredUsers([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = users
      .filter((user) => {
        // Exclude already selected addresses
        if (excludeAddresses.includes(user.wallet_address.toLowerCase())) {
          return false;
        }

        // Match name or wallet address
        const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
        const walletMatch = user.wallet_address.toLowerCase().includes(query);
        const nameMatch = fullName.includes(query);

        return walletMatch || nameMatch;
      })
      .slice(0, 10); // Limit to 10 results

    setFilteredUsers(filtered);
  }, [searchQuery, users, excludeAddresses]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);
    setShowDropdown(true);

    // If user is typing a wallet address directly
    if (newValue.startsWith('0x')) {
      onChange(newValue);
    }
  };

  const handleSelectUser = (user: UserProfile) => {
    setSelectedUser(user);
    setSearchQuery('');
    setShowDropdown(false);
    onChange(user.wallet_address);
  };

  const handleClear = () => {
    setSelectedUser(null);
    setSearchQuery('');
    onChange('');
  };

  const handleFocus = () => {
    if (!selectedUser) {
      setShowDropdown(true);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      {selectedUser ? (
        // Show selected user
        <div className="flex items-center gap-2 p-2 border rounded-md bg-white">
          <div className="flex items-center gap-2 flex-1">
            {selectedUser.profile_picture ? (
              <img
                src={selectedUser.profile_picture}
                alt={`${selectedUser.first_name} ${selectedUser.last_name}`}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="h-4 w-4 text-gray-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {selectedUser.first_name} {selectedUser.last_name}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      ) : (
        // Show search input
        <div>
          <Input
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={handleFocus}
            placeholder={placeholder}
            className="font-mono text-sm"
          />

          {/* Dropdown with user suggestions */}
          {showDropdown && filteredUsers.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
              {filteredUsers.map((user) => (
                <button
                  key={user.wallet_address}
                  type="button"
                  onClick={() => handleSelectUser(user)}
                  className="w-full flex items-center gap-2 p-2 hover:bg-gray-100 text-left"
                >
                  {user.profile_picture ? (
                    <img
                      src={user.profile_picture}
                      alt={`${user.first_name} ${user.last_name}`}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {user.first_name} {user.last_name}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
