// Pod Knowledge Base Manager - Manage knowledge base content for your pod
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  BookOpen,
  Plus,
  Upload,
  Edit,
  Trash2,
  Eye,
  Video,
  Image as ImageIcon,
  Download,
} from 'lucide-react';
import type {
  KnowledgeCategory,
  KnowledgeItem,
} from '@/features/knowledge/types';

interface PodKnowledgeManagerProps {
  podId: string;
  podName: string;
  managementHatId?: string;
  membershipHatId?: string;
  isManager: boolean;
}

export default function PodKnowledgeManager({
  podId,
  podName,
  isManager,
}: PodKnowledgeManagerProps) {
  const { evmAddress: userAddress } = useEvmAddress();
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Category form state
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('📚');

  // Item form state
  const [itemTitle, setItemTitle] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemContentType, setItemContentType] = useState<'video' | 'document' | 'markdown'>('video');
  const [itemContentUrl, setItemContentUrl] = useState('');
  const [itemContentText, setItemContentText] = useState('');
  const [itemFile, setItemFile] = useState<File | null>(null);
  const [itemDuration, setItemDuration] = useState('');
  const [itemIsPublic, setItemIsPublic] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadKnowledgeBase();
  }, [podId]);

  const loadKnowledgeBase = async () => {
    try {
      setLoading(true);

      // Load categories for this pod
      const { data: catData, error: catError } = await supabase
        .from('knowledge_categories')
        .select('*')
        .eq('pod_id', podId)
        .order('sort_order', { ascending: true });

      if (catError) throw catError;
      setCategories(catData || []);

      // Load items for this pod
      const { data: itemData, error: itemError } = await supabase
        .from('knowledge_items')
        .select('*')
        .eq('pod_id', podId)
        .order('sort_order', { ascending: true });

      if (itemError) throw itemError;
      setItems(itemData || []);
    } catch (error) {
      console.error('Error loading knowledge base:', error);
    } finally {
      setLoading(false);
    }
  };

  const createCategory = async () => {
    if (!categoryName.trim() || !userAddress) return;

    try {
      const { error } = await supabase.from('knowledge_categories').insert({
        pod_id: podId,
        name: categoryName,
        description: categoryDescription || null,
        icon: categoryIcon,
        sort_order: categories.length,
        is_public: false, // Pod content is private by default
        created_by: userAddress.toLowerCase(),
      });

      if (error) throw error;

      // Reset form and reload
      setCategoryName('');
      setCategoryDescription('');
      setCategoryIcon('📚');
      setShowCreateCategory(false);
      loadKnowledgeBase();
    } catch (error) {
      console.error('Error creating category:', error);
      alert('Failed to create category. Please try again.');
    }
  };

  const uploadFile = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${podId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const bucket = itemContentType === 'video' ? 'knowledge-videos' : 'knowledge-documents';

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const uploadThumbnail = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${podId}/thumbnails/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('knowledge-documents')
      .upload(fileName, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('knowledge-documents')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleThumbnailSelect = (file: File | null) => {
    setThumbnailFile(file);
    if (thumbnailPreview) {
      URL.revokeObjectURL(thumbnailPreview);
    }
    if (file) {
      setThumbnailPreview(URL.createObjectURL(file));
    } else {
      setThumbnailPreview(null);
    }
  };

  const createItem = async () => {
    if (!itemTitle.trim() || !selectedCategory || !userAddress) {
      alert('Please fill in title and category');
      return;
    }

    // Validate content based on type
    if (itemContentType === 'markdown' && !itemContentText.trim()) {
      alert('Please enter markdown content');
      return;
    }
    if (itemContentType !== 'markdown' && !itemFile) {
      alert('Please select a file to upload');
      return;
    }

    try {
      setUploading(true);
      let contentUrl = null;
      let thumbnailUrl = null;

      // Upload file to Supabase if not markdown
      if (itemContentType !== 'markdown' && itemFile) {
        contentUrl = await uploadFile(itemFile);
      }

      // Upload thumbnail if provided
      if (thumbnailFile) {
        thumbnailUrl = await uploadThumbnail(thumbnailFile);
      }

      const duration = itemDuration ? parseInt(itemDuration) : null;

      const { error } = await supabase.from('knowledge_items').insert({
        category_id: selectedCategory,
        pod_id: podId,
        title: itemTitle,
        description: itemDescription || null,
        content_type: itemContentType,
        content_url: contentUrl,
        content_text: itemContentType === 'markdown' ? itemContentText : null,
        thumbnail_url: thumbnailUrl,
        duration_seconds: duration,
        is_public: itemIsPublic,
        view_count: 0,
        sort_order: items.length,
        created_by: userAddress.toLowerCase(),
      });

      if (error) throw error;

      // Reset form and reload
      setItemTitle('');
      setItemDescription('');
      setItemContentType('video');
      setItemContentUrl('');
      setItemContentText('');
      setItemFile(null);
      setItemDuration('');
      setItemIsPublic(false);
      handleThumbnailSelect(null);
      setShowCreateItem(false);
      loadKnowledgeBase();
    } catch (error) {
      console.error('Error creating item:', error);
      alert('Failed to create item. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure? This will also delete all items in this category.'))
      return;

    try {
      const { error } = await supabase
        .from('knowledge_categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;
      loadKnowledgeBase();
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Failed to delete category. Please try again.');
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const { error } = await supabase
        .from('knowledge_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      loadKnowledgeBase();
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item. Please try again.');
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`/api/pods/${podId}/knowledge/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `knowledge-export-${podName.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting knowledge base:', error);
      alert('Failed to export. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  if (!isManager) {
    return (
      <Card>
        <CardContent className="p-6 text-center" style={{ color: '#5F5A54' }}>
          <BookOpen className="mx-auto mb-3" size={48} style={{ color: '#2F5D50' }} />
          <p>Only pod managers can configure the knowledge base.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full">
      <Card className="w-full">
        <CardContent className="p-4 w-full">
          {/* Categories Section */}
          <div className="w-full mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Categories</h3>
              <div className="flex gap-2">
                {items.length > 0 && (
                  <Button
                    onClick={handleExport}
                    disabled={exporting}
                    size="sm"
                    variant="outline"
                    style={{ borderColor: '#2F5D50', color: '#2F5D50' }}
                  >
                    <Download size={16} className="mr-1" />
                    {exporting ? 'Exporting...' : 'Export All'}
                  </Button>
                )}
                <Button
                  onClick={() => setShowCreateCategory(!showCreateCategory)}
                  size="sm"
                  style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Create Category Form */}
            {showCreateCategory && (
              <Card className="p-3 mb-3 w-full" style={{ backgroundColor: '#F5F2ED' }}>
                <div className="space-y-3 w-full">
                  <div>
                    <Label htmlFor="category-icon">Icon (emoji)</Label>
                    <Input
                      id="category-icon"
                      value={categoryIcon}
                      onChange={(e) => setCategoryIcon(e.target.value)}
                      placeholder="📚"
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="category-name">Category Name *</Label>
                    <Input
                      id="category-name"
                      value={categoryName}
                      onChange={(e) => setCategoryName(e.target.value)}
                      placeholder="e.g., Getting Started"
                    />
                  </div>
                  <div>
                    <Label htmlFor="category-description">Description</Label>
                    <Textarea
                      id="category-description"
                      value={categoryDescription}
                      onChange={(e) => setCategoryDescription(e.target.value)}
                      placeholder="Brief description of this category"
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2 w-full">
                    <Button
                      onClick={createCategory}
                      style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
                      className="flex-1"
                    >
                      Create
                    </Button>
                    <Button
                      onClick={() => setShowCreateCategory(false)}
                      variant="outline"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Categories List */}
            <div className="space-y-2 w-full">
              {categories.length === 0 ? (
                <p className="text-sm" style={{ color: '#5F5A54' }}>
                  No categories yet. Create one to get started.
                </p>
              ) : (
                categories.map((category) => (
                  <Card
                    key={category.id}
                    className="p-3 w-full"
                    style={{ backgroundColor: '#E8F1EE' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span style={{ fontSize: '20px' }} className="flex-shrink-0">{category.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{category.name}</p>
                          {category.description && (
                            <p
                              className="text-sm line-clamp-2"
                              style={{ color: '#5F5A54' }}
                            >
                              {category.description}
                            </p>
                          )}
                          <p className="text-xs" style={{ color: '#8F8A84' }}>
                            {items.filter((i) => i.category_id === category.id).length}{' '}
                            items
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => deleteCategory(category.id)}
                        variant="ghost"
                        size="sm"
                        className="flex-shrink-0"
                        style={{ color: '#8B3A3A' }}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Content Items Section */}
          <div className="w-full">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Content</h3>
              <Button
                onClick={() => setShowCreateItem(!showCreateItem)}
                size="sm"
                style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
                disabled={categories.length === 0}
              >
                Add
              </Button>
            </div>

            {categories.length === 0 && (
              <p className="text-sm mb-3" style={{ color: '#5F5A54' }}>
                Create a category first before adding content.
              </p>
            )}

            {/* Create Item Form */}
            {showCreateItem && (
              <Card className="p-3 mb-3 w-full" style={{ backgroundColor: '#F5F2ED' }}>
                <div className="space-y-3 w-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="item-category">Category *</Label>
                      <select
                        id="item-category"
                        value={selectedCategory || ''}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full p-2 border rounded-md"
                        style={{ borderColor: '#E8E4DC' }}
                      >
                        <option value="">Select a category</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.icon} {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="item-content-type">Content Type *</Label>
                      <select
                        id="item-content-type"
                        value={itemContentType}
                        onChange={(e) => setItemContentType(e.target.value as 'video' | 'document' | 'markdown')}
                        className="w-full p-2 border rounded-md"
                        style={{ borderColor: '#E8E4DC' }}
                      >
                        <option value="video">Video (.mp4, .webm)</option>
                        <option value="document">Document (.pdf, .doc, .docx)</option>
                        <option value="markdown">Text / Markdown</option>
                      </select>
                    </div>
                  </div>
                  <div className="w-full">
                    <Label htmlFor="item-title">Title *</Label>
                    <Input
                      id="item-title"
                      value={itemTitle}
                      onChange={(e) => setItemTitle(e.target.value)}
                      placeholder="e.g., How to Create a Bounty"
                      className="w-full"
                    />
                  </div>
                  <div className="w-full">
                    <Label htmlFor="item-description">Description</Label>
                    <Textarea
                      id="item-description"
                      value={itemDescription}
                      onChange={(e) => setItemDescription(e.target.value)}
                      placeholder="Brief description of this content"
                      rows={2}
                      className="w-full"
                    />
                  </div>

                  {/* Thumbnail / Cover Image (optional) */}
                  <div className="w-full">
                    <Label htmlFor="item-thumbnail">
                      <span className="flex items-center gap-1">
                        <ImageIcon size={14} />
                        Cover Image (optional)
                      </span>
                    </Label>
                    <div className="mt-2 w-full">
                      <Input
                        id="item-thumbnail"
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleThumbnailSelect(e.target.files?.[0] || null)}
                        className="w-full"
                      />
                      {thumbnailPreview && (
                        <div className="mt-2 relative">
                          <img
                            src={thumbnailPreview}
                            alt="Thumbnail preview"
                            className="rounded-md border w-full max-h-40 object-cover"
                            style={{ borderColor: '#E8E4DC' }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute top-1 right-1"
                            style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff' }}
                            onClick={() => {
                              handleThumbnailSelect(null);
                              const input = document.getElementById('item-thumbnail') as HTMLInputElement;
                              if (input) input.value = '';
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs mt-1" style={{ color: '#8F8A84' }}>
                      Displayed as the cover image in the knowledge base grid. Recommended: 1280x720 (16:9).
                    </p>
                  </div>

                  {itemContentType === 'markdown' ? (
                    <div className="w-full">
                      <Label htmlFor="item-text">Content *</Label>
                      <Textarea
                        id="item-text"
                        value={itemContentText}
                        onChange={(e) => setItemContentText(e.target.value)}
                        placeholder="Enter your text or markdown content here..."
                        rows={8}
                        className="w-full"
                      />
                    </div>
                  ) : (
                    <div className="w-full">
                      <Label htmlFor="item-file">
                        Upload {itemContentType === 'video' ? 'Video' : 'Document'} *
                      </Label>
                      <div className="mt-2 w-full">
                        <Input
                          id="item-file"
                          type="file"
                          accept={itemContentType === 'video' ? 'video/*' : '.pdf,.doc,.docx'}
                          onChange={(e) => setItemFile(e.target.files?.[0] || null)}
                          className="w-full"
                        />
                        {itemFile && (
                          <p className="text-xs mt-1" style={{ color: '#2F5D50' }}>
                            Selected: {itemFile.name} ({(itemFile.size / 1024 / 1024).toFixed(2)} MB)
                          </p>
                        )}
                      </div>
                      <p className="text-xs mt-1" style={{ color: '#8F8A84' }}>
                        File will be uploaded to secure Supabase storage
                      </p>
                    </div>
                  )}

                  {itemContentType === 'video' && (
                    <div className="w-full">
                      <Label htmlFor="item-duration">Duration (seconds)</Label>
                      <Input
                        id="item-duration"
                        type="number"
                        value={itemDuration}
                        onChange={(e) => setItemDuration(e.target.value)}
                        placeholder="e.g., 180"
                        className="w-full"
                      />
                    </div>
                  )}
                  <div className="w-full">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id="item-public"
                        checked={itemIsPublic}
                        onChange={(e) => setItemIsPublic(e.target.checked)}
                        className="rounded mt-1"
                      />
                      <div className="flex-1">
                        <Label htmlFor="item-public" className="cursor-pointer">
                          Make this content public
                        </Label>
                        <p className="text-xs mt-1" style={{ color: '#8F8A84' }}>
                          Public content is visible to everyone. Uncheck to restrict to your community.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full">
                    <Button
                      onClick={createItem}
                      disabled={uploading}
                      style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
                      className="flex-1"
                    >
                      {uploading ? 'Uploading...' : 'Create'}
                    </Button>
                    <Button
                      onClick={() => setShowCreateItem(false)}
                      variant="outline"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Items List */}
            <div className="space-y-2 w-full">
              {items.length === 0 ? (
                <p className="text-sm" style={{ color: '#5F5A54' }}>
                  No content yet. Add videos or documents to your knowledge base.
                </p>
              ) : (
                items.map((item) => {
                  const category = categories.find((c) => c.id === item.category_id);
                  return (
                    <Card
                      key={item.id}
                      className="p-3 w-full"
                      style={{ backgroundColor: '#FFFFFF' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex gap-3 flex-1 min-w-0">
                          {item.thumbnail_url && (
                            <img
                              src={item.thumbnail_url}
                              alt=""
                              className="w-16 h-10 rounded object-cover flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{item.title}</p>
                            {item.description && (
                              <p
                                className="text-sm mt-1 line-clamp-2"
                                style={{ color: '#5F5A54' }}
                              >
                                {item.description}
                              </p>
                            )}
                            <div
                              className="flex flex-wrap gap-2 mt-2 text-xs"
                              style={{ color: '#8F8A84' }}
                            >
                              {category && (
                                <span className="inline-flex items-center gap-1 flex-shrink-0">
                                  {category.icon} <span className="truncate max-w-[100px]">{category.name}</span>
                                </span>
                              )}
                              {item.duration_seconds && (
                                <span className="flex-shrink-0">
                                  {Math.floor(item.duration_seconds / 60)}:
                                  {(item.duration_seconds % 60)
                                    .toString()
                                    .padStart(2, '0')}
                                </span>
                              )}
                              <span className="flex-shrink-0">
                                <Eye size={12} className="inline mr-1" />
                                {item.view_count} views
                              </span>
                              {item.is_public && (
                                <span className="text-green-600 font-medium flex-shrink-0">
                                  Public
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          onClick={() => deleteItem(item.id)}
                          variant="ghost"
                          size="sm"
                          className="flex-shrink-0"
                          style={{ color: '#8B3A3A' }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
