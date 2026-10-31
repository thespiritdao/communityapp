// src/app/knowledge/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { useTour } from '@/context/TourContext';
import { KnowledgeGrid } from '@/features/knowledge/components/KnowledgeGrid';
import { KnowledgeSearch } from '@/features/knowledge/components/KnowledgeSearch';
import { supabase } from '@/utils/supabaseClient';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { courseDisplayName, loadCourseProgress } from '@/features/knowledge/lib/courseProgress';
import type { CourseProgress, KnowledgeCategory, KnowledgeItem } from '@/features/knowledge/types';

interface Pod {
  id: string;
  name: string;
}

export default function KnowledgePage() {
  const address = useUserWallet();
  const { startTour } = useTour();
  const { userRoles, isLoading: hatLoading } = useHatPermissions();
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedPod, setSelectedPod] = useState<string | null>(null); // null = global
  const [courseProgress, setCourseProgress] = useState<Map<string, CourseProgress>>(new Map());

  useEffect(() => {
    loadPods();
  }, []);

  // Course progress for the signed-in member (courses are pod categories).
  useEffect(() => {
    let cancelled = false;
    if (!categories.some((c) => c.is_course)) {
      setCourseProgress(new Map());
      return;
    }
    loadCourseProgress(categories, items, address).then((m) => {
      if (!cancelled) setCourseProgress(m);
    });
    return () => {
      cancelled = true;
    };
  }, [categories, items, address]);

  useEffect(() => {
    // Global KB needs no permissions — load immediately.
    // Pod-specific KB must wait for hat permissions to resolve.
    if (!selectedPod || !hatLoading) {
      loadKnowledgeBase();
    }
  }, [selectedPod, hatLoading, userRoles]);

  const loadPods = async () => {
    try {
      const { data, error } = await supabase
        .from('pods')
        .select('id, name')
        .order('name');
      if (error) throw error;
      setPods(data || []);
    } catch (error) {
      console.error('Error loading pods:', error);
    }
  };

  const checkKnowledgeBaseAccess = (podId: string): boolean => {
    console.log('🔍 KB Access Check:', {
      podId,
      address,
      hasUserRoles: !!userRoles,
      userRolesCount: userRoles?.length || 0,
      allRoles: userRoles
    });

    if (!address || !userRoles) {
      console.log('❌ No address or userRoles');
      return false;
    }

    // Find a role for this pod that has knowledgeBaseAccess permission
    const podRole = userRoles.find(
      (role) => role.podId === podId && role.permissions?.knowledgeBaseAccess === true
    );

    console.log('🎩 Found Role:', podRole);

    if (!podRole) {
      console.log('❌ No role with knowledgeBaseAccess for this pod');
      return false;
    }

    console.log('✅ KB Access Granted! Role:', podRole.name, 'Permissions:', podRole.permissions);

    return true;
  };

  const loadKnowledgeBase = async () => {
    try {
      setLoading(true);
      console.log('📚 Loading Knowledge Base:', { selectedPod, address, hatLoading });

      if (selectedPod) {
        console.log('🏘️ Loading pod-specific content for:', selectedPod);

        // Pod-specific content - check permissions
        if (!address) {
          console.log('❌ No wallet address - clearing data');
          setCategories([]);
          setItems([]);
          setLoading(false);
          return;
        }

        const hasAccess = checkKnowledgeBaseAccess(selectedPod);
        if (!hasAccess) {
          console.log('🚫 Access denied - no permission');
          setCategories([]);
          setItems([]);
          setLoading(false);
          return;
        }

        console.log('✅ Access granted - fetching data');

        const { data: categoriesData, error: categoriesError } = await supabase
          .from('knowledge_categories')
          .select('*')
          .eq('pod_id', selectedPod)
          .order('sort_order', { ascending: true });

        if (categoriesError) {
          console.error('❌ Categories error:', categoriesError);
          throw categoriesError;
        }

        console.log('📁 Categories loaded:', categoriesData?.length || 0, categoriesData);

        const { data: itemsData, error: itemsError } = await supabase
          .from('knowledge_items')
          .select('*')
          .eq('pod_id', selectedPod)
          .order('sort_order', { ascending: true });

        if (itemsError) {
          console.error('❌ Items error:', itemsError);
          throw itemsError;
        }

        console.log('📄 Items loaded:', itemsData?.length || 0, itemsData);

        setCategories(categoriesData || []);
        setItems(itemsData || []);
      } else {
        // Global content - public only
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('knowledge_categories')
          .select('*')
          .is('pod_id', null)
          .eq('is_public', true)
          .order('sort_order', { ascending: true });

        if (categoriesError) throw categoriesError;

        const { data: itemsData, error: itemsError } = await supabase
          .from('knowledge_items')
          .select('*')
          .is('pod_id', null)
          .eq('is_public', true)
          .order('sort_order', { ascending: true});

        if (itemsError) throw itemsError;

        setCategories(categoriesData || []);
        setItems(itemsData || []);
      }
    } catch (error) {
      console.error('Error loading knowledge base:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      !selectedCategory || item.category_id === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{
        backgroundColor: '#F5F4ED',
        backgroundImage: 'url(/images/chatbg.png)'
      }}>
        <p style={{ color: '#5F5A54' }}>Loading knowledge base...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F5F4ED',
        backgroundImage: 'url(/images/chatbg.png)',
      }}
    >
      {/* Header */}
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '24px 16px 0',
          marginBottom: '32px',
        }}
      >
        <h1
          style={{
            fontSize: '32px',
            fontWeight: '600',
            color: '#2F5D50',
            marginBottom: '8px',
            letterSpacing: '-0.01em',
          }}
        >
          Knowledge Base
        </h1>
        <p
          style={{
            fontSize: '16px',
            color: '#5F5A54',
            marginBottom: '24px',
          }}
        >
          Learn how to use SpiritDAO with our tutorials, guides, and resources
        </p>

        {/* Search */}
        <KnowledgeSearch
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Pod Selector */}
        <div style={{ marginTop: '16px' }}>
          <select
            value={selectedPod || ''}
            onChange={(e) => setSelectedPod(e.target.value || null)}
            style={{
              width: '100%',
              maxWidth: '300px',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid #E8E4DC',
              backgroundColor: '#FFFFFF',
              fontSize: '15px',
              color: '#2F2F2F',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">Global Knowledge Base</option>
            {pods.map((pod) => (
              <option key={pod.id} value={pod.id}>
                {pod.name}
              </option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            marginTop: '16px',
          }}
        >
          <button
            onClick={() => setSelectedCategory(null)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #E8E4DC',
              backgroundColor: !selectedCategory ? '#2F5D50' : '#FFFFFF',
              color: !selectedCategory ? '#FFFFFF' : '#5F5A54',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #E8E4DC',
                backgroundColor:
                  selectedCategory === category.id ? '#2F5D50' : '#FFFFFF',
                color:
                  selectedCategory === category.id ? '#FFFFFF' : '#5F5A54',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {category.icon && `${category.icon} `}
              {category.name}
              {category.is_course && (() => {
                const p = courseProgress.get(category.id);
                if (!p) return ' · course';
                return p.done ? ' · ✓' : ` · ${p.completed}/${p.total}`;
              })()}
            </button>
          ))}
        </div>

        {/* Course banner */}
        {(() => {
          const course = selectedCategory ? categories.find((c) => c.id === selectedCategory) : null;
          if (!course?.is_course) return null;
          const p = courseProgress.get(course.id);
          const pct = p && p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
          return (
            <div
              style={{
                marginTop: '16px',
                padding: '14px 16px',
                borderRadius: '12px',
                border: '1px solid rgba(47, 93, 80, 0.3)',
                backgroundColor: '#FFFFFF',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  {course.accreditation_image_url && (
                    <img
                      src={course.accreditation_image_url}
                      alt=""
                      style={{ width: 40, height: 40, borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
                    />
                  )}
                  <p style={{ fontSize: '15px', fontWeight: 600, color: '#2F5D50' }}>
                    Course · accreditation: {courseDisplayName(course)}
                  </p>
                </div>
                <span style={{ fontSize: '12px', color: '#5F5A54', whiteSpace: 'nowrap' }}>
                  {!address
                    ? 'Sign in to track progress'
                    : p?.done
                      ? 'Accredited ✓'
                      : `${p?.completed ?? 0} of ${p?.total ?? 0} complete`}
                </span>
              </div>
              {course.accreditation_description && (
                <p style={{ fontSize: '13px', color: '#5F5A54', marginTop: '4px' }}>{course.accreditation_description}</p>
              )}
              <div
                aria-hidden="true"
                style={{ height: '4px', background: 'rgba(47, 93, 80, 0.12)', borderRadius: '2px', marginTop: '10px', overflow: 'hidden' }}
              >
                <div style={{ height: '100%', width: `${p?.done ? 100 : pct}%`, background: '#2F5D50', transition: 'width 0.3s ease' }} />
              </div>
              <p style={{ fontSize: '12px', color: '#5F5A54', marginTop: '8px' }}>
                Complete every item in this category to earn the accreditation. It appears on your Identity page and can
                unlock bounties and roles.
              </p>
            </div>
          );
        })()}
      </div>

      {/* Knowledge Grid */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px 24px' }}>
        {/* Pinned tour card */}
        <button
          onClick={startTour}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            width: '100%',
            marginBottom: '20px',
            padding: '16px 20px',
            borderRadius: '14px',
            border: '1.5px dashed #8FAAA1',
            backgroundColor: 'rgba(47, 93, 80, 0.04)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '28px', lineHeight: 1 }}>🧭</span>
          <div>
            <p style={{ fontSize: '15px', fontWeight: '600', color: '#2F5D50', marginBottom: '2px' }}>
              Take a guided tour
            </p>
            <p style={{ fontSize: '13px', color: '#8FAAA1' }}>
              New to SpiritDAO? Walk through every section in ~2 minutes.
            </p>
          </div>
          <span style={{ marginLeft: 'auto', color: '#8FAAA1', fontSize: '18px' }}>→</span>
        </button>
        {filteredItems.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 16px',
              color: '#8F8A84',
            }}
          >
            {searchQuery || selectedCategory
              ? 'No items found matching your criteria.'
              : 'No knowledge base items available yet.'}
          </div>
        ) : (
          <KnowledgeGrid
            items={filteredItems}
            categories={categories}
            onItemClick={(item) => {
              // Navigate to content viewer
              window.location.href = `/knowledge/${item.id}`;
            }}
          />
        )}
      </div>
    </div>
  );
}
