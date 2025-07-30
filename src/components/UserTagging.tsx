//src/components/UserTagging.tsx
import { useEffect, useState } from 'react';
import { MentionsInput, Mention } from 'react-mentions';
import { supabase } from '../utils/supabaseClient';
import { useNotifications } from '../context/NotificationContext';
import { useAccount } from 'wagmi';
import styles from './styles/UserTagging.module.css';

interface UserTaggingProps {
  value: string;
  onChange?: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  multiLine?: boolean;
  contextType?: 'forum' | 'chat' | 'bounty' | 'governance';
  contextId?: string;
  contextUrl?: string;
  onMentionsChange?: (mentions: Array<{ id: string; display: string }>) => void;
}

export default function UserTagging({
  value,
  onChange,
  placeholder,
  className,
  onKeyDown,
  multiLine = false,
  contextType,
  contextId,
  contextUrl,
  onMentionsChange,
}: UserTaggingProps) {
  const [users, setUsers] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [previousMentions, setPreviousMentions] = useState<Array<{ id: string; display: string }>>([]);
  const { createUserMentionNotification } = useNotifications();
  const { address } = useAccount();

  useEffect(() => {
    async function fetchUsers() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('wallet_address, first_name, last_name, profile_picture');
        
        if (error) {
          console.error('Error fetching users:', error);
        } else {
          const mentionUsers = data.map((user) => ({
            id: user.wallet_address,
            display: `${user.first_name} ${user.last_name}`,
            profile_picture: user.profile_picture,
          }));
          setUsers(mentionUsers);
          console.log('Loaded users for mentions:', mentionUsers.length);
          console.debug('Mention users array:', mentionUsers);
        }
      } catch (err) {
        console.error('Exception fetching users:', err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchUsers();
  }, []);

  const handleMentionsChange = (event, newValue, newPlainTextValue, mentions) => {
    onChange?.(newValue);
    onMentionsChange?.(mentions);
    setPreviousMentions(mentions);
  };

  const fetchMentionSuggestions = (query, callback) => {
    console.log('Searching for:', query);
    
    if (loading) {
      console.log('Still loading users...');
      callback([]);
      return;
    }
    
    if (query === '') {
      console.log('Empty query, returning all users');
      callback(users);
      return;
    }
    
    const matchingUsers = users.filter(user => 
      user.display.toLowerCase().includes(query.toLowerCase())
    );
    
    console.log(`Found ${matchingUsers.length} matches for "${query}"`);
    callback(matchingUsers);
  };

  const mentionsInputStyle = {
    input: {
      overflow: 'auto',
      border: 'none',
      outline: 'none',
      width: '100%',
      minHeight: multiLine ? '40px' : 'auto',
      padding: '0',
      backgroundColor: 'transparent',
    },
    suggestions: {
      list: {
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '5px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        maxHeight: '150px',
        overflow: 'auto',
        zIndex: 1000,
      },
      item: {
        padding: '8px 12px',
        cursor: 'pointer',
      },
      focusedItem: {
        padding: '8px 12px',
        cursor: 'pointer',
        backgroundColor: '#f0f0f0',
      },
    },
  };

  return (
    <div className={styles.mentionsWrapper}>
      <MentionsInput
        value={value}
        onChange={handleMentionsChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder || 'Share your message... Use @ to mention someone'}
        className={className || ''}
        style={mentionsInputStyle}
        allowSuggestionsAboveCursor={true}
        allowSpaceInQuery={true}
        forceSuggestionsAboveCursor={false}
      >
        <Mention
          trigger="@"
          data={fetchMentionSuggestions}
          appendSpaceOnAdd={true}
          markup="@[__display__](__id__)"
          displayTransform={(id, display) => `@${display}`}
          renderSuggestion={(suggestion, search, highlightedDisplay, index, focused) => {
            return (
              <div className={focused ? styles.focusedSuggestion : styles.suggestion}>
                <img
                  src={suggestion.profile_picture || '/observableinfinities.png'}
                  alt=""
                  className={styles.profilePicture}
                  width={24}
                  height={24}
                  onError={(e) => {
                    e.currentTarget.src = '/observableinfinities.png';
                  }}
                />
                <span className={styles.userName}>{highlightedDisplay}</span>
              </div>
            );
          }}
        />
      </MentionsInput>
      {loading && <div className={styles.loadingIndicator}>Loading users...</div>}
    </div>
  );
}

export function formatMessageWithMentions(message: string): string {
  return message.replace(/@\[(.*?)\]\(.*?\)/g, '@$1');
}