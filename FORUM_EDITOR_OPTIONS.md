# Forum Editor Options

The forum reply system supports two editor modes. You can toggle between them by changing the `USE_RICH_EDITOR` constant.

## Current Setup: @Mention Autocomplete (Default)

**File**: `src/features/forum/components/ReplyForm.tsx`
**Setting**: `const USE_RICH_EDITOR = false;`

### Features:
- ✅ **Autocomplete @mentions** with dropdown
- ✅ Shows profile pictures in suggestions
- ✅ Filters as you type (e.g., @eric shows all Erics)
- ✅ Click to insert mention
- ✅ Automatic notification sending
- ❌ No rich text formatting (bold, lists, etc.)

### Usage:
1. Type `@` in the reply box
2. Dropdown appears with all members
3. Type more letters to filter (e.g., `@john`)
4. Click a name or use arrow keys + Enter
5. Mention is inserted as `@[John Smith](0x...)`

---

## Alternative: Rich Text Formatting

**File**: `src/features/forum/components/ReplyForm.tsx`
**Setting**: `const USE_RICH_EDITOR = true;`

### Features:
- ✅ **Rich text formatting** toolbar (bold, italic, headings, lists, links, images, etc.)
- ✅ Visual formatting controls
- ✅ Manual @mentions (type `@firstname` or `@lastname`)
- ❌ No autocomplete dropdown
- ✅ Automatic mention detection and notifications

### Usage:
1. Use toolbar buttons for formatting
2. Type `@john` to mention (must match first or last name exactly)
3. System automatically resolves name to wallet address
4. Mentioned users receive notifications

---

## How to Switch

Edit `src/features/forum/components/ReplyForm.tsx` (line 11):

```typescript
// For @mention autocomplete:
const USE_RICH_EDITOR = false;

// For rich text formatting:
const USE_RICH_EDITOR = true;
```

The same constant can be added to `PostList.tsx` to control the thread reply form.

---

## Technical Details

### ForumTextInput (Autocomplete Mode)
- Uses `UserTagging` component from `@/components/UserTagging`
- Same component used in chat
- Stores mentions in format: `@[Display Name](wallet_address)`
- Real-time filtering and suggestions

### RichTextEditor (Formatting Mode)
- Uses TipTap rich text editor
- Outputs HTML
- Mentions resolved via fallback logic in `utils/mentions.ts`
- Searches user_profiles table for matching first/last names

### Mention Processing (Both Modes)
- `useForum.submitPost()` extracts mentions using `extractMentionedWalletsEnhanced()`
- Sends notifications via `unifiedNotificationService`
- Works with both formats automatically

---

## Recommendation

**Use ForumTextInput (current default)** for best user experience with @mentions. The autocomplete dropdown is intuitive and matches user expectations from other platforms (Slack, Discord, Twitter, etc.).

If formatting is critical, consider implementing TipTap's Mention extension (advanced, requires custom suggestion rendering logic).
