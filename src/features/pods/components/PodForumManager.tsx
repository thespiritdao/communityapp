// Pod Forum Manager - Allows pods to create and manage their forum categories
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useAuthContext } from '@/features/identity';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EnhancedToggle } from '@/components/ui/enhanced-toggle';
import { Users, Plus, Settings, Trash2, MessageSquare } from 'lucide-react';

interface PodForumManagerProps {
  podId: string;
  podName: string;
  managementHatId: string;
  membershipHatId?: string;
  isManager: boolean;
}

interface ForumCategory {
  id: string;
  name: string;
  description: string | null;
  pod_id: string;
  is_active: boolean;
  access_level: 'managers' | 'members' | 'both';
  required_token: string | null;
  created_at: string;
}

export default function PodForumManager({
  podId,
  podName,
  managementHatId,
  membershipHatId,
  isManager,
}: PodForumManagerProps) {
  const { session } = useAuthContext();
  const { evmAddress } = useEvmAddress();
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [accessLevel, setAccessLevel] = useState<
    'managers' | 'members' | 'both'
  >('both');

  // Load existing forum categories for this pod
  useEffect(() => {
    loadPodForumCategories();
  }, [podId]);

  const loadPodForumCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('forum_categories')
        .select('*')
        .eq('pod_id', podId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading pod forum categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const createForumCategory = async () => {
    if (!newCategoryName.trim() || !isManager || !evmAddress) return;

    setCreating(true);
    try {
      // If managementHatId is not provided, fetch it from the pod
      let effectiveManagementHatId = managementHatId;
      if (!effectiveManagementHatId || effectiveManagementHatId.trim() === '') {
        console.log('Management HAT ID not provided, fetching from pod...');
        const { data: podData, error: podError } = await supabase
          .from('pods')
          .select('management_hat_id')
          .eq('id', podId)
          .single();

        if (podError || !podData?.management_hat_id) {
          console.error('Could not fetch management HAT ID:', podError);
          alert('Error: Unable to create forum category. Pod management HAT ID is missing.');
          setCreating(false);
          return;
        }
        effectiveManagementHatId = podData.management_hat_id;
      }

      // Determine which token to use based on access level
      let requiredToken = effectiveManagementHatId;
      if (accessLevel === 'members' && membershipHatId) {
        requiredToken = membershipHatId;
      } else if (accessLevel === 'both') {
        // For 'both', use management token as primary
        requiredToken = effectiveManagementHatId;
      }

      // Validate requiredToken is not empty
      if (!requiredToken || requiredToken.trim() === '') {
        console.error('Required token is empty');
        alert('Error: Unable to create forum category. HAT ID is missing.');
        setCreating(false);
        return;
      }

      console.log('Creating forum category with required_token:', requiredToken);

      const { data, error } = await supabase
        .from('forum_categories')
        .insert({
          name: newCategoryName,
          description: newCategoryDescription || null,
          pod_id: podId,
          required_token: requiredToken,
          access_level: accessLevel,
          is_active: true,
          created_by_address: evmAddress.toLowerCase(),
        })
        .select()
        .single();

      if (error) throw error;

      setCategories([data, ...categories]);
      setNewCategoryName('');
      setNewCategoryDescription('');
      setCreating(false);
    } catch (error) {
      console.error('Error creating forum category:', error);
    } finally {
      setCreating(false);
    }
  };

  const toggleCategoryStatus = async (
    categoryId: string,
    currentStatus: boolean,
  ) => {
    if (!isManager) return;

    try {
      const { error } = await supabase
        .from('forum_categories')
        .update({ is_active: !currentStatus })
        .eq('id', categoryId);

      if (error) throw error;

      setCategories(
        categories.map((cat) =>
          cat.id === categoryId ? { ...cat, is_active: !currentStatus } : cat,
        ),
      );
    } catch (error) {
      console.error('Error toggling category status:', error);
    }
  };

  const deleteForumCategory = async (categoryId: string) => {
    if (
      !isManager ||
      !confirm(
        'Are you sure you want to delete this forum category? This will also delete all threads and posts in this category. This action cannot be undone.',
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from('forum_categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;

      setCategories(categories.filter((cat) => cat.id !== categoryId));
    } catch (error) {
      console.error('Error deleting forum category:', error);
    }
  };

  const getAccessLevelLabel = (level: string) => {
    switch (level) {
      case 'managers':
        return 'Leaders';
      case 'members':
        return 'Members';
      case 'both':
        return 'All';
      default:
        return level;
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" style={{ color: '#6A5F7A' }} />
          <h4 className="text-lg font-medium">Forum Categories</h4>
        </div>
        {isManager && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreating(!creating)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        )}
      </div>

      {/* Create New Category Form */}
      {creating && isManager && (
        <Card
          className="p-4"
          style={{ backgroundColor: '#EDEAF0', borderColor: '#D1C7DD' }}
        >
          <div className="space-y-3">
            <div>
              <Label htmlFor="categoryName" className="text-sm font-medium">
                Category Name
              </Label>
              <Input
                id="categoryName"
                placeholder={`${podName} Discussion`}
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="categoryDescription" className="text-sm font-medium">
                Description (Optional)
              </Label>
              <Input
                id="categoryDescription"
                placeholder="What this category is about..."
                value={newCategoryDescription}
                onChange={(e) => setNewCategoryDescription(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="accessLevel" className="text-sm font-medium">
                Access Level
              </Label>
              <select
                id="accessLevel"
                className="w-full px-3 py-2 border border-gray-300 rounded-md mt-1 text-sm"
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value as any)}
              >
                <option value="both">All Members</option>
                <option value="managers">Leaders Only</option>
                {membershipHatId && <option value="members">Members Only</option>}
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={createForumCategory}
                disabled={!newCategoryName.trim()}
                size="sm"
              >
                Create Category
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreating(false);
                  setNewCategoryName('');
                  setNewCategoryDescription('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Forum Categories List */}
      <div className="space-y-2">
        {categories.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No forum categories created yet</p>
            {isManager && (
              <p className="text-xs mt-1">Click "Add" to create one</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((category) => (
              <Card
                key={category.id}
                className={`p-3 ${category.is_active ? 'bg-white' : 'opacity-60 bg-gray-50'} border`}
              >
                <div className="space-y-2">
                  {/* First row: Name and Access Level */}
                  <div className="flex items-center gap-2">
                    <h5 className="font-medium text-sm truncate">
                      {category.name}
                    </h5>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600 whitespace-nowrap">
                      {getAccessLevelLabel(category.access_level)}
                    </span>
                  </div>

                  {/* Description if exists */}
                  {category.description && (
                    <p className="text-xs text-gray-600">
                      {category.description}
                    </p>
                  )}

                  {/* Second row: Status, Toggle, and Delete */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {category.is_active ? 'Active' : 'Inactive'}
                    </p>

                    {isManager && (
                      <div className="flex items-center gap-2">
                        <EnhancedToggle
                          checked={category.is_active}
                          onCheckedChange={() =>
                            toggleCategoryStatus(category.id, category.is_active)
                          }
                          size="sm"
                          variant="button"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteForumCategory(category.id)}
                          className="h-6 w-6 p-0"
                          style={{ color: '#8B3A3A' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#5C1F1F';
                            e.currentTarget.style.backgroundColor = '#F5E6E6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#8B3A3A';
                            e.currentTarget.style.backgroundColor =
                              'transparent';
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      {isManager && categories.length > 0 && (
        <div
          className="p-3 border rounded-md"
          style={{ backgroundColor: '#EDEAF0', borderColor: '#D1C7DD' }}
        >
          <div className="flex gap-2">
            <Settings
              className="h-4 w-4 mt-0.5 flex-shrink-0"
              style={{ color: '#6A5F7A' }}
            />
            <div className="text-xs" style={{ color: '#4A3F5A' }}>
              <p className="font-medium">Tips:</p>
              <p>• Toggle categories on/off instead of deleting them</p>
              <p>• Create separate categories for different topics</p>
              <p>• Use access levels to create private discussion areas</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
