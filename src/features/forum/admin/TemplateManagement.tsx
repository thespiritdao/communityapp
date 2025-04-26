// src/features/forum/components/admin/TemplateManagement.tsx
import { useState, useEffect } from 'react';
import { supabase } from 'src/utils/supabaseClient';
import styles from '../../styles/Forum.module.css';
import { useExtendedTokenGate } from 'src/app/features/forum/hooks/useExtendedTokenGate';


// Template interface matching the one from NewThreadForm
interface ThreadTemplate {
  id: string;
  name: string;
  titleTemplate: string;
  contentTemplate: string;
  placeholders: string[];
}

export function TemplateManagement() {
  const [templates, setTemplates] = useState<ThreadTemplate[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<ThreadTemplate>({
    id: '',
    name: '',
    titleTemplate: '',
    contentTemplate: '',
    placeholders: []
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newPlaceholder, setNewPlaceholder] = useState('');
  const erc1155AdminAddress = process.env.NEXT_PUBLIC_FORUM_ADMIN_ERC1155 as `0x${string}`;
  const adminTokenId = 1;

  if (isLoading) {
    return <div className={styles.loading}>Checking admin token access...</div>;
  }

  if (!hasAccess) {
    return (
      <div className={styles.accessDenied}>
        <p>You do not have the required admin token to access this page.</p>
      </div>
    );
  }

  // Load templates from Supabase
  const loadTemplates = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('forum_templates')
        .select('*')
        .order('name', { ascending: true });
        
      if (error) throw new Error(error.message);
      
      setTemplates(data || []);
    } catch (err) {
      setError('Failed to load templates: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const resetForm = () => {
    setCurrentTemplate({
      id: '',
      name: '',
      titleTemplate: '',
      contentTemplate: '',
      placeholders: []
    });
    setIsEditing(false);
  };

  const handleEditTemplate = (template: ThreadTemplate) => {
    setCurrentTemplate({...template});
    setIsEditing(true);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    
    setIsLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('forum_templates')
        .delete()
        .eq('id', id);
        
      if (error) throw new Error(error.message);
      
      setSuccess('Template deleted successfully');
      loadTemplates();
    } catch (err) {
      setError('Failed to delete template: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const extractPlaceholders = (text: string): string[] => {
    const placeholderRegex = /{([^{}]+)}/g;
    const matches = text.match(placeholderRegex) || [];
    return matches.map(match => match.slice(1, -1)).filter((value, index, self) => self.indexOf(value) === index);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');
    
    try {
      // Validate form
      if (!currentTemplate.name || !currentTemplate.titleTemplate) {
        throw new Error('Name and title template are required');
      }
      
      // Auto-extract placeholders from the title and content templates
      const titlePlaceholders = extractPlaceholders(currentTemplate.titleTemplate);
      const contentPlaceholders = extractPlaceholders(currentTemplate.contentTemplate);
      
      // Combine with manually added placeholders
      const allPlaceholders = [...new Set([
        ...titlePlaceholders, 
        ...contentPlaceholders, 
        ...currentTemplate.placeholders
      ])];
      
      const supabase = createClient();
      
      const templateData = {
        ...currentTemplate,
        placeholders: allPlaceholders
      };
      
      if (isEditing) {
        const { error } = await supabase
          .from('forum_templates')
          .update(templateData)
          .eq('id', currentTemplate.id);
          
        if (error) throw new Error(error.message);
        setSuccess('Template updated successfully');
      } else {
        // Generate a unique ID for new templates
        const templateId = currentTemplate.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '') + '_' + Date.now().toString(36);
          
        const { error } = await supabase
          .from('forum_templates')
          .insert({
            ...templateData,
            id: templateId
          });
          
        if (error) throw new Error(error.message);
        setSuccess('Template created successfully');
      }
      
      loadTemplates();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPlaceholder = () => {
    if (!newPlaceholder.trim()) return;
    
    // Convert to snake_case
    const formattedPlaceholder = newPlaceholder
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
      
    if (currentTemplate.placeholders.includes(formattedPlaceholder)) {
      setError('Placeholder already exists');
      return;
    }
    
    setCurrentTemplate(prev => ({
      ...prev,
      placeholders: [...prev.placeholders, formattedPlaceholder]
    }));
    
    setNewPlaceholder('');
  };

  const handleRemovePlaceholder = (placeholder: string) => {
    setCurrentTemplate(prev => ({
      ...prev,
      placeholders: prev.placeholders.filter(p => p !== placeholder)
    }));
  };

  return (
    <div className={styles.templateManagementContainer}>
      <div className={styles.templateManagementHeader}>
        <h2 className={styles.templateManagementTitle}>
          {isEditing ? 'Edit Thread Template' : 'Create Thread Template'}
        </h2>
        {isEditing && (
          <button 
            type="button" 
            className={styles.cancelButton}
            onClick={resetForm}
          >
            Cancel Editing
          </button>
        )}
      </div>
      
      {error && <div className={styles.submitError}>{error}</div>}
      {success && <div className={styles.submitSuccess}>{success}</div>}
      
      <form className={styles.templateForm} onSubmit={handleSaveTemplate}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Template Name</label>
          <input
            type="text"
            value={currentTemplate.name}
            onChange={e => setCurrentTemplate({...currentTemplate, name: e.target.value})}
            className={styles.formInput}
            placeholder="e.g. Governance Proposal"
            disabled={isLoading}
            required
          />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            Title Template 
            <span className={styles.helpText}>
              (Use {"{placeholder_name}"} for dynamic fields)
            </span>
          </label>
          <input
            type="text"
            value={currentTemplate.titleTemplate}
            onChange={e => setCurrentTemplate({...currentTemplate, titleTemplate: e.target.value})}
            className={styles.formInput}
            placeholder="e.g. [PROPOSAL] {proposal_title}"
            disabled={isLoading}
            required
          />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            Content Template
            <span className={styles.helpText}>
              (Use {"{placeholder_name}"} for dynamic fields)
            </span>
          </label>
          <textarea
            value={currentTemplate.contentTemplate}
            onChange={e => setCurrentTemplate({...currentTemplate, contentTemplate: e.target.value})}
            className={styles.formTextarea}
            rows={10}
            placeholder="Enter template content with placeholders like {proposal_summary}"
            disabled={isLoading}
          />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Placeholders</label>
          <div className={styles.placeholderInputGroup}>
            <input
              type="text"
              value={newPlaceholder}
              onChange={e => setNewPlaceholder(e.target.value)}
              className={styles.placeholderInput}
              placeholder="Add a placeholder (will be converted to snake_case)"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={handleAddPlaceholder}
              className={styles.addPlaceholderButton}
              disabled={isLoading || !newPlaceholder.trim()}
            >
              Add
            </button>
          </div>
          
          {currentTemplate.placeholders.length > 0 && (
            <div className={styles.placeholdersList}>
              {currentTemplate.placeholders.map(placeholder => (
                <div key={placeholder} className={styles.placeholderTag}>
                  {placeholder}
                  <button
                    type="button"
                    onClick={() => handleRemovePlaceholder(placeholder)}
                    className={styles.removePlaceholderButton}
                    disabled={isLoading}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className={styles.helpText}>
            Placeholders from your title and content will be automatically added when saving
          </p>
        </div>
        
        <button 
          type="submit" 
          className={styles.submitButton}
          disabled={isLoading}
        >
          {isLoading ? 'Saving...' : isEditing ? 'Update Template' : 'Create Template'}
        </button>
      </form>
      
      <div className={styles.templateListContainer}>
        <h3 className={styles.templateListTitle}>Existing Templates</h3>
        
        {isLoading && <div className={styles.loading}>Loading templates...</div>}
        
        {!isLoading && templates.length === 0 && (
          <div className={styles.emptyState}>No templates created yet</div>
        )}
        
        {templates.length > 0 && (
          <ul className={styles.templateList}>
            {templates.map(template => (
              <li key={template.id} className={styles.templateItem}>
                <div className={styles.templateItemContent}>
                  <h4 className={styles.templateItemName}>{template.name}</h4>
                  <div className={styles.templateItemDetails}>
                    <p><strong>Title:</strong> {template.titleTemplate}</p>
                    <p><strong>Placeholders:</strong> {template.placeholders.join(', ')}</p>
                  </div>
                </div>
                <div className={styles.templateItemActions}>
                  <button
                    type="button"
                    onClick={() => handleEditTemplate(template)}
                    className={styles.editButton}
                    disabled={isLoading}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(template.id)}
                    className={styles.deleteButton}
                    disabled={isLoading}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}