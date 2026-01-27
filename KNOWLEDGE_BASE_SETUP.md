# Knowledge Base Storage Setup

## Supabase Storage Buckets Required

You need to create two storage buckets in your Supabase project:

### 1. `knowledge-videos`
- **Purpose**: Store video files (.mp4, .webm, etc.)
- **Public**: Yes (enable public access)
- **File size limit**: Recommended 100MB+
- **Allowed MIME types**: `video/*`

### 2. `knowledge-documents`
- **Purpose**: Store document files (.pdf, .doc, .docx)
- **Public**: Yes (enable public access)
- **File size limit**: Recommended 50MB+
- **Allowed MIME types**: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

## How to Create Buckets

1. Go to your Supabase Dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Create `knowledge-videos`:
   - Name: `knowledge-videos`
   - Public: ✓ (checked)
   - Click **Create bucket**
5. Create `knowledge-documents`:
   - Name: `knowledge-documents`
   - Public: ✓ (checked)
   - Click **Create bucket**

## RLS Policies (Optional but Recommended)

For better security, you can add RLS policies:

### For both buckets:

**Upload Policy:**
```sql
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'knowledge-videos' OR bucket_id = 'knowledge-documents');
```

**Read Policy:**
```sql
CREATE POLICY "Public can read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'knowledge-videos' OR bucket_id = 'knowledge-documents');
```

**Delete Policy:**
```sql
CREATE POLICY "Creators can delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'knowledge-videos' OR bucket_id = 'knowledge-documents');
```

## Changes Made

### 1. Removed "link" content type
- Updated types to only support: `video`, `document`, `markdown`
- Removed external link UI components
- All content must now be uploaded or stored in database

### 2. File Upload Support
- Videos → Uploaded to `knowledge-videos` bucket
- Documents → Uploaded to `knowledge-documents` bucket
- Markdown/Text → Stored directly in `content_text` field (no upload)

### 3. Updated Knowledge Manager Form
- Content type selector (Video/Document/Text)
- File upload input for videos and documents
- Text area for markdown content
- Upload progress indicator
- File size display

### 4. Fixed Padding Issues
- Main knowledge page: Removed outer padding, added to inner containers
- Detail page: Removed outer padding from back button container
- Content now spans full width properly

## Testing

1. Create a test category in your pod's knowledge base
2. Try uploading a video file
3. Try uploading a PDF document
4. Try creating markdown/text content
5. Verify files are accessible from the knowledge base viewer

## Migration Note

Your existing test item has:
- `content_type: "video"`
- `content_url: "https://spiritdao.org"` (not a video)

You should either:
- Delete this test item
- Or update its `content_type` to something valid with proper content

The new system will prevent creating invalid content combinations.
