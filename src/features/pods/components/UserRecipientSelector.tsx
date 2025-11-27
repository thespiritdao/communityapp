'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X, User, Search } from 'lucide-react';

interface User {
  wallet_address: string;
  first_name: string;
  last_name: string;
  profile_picture?: string;
}

interface RecipientSelection {
  address: string;
  name: string;
  amount: string;
}

interface UserRecipientSelectorProps {
  recipients: RecipientSelection[];
  onRecipientsChange: (recipients: RecipientSelection[]) => void;
  distributionType: 'single' | 'batch' | 'equal';
}

export default function UserRecipientSelector({
  recipients,
  onRecipientsChange,
  distributionType,
}: UserRecipientSelectorProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQueries, setSearchQueries] = useState<string[]>(
    recipients.map(() => ''),
  );
  const [showSuggestions, setShowSuggestions] = useState<boolean[]>(
    recipients.map(() => false),
  );
  const [filteredUsers, setFilteredUsers] = useState<User[][]>(
    recipients.map(() => []),
  );

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Fetch all users on component mount
  useEffect(() => {
    async function fetchUsers() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('wallet_address, first_name, last_name, profile_picture')
          .not('first_name', 'is', null)
          .not('last_name', 'is', null);

        if (error) {
          console.error('Error fetching users:', error);
        } else {
          setUsers(data || []);
          console.log(
            'Loaded users for recipient selection:',
            data?.length || 0,
          );
        }
      } catch (err) {
        console.error('Exception fetching users:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, []);

  // Update filtered suggestions when search query changes
  useEffect(() => {
    const newFilteredUsers = searchQueries.map((query, index) => {
      if (!query.trim()) return users.slice(0, 5); // Show first 5 users when no query

      return users
        .filter((user) => {
          const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
          return fullName.includes(query.toLowerCase());
        })
        .slice(0, 8); // Limit to 8 results
    });

    setFilteredUsers(newFilteredUsers);
  }, [searchQueries, users]);

  const handleSearchChange = (index: number, value: string) => {
    const newQueries = [...searchQueries];
    newQueries[index] = value;
    setSearchQueries(newQueries);

    // Clear selection if user is typing
    if (recipients[index]?.address) {
      const newRecipients = [...recipients];
      newRecipients[index] = {
        address: '',
        name: '',
        amount: newRecipients[index].amount,
      };
      onRecipientsChange(newRecipients);
    }
  };

  const handleUserSelect = (index: number, user: User) => {
    const newRecipients = [...recipients];
    const newQueries = [...searchQueries];
    const newShowSuggestions = [...showSuggestions];

    newRecipients[index] = {
      ...newRecipients[index],
      address: user.wallet_address,
      name: `${user.first_name} ${user.last_name}`,
    };
    newQueries[index] = `${user.first_name} ${user.last_name}`;
    newShowSuggestions[index] = false;

    onRecipientsChange(newRecipients);
    setSearchQueries(newQueries);
    setShowSuggestions(newShowSuggestions);
  };

  const handleFocus = (index: number) => {
    const newShowSuggestions = [...showSuggestions];
    newShowSuggestions[index] = true;
    setShowSuggestions(newShowSuggestions);
  };

  const handleBlur = (index: number) => {
    // Delay hiding suggestions to allow for click events
    setTimeout(() => {
      const newShowSuggestions = [...showSuggestions];
      newShowSuggestions[index] = false;
      setShowSuggestions(newShowSuggestions);
    }, 150);
  };

  const addRecipient = () => {
    const newRecipients = [
      ...recipients,
      { address: '', name: '', amount: '' },
    ];
    const newQueries = [...searchQueries, ''];
    const newShowSuggestions = [...showSuggestions, false];

    onRecipientsChange(newRecipients);
    setSearchQueries(newQueries);
    setShowSuggestions(newShowSuggestions);

    // Expand refs array
    inputRefs.current.push(null);
  };

  const removeRecipient = (index: number) => {
    if (recipients.length <= 1) return;

    const newRecipients = recipients.filter((_, i) => i !== index);
    const newQueries = searchQueries.filter((_, i) => i !== index);
    const newShowSuggestions = showSuggestions.filter((_, i) => i !== index);

    onRecipientsChange(newRecipients);
    setSearchQueries(newQueries);
    setShowSuggestions(newShowSuggestions);

    // Remove ref
    inputRefs.current.splice(index, 1);
  };

  const updateAmount = (index: number, amount: string) => {
    // Handle special cases for better UX
    let cleanedAmount = amount;

    // If user types ".00x" or similar, prepend "0" to make it "0.00x"
    if (cleanedAmount.startsWith('.') && cleanedAmount.length > 1) {
      cleanedAmount = '0' + cleanedAmount;
    }

    // Only allow valid number patterns or empty string
    // Allow: "", "0", "0.", "0.1", "0.12", ".5" (becomes "0.5"), "123", "123.45"
    if (
      cleanedAmount === '' ||
      /^(\d*\.?\d*)$/.test(cleanedAmount) || // Valid decimal pattern
      (Number.parseFloat(cleanedAmount) >= 0 &&
        !isNaN(Number.parseFloat(cleanedAmount)))
    ) {
      const newRecipients = [...recipients];
      newRecipients[index].amount = cleanedAmount;
      onRecipientsChange(newRecipients);
    }
    // If invalid input, don't update (keeps previous valid value)
  };

  return (
    <div className="space-y-4">
      {recipients.map((recipient, index) => (
        <div
          key={index}
          className="grid grid-cols-1 gap-4 p-4 border rounded-lg bg-gray-50"
        >
          {/* Recipient Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Recipient {index + 1}</Label>
              {distributionType === 'batch' && recipients.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeRecipient(index)}
                  style={{ color: '#8B3A3A' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#5C1F1F';
                    e.currentTarget.style.backgroundColor = '#F5E6E6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#8B3A3A';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  ref={(el) => (inputRefs.current[index] = el)}
                  placeholder={
                    loading ? 'Loading users...' : 'Search by name...'
                  }
                  value={searchQueries[index]}
                  onChange={(e) => handleSearchChange(index, e.target.value)}
                  onFocus={() => handleFocus(index)}
                  onBlur={() => handleBlur(index)}
                  className="pl-10"
                  disabled={loading}
                />
              </div>

              {/* User Selection Badge */}
              {recipient.address && recipient.name && (
                <div className="mt-2 flex items-center gap-2">
                  <div
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm"
                    style={{ backgroundColor: '#E8F1EE', color: '#1F453A' }}
                  >
                    <User className="h-4 w-4" />
                    <span className="font-medium">{recipient.name}</span>
                    <span
                      className="text-xs font-mono"
                      style={{ color: '#2F5D50' }}
                    >
                      {recipient.address.slice(0, 6)}...
                      {recipient.address.slice(-4)}
                    </span>
                  </div>
                </div>
              )}

              {/* Suggestions Dropdown */}
              {showSuggestions[index] &&
                filteredUsers[index] &&
                filteredUsers[index].length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {filteredUsers[index].map((user) => (
                      <button
                        key={user.wallet_address}
                        type="button"
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 last:border-b-0"
                        onMouseDown={() => handleUserSelect(index, user)}
                      >
                        <img
                          src={
                            user.profile_picture || '/observableinfinities.png'
                          }
                          alt=""
                          className="w-8 h-8 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = '/observableinfinities.png';
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">
                            {user.first_name} {user.last_name}
                          </div>
                          <div className="text-xs text-gray-500 font-mono truncate">
                            {user.wallet_address}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>

          {/* Amount Input (only for single and batch, not equal distribution) */}
          {distributionType !== 'equal' && (
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={recipient.amount}
                onChange={(e) => updateAmount(index, e.target.value)}
              />
            </div>
          )}
        </div>
      ))}

      {/* Add Recipient Button (only for batch distribution) */}
      {distributionType === 'batch' && (
        <Button
          type="button"
          variant="outline"
          onClick={addRecipient}
          className="w-full"
        >
          <User className="h-4 w-4 mr-2" />
          Add Recipient
        </Button>
      )}

      {loading && (
        <div className="text-center py-2">
          <p className="text-sm text-gray-500">Loading user profiles...</p>
        </div>
      )}
    </div>
  );
}
