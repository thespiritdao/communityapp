//src/components/UserTagging.tsx
import { useEffect, useState } from 'react';
import {
  MentionsInput,
  Mention,
  type MentionItem,
  type SuggestionDataItem,
} from 'react-mentions';
import { supabase } from '@/utils/supabaseClient';
//import { useNotifications } from '@/context/NotificationContext';
//import { useGovernanceNotifications } from '@/context/GovernanceNotificationContext';
import { useAccount } from 'wagmi';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import styles from './styles/UserTagging.module.css';

// Extended suggestion data with profile picture
interface ExtendedSuggestionDataItem extends SuggestionDataItem {
  profile_picture?: string;
}

interface UserTaggingProps {
  value: string;
  onChange?: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  multiLine?: boolean;
  contextType?: 'forum' | 'chat' | 'bounty' | 'governance' | 'proposal' | 'events';
  contextId?: string;
  contextUrl?: string;
  proposalId?: string; // For governance mentions
  onMentionsChange?: (mentions: Array<{ id: string; display: string }>) => void;
  onNotificationSend?: (sendNotifications: () => Promise<void>) => void; // Expose send function to parent
}

export default function UserTagging({
  value,
  onChange,
  placeholder,
  className,
  style,
  onKeyDown,
  multiLine = false,
  contextType,
  contextId,
  contextUrl,
  proposalId,
  onMentionsChange,
  onNotificationSend,
}: UserTaggingProps) {
  const [users, setUsers] = useState<ExtendedSuggestionDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [previousMentions, setPreviousMentions] = useState<
    Array<{ id: string; display: string }>
  >([]);
  const { address } = useAccount();

  useEffect(() => {
    async function fetchUsers() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('public_profiles')
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

  const handleMentionsChange = (
    event: { target: { value: string } },
    newValue: string,
    newPlainTextValue: string,
    mentions: MentionItem[],
  ) => {
    onChange?.(newValue);
    onMentionsChange?.(mentions);
    setPreviousMentions(mentions);
  };

  // Send mention notifications when content is submitted
  const sendMentionNotifications = async () => {
    if (!address || !contextType || !contextId) {
      console.warn('Missing required data for mention notifications');
      return;
    }

    const currentMentions = previousMentions || [];
    if (currentMentions.length === 0) {
      return;
    }

    console.log(`Sending ${currentMentions.length} mention notifications`, {
      contextType,
      contextId,
      proposalId,
      mentions: currentMentions.map((m) => ({ id: m.id, display: m.display })),
    });

    try {
      // Send notifications for each mention
      for (const mention of currentMentions) {
        try {
          // Map 'proposal' to 'governance' for notification service
          const notificationContextType =
            contextType === 'proposal' ? 'governance' : contextType;

          if (
            (contextType === 'governance' || contextType === 'proposal') &&
            proposalId
          ) {
            // Use unified service for governance/proposal mentions
            await unifiedNotificationService.createUserMentionNotification(
              mention.id,
              address,
              'governance',
              contextId,
              contextUrl,
              proposalId,
            );
            console.log(
              `✅ Sent governance mention notification to ${mention.display}`,
            );
          } else {
            // Use unified service for other mentions
            await unifiedNotificationService.createUserMentionNotification(
              mention.id,
              address,
              notificationContextType,
              contextId,
              contextUrl,
            );
            console.log(
              `✅ Sent ${contextType} mention notification to ${mention.display}`,
            );
          }
        } catch (error) {
          console.error(
            `❌ Failed to send mention notification to ${mention.display}:`,
            error,
          );
        }
      }
    } catch (error) {
      console.error('Failed to send mention notifications:', error);
    }
  };

  // Expose sendMentionNotifications function to parent
  useEffect(() => {
    if (onNotificationSend) {
      onNotificationSend(sendMentionNotifications);
    }
  }, [onNotificationSend, sendMentionNotifications]);

  const fetchMentionSuggestions = (
    query: string,
    callback: (data: ExtendedSuggestionDataItem[]) => void,
  ) => {
    console.log('Searching for:', query);

    if (loading) {
      console.log('Still loading users...');
      callback([]);
      return;
    }

    // Special handling for @everyone
    const everyoneOption: ExtendedSuggestionDataItem = {
      id: 'everyone',
      display: 'everyone',
    };

    if (query === '') {
      console.log('Empty query, returning all users + @everyone');
      callback([everyoneOption, ...users]);
      return;
    }

    // Check if query matches "everyone"
    const everyoneMatch = 'everyone'.toLowerCase().includes(query.toLowerCase());
    const matchingUsers = users.filter(
      (user) =>
        user.display && user.display.toLowerCase().includes(query.toLowerCase()),
    );

    console.log(`Found ${matchingUsers.length} user matches for "${query}"`);

    // Return @everyone first if it matches, then regular users
    const results = everyoneMatch
      ? [everyoneOption, ...matchingUsers]
      : matchingUsers;

    callback(results);
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
      ...style,
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
        placeholder={
          placeholder || 'Share your message... Use @ to mention someone'
        }
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
          renderSuggestion={(
            suggestion: ExtendedSuggestionDataItem,
            search: string,
            highlightedDisplay: React.ReactNode,
            index: number,
            focused: boolean,
          ) => {
            return (
              <div
                className={
                  focused ? styles.focusedSuggestion : styles.suggestion
                }
              >
                <img
                  src={
                    suggestion.profile_picture || '/observableinfinities.png'
                  }
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
      {loading && (
        <div className={styles.loadingIndicator}>Loading users...</div>
      )}
    </div>
  );
}

export function formatMessageWithMentions(message: string): string {
  return message.replace(/@\[(.*?)\]\(.*?\)/g, '@$1');
}
