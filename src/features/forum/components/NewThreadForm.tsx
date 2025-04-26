import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForum } from 'src/features/forum/hooks/useForum';
import { useTokenGate } from 'src/features/forum/hooks/useTokenGate';
import { supabase } from 'src/utils/supabaseClient';
import styles from '../styles/Forum.module.css';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

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
  type: 'text' | 'textarea' | 'select' | 'date' | 'daterange' | 'radio' | 'number' | 'tags';
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

export function NewThreadForm({ categoryId, customTemplates = [] }: NewThreadFormProps) {
  const router = useRouter();
  const { submitThread, isLoading } = useForum();
  const { tokenBalances } = useTokenGate();

  // Log incoming prop categoryId for debugging
  useEffect(() => {
    console.log("Incoming prop categoryId:", categoryId);
  }, [categoryId]);

  // Local state initialization
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ThreadTemplate | null>(null);
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});
  
  // Initialize local state with the incoming prop
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(categoryId || null);
  
  // Log selectedCategoryId for debugging
  useEffect(() => {
    console.log("Initial selectedCategoryId:", selectedCategoryId);
  }, [selectedCategoryId]);
  
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [supabaseTemplates, setSupabaseTemplates] = useState<ThreadTemplate[]>([]);

  // Fetch forum categories from Supabase
  useEffect(() => {
    async function fetchCategories() {
      const { data, error } = await supabase
        .from('forum_categories')
        .select('id, name, required_token');

      if (error) {
        console.error('Error fetching categories:', error);
        return;
      }

      const filteredCategories = data.filter((category) => {
        const requiredToken = category.required_token?.toLowerCase();
        return (
          !requiredToken ||
          (requiredToken === process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY?.toLowerCase() && tokenBalances?.hasProofOfCuriosity) ||
          (requiredToken === process.env.NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID?.toLowerCase() && tokenBalances?.hasExecutivePod) ||
          (requiredToken === process.env.NEXT_PUBLIC_DEV_POD_HAT_ID?.toLowerCase() && tokenBalances?.hasDevPod)
        );
      });

      console.log("Fetched categories:", filteredCategories);
      setCategories(filteredCategories);

      // If no category is currently selected, set the default
      if (!selectedCategoryId && filteredCategories.length > 0) {
        setSelectedCategoryId(filteredCategories[0].id);
        console.log("Default selectedCategoryId set to:", filteredCategories[0].id);
      }
    }
    fetchCategories();
  }, [tokenBalances, selectedCategoryId]);

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
        }))
      );
    }
    fetchTemplates();
  }, []);

  // Combine fetched templates with any custom templates passed in as props
  const templates = useMemo(() => [...supabaseTemplates, ...customTemplates], [supabaseTemplates, customTemplates]);

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId) || null;
    setSelectedTemplate(template);

    if (template) {
      const initialPlaceholders: Record<string, string> = {};
      template.placeholders.forEach((placeholder) => {
        initialPlaceholders[placeholder.id] = placeholder.defaultValue || '';
      });
      setPlaceholderValues(initialPlaceholders);
    }
  };

  const handlePlaceholderChange = (placeholder: string, value: string) => {
    setPlaceholderValues((prev) => ({ ...prev, [placeholder]: value }));
  };

  const generateTitle = () => {
    if (!selectedTemplate) return title;
    return selectedTemplate.titleTemplate.replace(/\{(.*?)\}/g, (_, key) => placeholderValues[key] || `{${key}}`);
  };

  const generateContent = () => {
    if (!selectedTemplate) return content;
    return selectedTemplate.contentTemplate.replace(/\{(.*?)\}/g, (_, key) => placeholderValues[key] || `{${key}}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Check if selectedCategoryId is non-empty
    if (!selectedCategoryId) {
      setError('Please select a forum category.');
      console.error("No category selected!");
      return;
    }

    console.log("Submitting thread with categoryId:", selectedCategoryId);

    // Process final title and content using either the selected template or manual inputs
    const finalTitle = selectedTemplate ? generateTitle() : title;
    const finalContent = selectedTemplate ? generateContent() : content;

    // Call the submitThread function and handle the response
    const result = await submitThread(selectedCategoryId, finalTitle, finalContent, 'governance');

    if (result.success && result.thread) {
      router.push(`/forum/thread/${result.thread.id}`);
    } else {
      setError('Failed to create the thread.');
    }
  };

  return (
    <div className={styles.replyFormContainer} style={{ paddingBottom: '96px' }}>
      <h2 className={styles.replyFormTitle}>Create New Thread</h2>

      {/* Select Forum Dropdown */}
      <div className={styles.field} style={{ marginBottom: '15px' }}>
        <label className={styles.label} style={{ marginRight: '8px' }}>
          Select Forum:
        </label>
        <select
          value={selectedCategoryId || ''}
          onChange={(e) => {
            console.log("User selected categoryId:", e.target.value);
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
                          date ? date.toISOString() : ''
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
                          ])
                        );
                      }}
                      startDate={startDate}
                      endDate={endDate}
                      selectsRange
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
              if (placeholder.type === 'textarea') {
                return (
                  <div key={placeholder.id} className={styles.placeholderField}>
                    <label>{placeholder.label}</label>
                    <textarea
                      value={placeholderValues[placeholder.id] || ''}
                      placeholder={placeholder.helpText}
                      onChange={(e) =>
                        handlePlaceholderChange(placeholder.id, e.target.value)
                      }
                      className={styles.placeholderInput}
                      rows={8}
                      style={{ resize: 'vertical', overflowY: 'auto' }}
                    />
                  </div>
                );
              }
              // Default for text, number, etc.
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
            <input
              type="text"
              placeholder="Thread title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={styles.replyTextarea}
            />
            <textarea
              placeholder="Thread details"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className={styles.replyTextarea}
              rows={8}
            />
          </>
        )}

        {error && <div className={styles.submitError}>{error}</div>}
        <button type="submit" className={styles.submitButton} disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create Thread'}
        </button>
      </form>
    </div>
  );
}
