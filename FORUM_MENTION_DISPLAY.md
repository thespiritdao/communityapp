# Forum Mention Display

## Overview

Forum posts and replies now display @mentions as interactive **name cards** that show the user's profile picture and name. Clicking a mention opens the user's full profile modal.

## How It Works

### Mention Format

When users type mentions using the autocomplete dropdown (with `USE_RICH_EDITOR = false`), mentions are stored in this format:

```
@[Display Name](wallet_address)
```

Example:
```
@[Eric Miki](0x62421b696132bb635feba0e3cb2f305637cb7ead)
```

### Display Format

Instead of showing the raw markdown format, mentions are now rendered as interactive components:

**Before:**
```
@[Eric Miki](0x62421b696132bb635feba0e3cb2f305637cb7ead)
```

**After:**
```
[Profile Picture] Eric Miki  ← Clickable, opens profile modal
```

## Technical Implementation

### Components

**`MentionRenderer.tsx`**
- Parses forum post content and extracts mentions using regex
- Replaces `@[Name](address)` with `UserProfileDisplay` components
- Preserves HTML formatting in non-mention text
- Located at: `src/features/forum/components/MentionRenderer.tsx`

**`UserProfileDisplay.tsx`**
- Displays user's profile picture and name
- Fetches profile data from `user_profiles` table
- Shows wallet address if no profile name exists
- Opens `ProfileModal` when clicked
- Located at: `src/components/UserProfileDisplay.tsx`

**`PostCard.tsx`**
- Updated to use `MentionRenderer` instead of `dangerouslySetInnerHTML`
- Renders post content with interactive mentions
- Located at: `src/features/forum/components/PostCard.tsx` (lines 220-225)

### Code Example

```typescript
// Old approach (raw HTML)
<div
  className={styles.contentText}
  dangerouslySetInnerHTML={{ __html: post.content }}
/>

// New approach (parsed mentions)
<MentionRenderer
  content={post.content}
  className={styles.contentText}
/>
```

## Features

✅ **Interactive Profile Cards**
- Shows profile picture and display name
- Hover effect for better UX
- Clickable to open full profile modal

✅ **Fallback Handling**
- If no profile exists, shows shortened wallet address (0x1234...5678)
- Gracefully handles missing profile pictures

✅ **HTML Preservation**
- Rich text formatting (bold, italic, lists, etc.) still works
- Only mentions are parsed and replaced
- Safe HTML rendering with React

✅ **Performance**
- Profile data fetched on-demand
- Uses existing `UserProfileDisplay` component (no duplication)
- Efficient regex parsing

## User Experience

1. **Creating Mentions**: Type `@` in reply box → autocomplete dropdown appears → select user → mention inserted as `@[Name](address)`

2. **Viewing Mentions**: Mentions display as name cards with profile pictures → hover to see interaction → click to open profile modal

3. **Profile Modal**: Shows full user profile with bio, interests, social links, etc.

## Compatibility

Works with both editor modes:

- **ForumTextInput Mode** (`USE_RICH_EDITOR = false`): Autocomplete creates properly formatted mentions
- **RichTextEditor Mode** (`USE_RICH_EDITOR = true`): Manual @mentions resolved and displayed as name cards

Both modes use the same mention rendering system.

## Related Files

- `src/features/forum/components/MentionRenderer.tsx` - Mention parsing and rendering
- `src/features/forum/components/PostCard.tsx` - Post display with mentions
- `src/components/UserProfileDisplay.tsx` - Name card component
- `src/features/identity/components/ProfileModal.tsx` - Full profile modal
- `src/utils/mentions.ts` - Mention extraction utilities
- `FORUM_EDITOR_OPTIONS.md` - Editor mode documentation
