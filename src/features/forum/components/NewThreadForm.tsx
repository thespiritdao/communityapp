import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserWallet } from '@/hooks/useUserWallet';
import { useForum } from '@/features/forum/hooks/useForum';
import { useUnifiedForumAccess } from '@/features/forum/hooks/useUnifiedForumAccess';
import { supabase } from '@/utils/supabaseClient';
import UserTagging from '@/components/UserTagging';
import { MediaUpload } from './MediaUpload';
import { RichTextEditor } from './RichTextEditor';
import { createPoll } from '../services/PollService';
import {
  saveDraft,
  getDraft,
  deleteDraftByContext,
  AutoSaveManager,
} from '../services/DraftService';
import styles from '../styles/Forum.module.css';
import DatePicker from 'react-datepicker';
// CSS imported globally in globals.css

// Template and placeholder interfaces
export interface ThreadTemplate {
  id: string;
  name: string;
  titleTemplate: string;
  contentTemplate: string;
  placeholders: PlaceholderField[];
}

export interface PlaceholderField {
  id: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'richtext'
    | 'select'
    | 'date'
    | 'daterange'
    | 'radio'
    | 'number'
    | 'tags';
  helpText?: string;
  required?: boolean;
  options?: string[];
  group?: string;
  width?: 'full' | 'half';
  defaultValue?: string;
  validation?: string;
}

export type NewThreadFormProps = {
  categoryId: string;
  customTemplates?: ThreadTemplate[];
};

