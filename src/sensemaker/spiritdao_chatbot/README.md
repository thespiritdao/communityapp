# SpiritDAO Knowledge Assistant

Academic chatbot powered by Pinecone + OpenAI for answering questions about books and documents.

## Features

- 📚 RAG (Retrieval Augmented Generation) for accurate answers
- 💬 Conversation memory across sessions
- 🎨 Beautiful, responsive chat widget
- 🔌 Easy embedding on any website (Webflow compatible)
- 📊 Simple API for custom integrations

## Directory Structure

```
spiritdao_chatbot/
├── app.py                    # Main Flask application
├── requirements.txt          # Python dependencies
├── .env                      # Environment configuration
├── upload_documents.py       # Script to upload docs to Pinecone
├── services/
│   ├── rag_service.py       # RAG query logic
│   └── conversation_manager.py  # Session management
└── templates/
    ├── index.html           # Home page
    ├── widget.html          # Chat widget
    └── embed_code.html      # Embedding instructions
```

## Setup Instructions

### 1. PythonAnywhere Setup

1. Upload all files to `/home/yourusername/spiritdao/`
2. Create virtual environment:
   ```bash
   cd ~/spiritdao
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. Configure `.env` file with your API keys:
   ```
   OPENAI_API_KEY=sk-...
   PINECONE_API_KEY=...
   PINECONE_INDEX_NAME=spiritdao-books
   SECRET_KEY=your-random-secret-key
   ```

4. In PythonAnywhere Web tab:
   - Source code: `/home/yourusername/spiritdao`
   - WSGI file: Edit to import from `app.py`
   - Virtualenv: `/home/yourusername/spiritdao/venv`

### 2. Upload Documents to Pinecone

```bash
# Create a 'documents' folder with your PDFs and TXT files
mkdir documents
# Copy your books/PDFs to this folder

# Run upload script
python upload_documents.py ./documents
```

This will:
- Create Pinecone index if needed
- Split documents into chunks
- Generate embeddings
- Upload to Pinecone

### 3. Test the Chatbot

Visit these URLs:
- `https://spiritdao.pythonanywhere.com/` - Home page
- `https://spiritdao.pythonanywhere.com/widget` - Chat widget
- `https://spiritdao.pythonanywhere.com/api/health` - Health check

### 4. Embed on Webflow

Get embed code at: `https://spiritdao.pythonanywhere.com/embed-code`

Basic iframe embed:
```html
<iframe
  src="https://spiritdao.pythonanywhere.com/widget"
  width="100%"
  height="600px"
  style="border: none; border-radius: 10px;"
></iframe>
```

## API Endpoints

### POST /api/chat
Send a chat message and get AI response.

**Request:**
```json
{
  "query": "What does the text say about consciousness?",
  "session_id": "optional-session-id"
}
```

**Response:**
```json
{
  "response": "According to the text...",
  "session_id": "abc123"
}
```

### GET /api/health
Health check endpoint.

## Customization

### Change Colors
Edit `templates/widget.html` to customize the gradient and colors.

### Modify System Prompt
Edit `services/rag_service.py` - `SYSTEM_PROMPT` variable to change bot personality.

### Adjust RAG Settings
In `services/rag_service.py`:
- `top_k=5` - Number of similar chunks to retrieve
- `score > 0.7` - Minimum similarity threshold
- `max_tokens=800` - Response length

## DreamHost DNS Configuration

To use `chatbot.spiritdao.org`:

1. Log into DreamHost panel
2. Go to Domains → Manage Domains
3. Add subdomain: `chatbot.spiritdao.org`
4. Create CNAME record:
   - Name: `chatbot`
   - Value: `spiritdao.pythonanywhere.com`
5. Wait for DNS propagation (up to 24 hours)

Then update all URLs from `spiritdao.pythonanywhere.com` to `chatbot.spiritdao.org`

## Troubleshooting

**Error: "No relevant context found"**
- Upload more documents to Pinecone
- Check `PINECONE_INDEX_NAME` is correct

**Error: "Unable to connect to OpenAI"**
- Verify `OPENAI_API_KEY` in `.env`
- Check API key has credits

**Widget not loading**
- Check CORS is enabled in `app.py`
- Verify PythonAnywhere app is running

## Support

For issues or questions, contact the dev team.