export function NewThreadForm({
  categoryId,
  customTemplates = [],
}: NewThreadFormProps) {
  const router = useRouter();
  const address = useUserWallet();
  const { submitThread, isLoading } = useForum();
  const { permissions } = useUnifiedForumAccess();

  // Log incoming prop categoryId for debugging
  useEffect(() => {
    console.log('Incoming prop categoryId:', categoryId);
  }, [categoryId]);

  // Local state initialization
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTemplate, setSelectedTemplate] =
    useState<ThreadTemplate | null>(null);
  const [placeholderValues, setPlaceholderValues] = useState<
    Record<string, string>
  >({});
  const [templateContent, setTemplateContent] = useState('');

  // New feature states
  const [showPollForm, setShowPollForm] = useState(false);
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);
  const [uploadedAttachments, setUploadedAttachments] = useState<any[]>([]);

  // Poll data collected during thread creation
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [pollExpiresInDays, setPollExpiresInDays] = useState<string>('7');

  // Initialize local state with the incoming prop
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    categoryId || null,
  );

  // Log selectedCategoryId for debugging
  useEffect(() => {
    console.log('Initial selectedCategoryId:', selectedCategoryId);
  }, [selectedCategoryId]);

  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [error, setError] = useState('');
  const [supabaseTemplates, setSupabaseTemplates] = useState<ThreadTemplate[]>(
    [],
  );

  // Use accessible categories from unified forum access
  useEffect(() => {
    if (permissions?.accessibleCategoryObjects) {
      const accessibleCategories = permissions.accessibleCategoryObjects.map(
        (cat) => ({
          id: cat.id,
          name: cat.name,
        }),
      );

      console.log(
        'Accessible categories from permissions:',
        accessibleCategories,
      );
      setCategories(accessibleCategories);

      // If no category is currently selected, set the default
      if (!selectedCategoryId && accessibleCategories.length > 0) {
        setSelectedCategoryId(accessibleCategories[0].id);
        console.log(
          'Default selectedCategoryId set to:',
          accessibleCategories[0].id,
        );
      }
    }
  }, [permissions, selectedCategoryId]);

  // Fetch templates from Supabase
  useEffect(() => {
    async function fetchTemplates() {
      const { data, error } = await supabase
        .from('forum_templates')
        .select('id, name, title_template, content_template, placeholders');
      if (error) {
        console.error('Error fetching templates:', error);
        return;
      }
      // Map snake_case fields to camelCase to match our interface
      setSupabaseTemplates(
        data.map((template: any) => ({
          id: template.id,
          name: template.name,
          titleTemplate: template.title_template,
          contentTemplate: template.content_template,
          placeholders: template.placeholders,
        })),
      );
    }
    fetchTemplates();
  }, []);

  // Combine fetched templates with any custom templates passed in as props
  const templates = useMemo(
    () => [...supabaseTemplates, ...customTemplates],
    [supabaseTemplates, customTemplates],
  );

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId) || null;
    setSelectedTemplate(template);

    if (template) {
      const initialPlaceholders: Record<string, string> = {};
      template.placeholders.forEach((placeholder) => {
        initialPlaceholders[placeholder.id] = placeholder.defaultValue || '';
      });
      setPlaceholderValues(initialPlaceholders);
      setTemplateContent('');
    }
  };

  const handlePlaceholderChange = (placeholder: string, value: string) => {
    setPlaceholderValues((prev) => ({ ...prev, [placeholder]: value }));
  };

  const generateTitle = () => {
    if (!selectedTemplate) return title;
    return selectedTemplate.titleTemplate.replace(
      /\{(.*?)\}/g,
      (_, key) => placeholderValues[key] || `{${key}}`,
    );
  };

  const generateContent = () => {
    if (!selectedTemplate) return content;
    let result = selectedTemplate.contentTemplate;
    selectedTemplate.placeholders.forEach((placeholder) => {
      if (placeholder.type === 'textarea' && placeholder.id === 'content') {
        result = result.replace(
          new RegExp(`\\{${placeholder.id}\\}`, 'g'),
          templateContent,
        );
      } else {
        result = result.replace(
          new RegExp(`\\{${placeholder.id}\\}`, 'g'),
          placeholderValues[placeholder.id] || `{${placeholder.id}}`,
        );
      }
    });
    return result;
  };

  // Load draft on mount
  useEffect(() => {
    if (!address || !selectedCategoryId) return;

    const loadDraft = async () => {
      const result = await getDraft(address, selectedCategoryId);
      if (result.draft) {
        console.log('[NewThreadForm] Loading draft:', result.draft);
        setTitle(result.draft.title || '');
        setContent(result.draft.content);
      }
    };

    loadDraft();
  }, [address, selectedCategoryId]);

  // Function to clear draft
  const handleClearDraft = async () => {
    if (!address || !selectedCategoryId) return;
    await deleteDraftByContext(address, selectedCategoryId);
    setTitle('');
    setContent('');
    console.log('[NewThreadForm] Draft cleared');
  };

  // Setup autosave
  useEffect(() => {
    if (!address || !selectedCategoryId) return;

    const autoSave = new AutoSaveManager(
      async () => {
        const finalTitle = selectedTemplate ? generateTitle() : title;
        const finalContent = selectedTemplate ? generateContent() : content;
        await saveDraft(
          address,
          finalContent,
          selectedCategoryId,
          undefined,
          finalTitle,
        );
      },
      2000,
      30000,
    );

    return () => autoSave.destroy();
  }, [address, content, title, selectedCategoryId, selectedTemplate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Check if selectedCategoryId is non-empty
    if (!selectedCategoryId) {
      setError('Please select a forum category.');
      console.error('No category selected!');
      return;
    }

    console.log('Submitting thread with categoryId:', selectedCategoryId);

    // Process final title and content using either the selected template or manual inputs
    const finalTitle = selectedTemplate ? generateTitle() : title;
    const finalContent = selectedTemplate ? generateContent() : content;

    // Call the submitThread function and handle the response
    console.log('Calling submitThread with:', {
      categoryId: selectedCategoryId,
      title: finalTitle,
      contentLength: finalContent.length,
      hasAttachments: uploadedAttachments.length > 0,
      hasPoll: showPollForm,
    });

    const result = await submitThread(
      selectedCategoryId,
      finalTitle,
      finalContent,
      'governance',
    );

    console.log('submitThread result:', result);

    if (result.success && result.thread) {
      const threadId = result.thread.id;

      // Link uploaded attachments to the thread
      if (uploadedAttachments.length > 0) {
        try {
          // Update attachments to link them to the created thread
          const attachmentIds = uploadedAttachments.map((att) => att.id);
          console.log('[NewThreadForm] Linking attachments to thread:', {
            threadId,
            attachmentIds,
            attachmentCount: attachmentIds.length,
          });

          const { error: attachmentError } = await supabase
            .from('forum_media_attachments')
            .update({ thread_id: threadId, post_id: null })
            .in('id', attachmentIds);

          if (attachmentError) {
            console.error(
              'Error linking attachments to thread:',
              attachmentError,
            );
            // Don't fail the whole operation, just log the error
          } else {
            console.log(
              `✅ Successfully linked ${attachmentIds.length} attachments to thread ${threadId}`,
            );
          }
        } catch (err) {
          console.error('Error updating attachments:', err);
        }
      } else {
        console.log('[NewThreadForm] No attachments to link');
      }

      // Delete draft after successful submission
      if (address) {
        await deleteDraftByContext(address, selectedCategoryId);
      }

      // Create poll if requested
      if (showPollForm && pollQuestion.trim()) {
        console.log('[NewThreadForm] Creating poll for thread:', threadId);
        try {
          const validPollOptions = pollOptions.filter((opt) => opt.trim());
          if (validPollOptions.length >= 2) {
            // createPoll expects number of days, not ISO string
            const expiresInDays = pollExpiresInDays
              ? parseInt(pollExpiresInDays)
              : undefined;

            const pollResult = await createPoll(
              threadId,
              pollQuestion,
              validPollOptions,
              address!,
              pollAllowMultiple,
              expiresInDays,
            );

            if (pollResult.success) {
              console.log('✅ Poll created successfully:', pollResult.pollId);
            } else {
              console.error('❌ Failed to create poll:', pollResult.error);
            }
          } else {
            console.warn('⚠️ Not enough poll options (need at least 2)');
          }
        } catch (pollError) {
          console.error('❌ Error creating poll:', pollError);
          // Don't block thread redirect if poll creation fails
        }
      }

      // Redirect to the newly created thread
      console.log(
        'Thread created successfully, redirecting to:',
        `/forum/thread/${threadId}`,
      );
      router.push(`/forum/thread/${threadId}`);
    } else {
      setError('Failed to create the thread.');
    }
  };

  return (
    <div
      className={styles.replyFormContainer}
      style={{ paddingBottom: '96px' }}
    >
      <h2 className={styles.replyFormTitle}>Create New Thread</h2>

      {/* Select Forum Dropdown */}
      <div className={styles.field} style={{ marginBottom: '15px' }}>
        <label className={styles.label} style={{ marginRight: '8px' }}>
          Select Forum:
        </label>
        <select
          value={selectedCategoryId || ''}
          onChange={(e) => {
            console.log('User selected categoryId:', e.target.value);
            setSelectedCategoryId(e.target.value);
          }}
          className={styles.select}
          disabled={isLoading}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* Space before Template Selection */}
      <div style={{ marginBottom: '20px' }}></div>

      {/* Thread Form */}
      <form className={styles.replyForm} onSubmit={handleSubmit}>
        <div className={styles.templateSelector}>
          <label className={styles.selectLabel}>Choose a Template:</label>
          <select
            onChange={(e) => handleTemplateChange(e.target.value)}
            className={styles.templateSelect}
            disabled={isLoading}
          >
            <option value="">-- Select Template --</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>

        {selectedTemplate ? (
          <>
            {selectedTemplate.placeholders.map((placeholder) => {
              if (placeholder.type === 'date') {
                return (
                  <div key={placeholder.id} className={styles.placeholderField}>
                    <label>{placeholder.label}</label>
                    <DatePicker
                      selected={
                        placeholderValues[placeholder.id]
                          ? new Date(placeholderValues[placeholder.id])
                          : null
                      }
                      onChange={(date: Date | null) => {
                        handlePlaceholderChange(
                          placeholder.id,
                          date ? date.toISOString() : '',
                        );
                      }}
                      className={styles.placeholderInput}
                      dateFormat="MM/dd/yyyy"
                    />
                  </div>
                );
              }
              if (placeholder.type === 'daterange') {
                const dateRange = placeholderValues[placeholder.id]
                  ? JSON.parse(placeholderValues[placeholder.id])
                  : [null, null];
                const startDate = dateRange[0] ? new Date(dateRange[0]) : null;
                const endDate = dateRange[1] ? new Date(dateRange[1]) : null;

                return (
                  <div key={placeholder.id} className={styles.placeholderField}>
                    <label>{placeholder.label}</label>
                    <DatePicker
                      selected={startDate}
                      onChange={(dates: [Date | null, Date | null]) => {
                        const [start, end] = dates;
                        handlePlaceholderChange(
                          placeholder.id,
                          JSON.stringify([
                            start ? start.toISOString() : null,
                            end ? end.toISOString() : null,
                          ]),
                        );
                      }}
                      startDate={startDate}
                      endDate={endDate}
                      selectsRange={true}
                      className={styles.placeholderInput}
                      dateFormat="MM/dd/yyyy"
                    />
                  </div>
                );
              }
              if (placeholder.type === 'select') {
                return (
                  <div key={placeholder.id} className={styles.placeholderField}>
                    <label>{placeholder.label}</label>
                    <select
                      value={placeholderValues[placeholder.id] || ''}
                      onChange={(e) =>
                        handlePlaceholderChange(placeholder.id, e.target.value)
                      }
                      className={styles.placeholderInput}
                    >
                      <option value="">-- Select --</option>
                      {placeholder.options?.map((option, index) => (
                        <option key={index} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }
              if (placeholder.type === 'richtext') {
                return (
                  <div key={placeholder.id} className={styles.placeholderField}>
                    <label>{placeholder.label}</label>
                    <RichTextEditor
                      value={placeholderValues[placeholder.id] || ''}
                      onChange={(val) =>
                        handlePlaceholderChange(placeholder.id, val)
                      }
                      placeholder={placeholder.helpText || ''}
                      minHeight="200px"
                    />
                  </div>
                );
              }
              if (
                placeholder.type === 'textarea' ||
                placeholder.type === 'text'
              ) {
                return (
                  <div key={placeholder.id} className={styles.placeholderField}>
                    <label>{placeholder.label}</label>
                    <UserTagging
                      value={placeholderValues[placeholder.id] || ''}
                      onChange={(val) =>
                        handlePlaceholderChange(placeholder.id, val)
                      }
                      placeholder={placeholder.helpText || ''}
                      className={
                        placeholder.type === 'text'
                          ? styles.threadTitleInput
                          : styles.replyTextarea
                      }
                      multiLine={placeholder.type === 'textarea'}
                      contextType="forum"
                      contextId={selectedCategoryId || 'new-thread'}
                      contextUrl={
                        selectedCategoryId
                          ? `/forum/category/${selectedCategoryId}`
                          : undefined
                      }
                    />
                  </div>
                );
              }
              // Default for number, radio, etc.
              return (
                <div key={placeholder.id} className={styles.placeholderField}>
                  <label>{placeholder.label}</label>
                  <input
                    type={placeholder.type === 'number' ? 'number' : 'text'}
                    value={placeholderValues[placeholder.id] || ''}
                    placeholder={placeholder.helpText}
                    onChange={(e) =>
                      handlePlaceholderChange(placeholder.id, e.target.value)
                    }
                    className={styles.placeholderInput}
                  />
                </div>
              );
            })}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <input
                type="text"
                placeholder="Thread title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={styles.threadTitleInput}
                style={{ flex: 1, marginBottom: 0 }}
              />
              {(title || content) && (
                <button
                  type="button"
                  onClick={handleClearDraft}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#8B3A3A',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Clear draft and start fresh"
                >
                  Clear
                </button>
              )}
            </div>
            <RichTextEditor
              value={content}
              onChange={(value) => setContent(value)}
              placeholder="Write your thread content here... Use the toolbar for formatting."
              minHeight="250px"
            />
          </>
        )}

        {/* Poll Toggle - Mobile-optimized button (not checkbox) */}
        <div style={{ marginTop: '20px', marginBottom: '15px' }}>
          <button
            type="button"
            onPointerDown={(e) => {
              // Use pointer events - works on both mouse and touch
              e.preventDefault();
              e.stopPropagation();
              console.log('[Poll Toggle] Button clicked, current state:', showPollForm);
              setShowPollForm(!showPollForm);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              padding: '14px 16px',
              borderRadius: '12px',
              backgroundColor: showPollForm ? '#E8F1EE' : '#FFFFFF',
              border: `2px solid ${showPollForm ? '#2F5D50' : '#D8D2C8'}`,
              transition: 'all 0.2s ease',
              userSelect: 'none',
              WebkitTapHighlightColor: 'transparent',
              minHeight: '56px',
              width: '100%',
              textAlign: 'left',
              fontSize: '1rem',
              fontWeight: 500,
              color: '#1F2D2A',
              touchAction: 'manipulation',
              MozUserSelect: 'none',
              WebkitUserSelect: 'none',
              msUserSelect: 'none',
            }}
          >
            {/* Custom checkbox visual */}
            <div
              style={{
                width: '24px',
                height: '24px',
                minWidth: '24px',
                minHeight: '24px',
                borderRadius: '6px',
                border: `2px solid ${showPollForm ? '#2F5D50' : '#8FAAA1'}`,
                backgroundColor: showPollForm ? '#2F5D50' : '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.2s ease',
              }}
            >
              {showPollForm && (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M13.5 4L6 11.5L2.5 8"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <span>📊 Add a poll to this thread</span>
          </button>
        </div>

        {/* Inline Poll Creation - shown when checkbox is checked */}
        {showPollForm && (
          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '1.1rem', fontWeight: 600 }}>Poll Details</h3>

            {/* Poll Question */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                Poll Question <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="What would you like to ask?"
                className={styles.input}
                style={{ width: '100%' }}
              />
            </div>

            {/* Poll Options */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                Options <span style={{ color: 'red' }}>*</span>
              </label>
              {pollOptions.map((option, index) => (
                <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...pollOptions];
                      newOptions[index] = e.target.value;
                      setPollOptions(newOptions);
                    }}
                    placeholder={`Option ${index + 1}`}
                    className={styles.input}
                    style={{ flex: 1 }}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPollOptions(pollOptions.filter((_, i) => i !== index));
                      }}
                      style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 10 && (
                <button
                  type="button"
                  onClick={() => setPollOptions([...pollOptions, ''])}
                  style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '4px' }}
                >
                  + Add Option
                </button>
              )}
            </div>

            {/* Poll Settings */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={pollAllowMultiple}
                  onChange={(e) => setPollAllowMultiple(e.target.checked)}
                />
                <span style={{ fontSize: '0.95rem' }}>Allow multiple selections</span>
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '0.95rem' }}>Expires in:</label>
                <select
                  value={pollExpiresInDays}
                  onChange={(e) => setPollExpiresInDays(e.target.value)}
                  className={styles.select}
                  style={{ padding: '4px 8px' }}
                >
                  <option value="1">1 day</option>
                  <option value="3">3 days</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                  <option value="">Never</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Media Upload */}
        {!createdThreadId && (
          <div style={{ marginBottom: '20px' }}>
            <MediaUpload
              threadId={undefined}
              onUploadComplete={(attachments) => {
                setUploadedAttachments([
                  ...uploadedAttachments,
                  ...attachments,
                ]);
              }}
              maxFiles={5}
            />
          </div>
        )}

        {error && <div className={styles.submitError}>{error}</div>}
        <button
          type="submit"
          className={styles.submitButton}
          disabled={isLoading}
        >
          {isLoading ? 'Creating...' : 'Create Thread'}
        </button>
      </form>
    </div>
  );
}
