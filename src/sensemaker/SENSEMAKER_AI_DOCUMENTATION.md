# Sensemaker AI - Complete Documentation & Integration Guide

**Version:** 1.0.0
**Last Updated:** 2025-10-19
**Deployment:** https://spiritdao.pythonanywhere.com
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Training & Knowledge Base](#training--knowledge-base)
4. [Technical Implementation](#technical-implementation)
5. [API Documentation](#api-documentation)
6. [Embedding on Websites](#embedding-on-websites)
7. [DAO App Integration Guide](#dao-app-integration-guide)
8. [Configuration & Environment](#configuration--environment)
9. [Deployment History](#deployment-history)
10. [Future Enhancements](#future-enhancements)

---

## Overview

**Sensemaker AI** is a specialized RAG (Retrieval Augmented Generation) chatbot designed for SpiritDAO to provide academic knowledge about **Temporal Naturalism**—a philosophical framework integrating cosmology, metaphysics, and social theory through the works of Lee Smolin, Roberto Mangabeira Unger, and Ron Rivers.

### Key Features

✅ **RAG-powered knowledge retrieval** using Pinecone vector database
✅ **Conversational memory** with session management (2-hour window)
✅ **Voice input** via Web Speech API
✅ **Markdown rendering** for rich text responses
✅ **Copy/Share functionality** for assistant responses
✅ **Mobile-responsive design** with SpiritDAO branding
✅ **CORS-enabled** for cross-origin embedding
✅ **Starter question prompts** to guide users
✅ **Academic citation format** with source attribution

### Tech Stack

- **Backend:** Flask 3.0.0 (Python)
- **Vector Database:** Pinecone 5.0.1 (serverless, AWS us-east-1)
- **AI Models:** OpenAI GPT-4o-mini + text-embedding-3-small (OpenAI 2.5.0)
- **Frontend:** Vanilla JavaScript, Lucide Icons, Marked.js
- **Hosting:** PythonAnywhere (paid tier for external API access)
- **Document Processing:** PyPDF2 3.0.1

---

## Architecture

### System Flow

```
User Query → Flask API → Conversation Manager → RAG Service
                                                      ↓
                                    Embedding Generation (OpenAI)
                                                      ↓
                                    Vector Search (Pinecone)
                                                      ↓
                                    Context Retrieval (top_k=12)
                                                      ↓
                                    Response Generation (GPT-4o-mini)
                                                      ↓
                                    Return to User with Sources
```

### Directory Structure

```
spiritdao_chatbot/
├── app.py                          # Main Flask application (107 lines)
├── wsgi.py                         # PythonAnywhere WSGI entry point
├── requirements.txt                # Python dependencies
├── .env                            # Environment variables (API keys)
├── upload_documents.py             # Document ingestion script (289 lines)
├── services/
│   ├── __init__.py
│   ├── rag_service.py             # RAG logic with Pinecone/OpenAI (247 lines)
│   └── conversation_manager.py    # Session management (65 lines)
└── templates/
    ├── index.html                 # Landing page
    ├── widget.html                # Chat interface (591 lines)
    └── embed_code.html            # Embedding instructions
```

### Component Breakdown

#### 1. **app.py** - Flask Application
- Routes: `/`, `/widget`, `/api/chat`, `/api/health`, `/embed-code`
- CORS enabled for `*` origins on `/api/*` and `/widget`
- Session management with `ConversationManager`
- Error handling with detailed logging

#### 2. **services/rag_service.py** - RAG Engine
- **Lazy Pinecone initialization** (avoids PythonAnywhere firewall issues)
- **Source name mapping** for display-friendly book titles
- **Academic system prompt** (132 lines) with structured output format
- **Retrieval parameters:**
  - `top_k=12` (retrieve 12 most similar chunks)
  - `similarity_threshold=0.5` (lowered for academic content)
  - `max_tokens=800` (response length limit)
- **Conversation history:** Last 6 messages (3 exchanges) for context

#### 3. **services/conversation_manager.py** - Session Management
- In-memory storage (UUID-based session IDs)
- 2-hour session cleanup interval
- Stores last 10 messages per session (5 exchanges)

#### 4. **templates/widget.html** - Chat Interface
- **SpiritDAO branding:** Custom color palette (#2E3F4F, #5CA88B, #7BC9A8)
- **Lucide Icons:** SVG icons loaded via CDN
- **Markdown rendering:** Marked.js for rich text
- **Voice input:** Web Speech API (Chrome, Edge, Safari)
- **Starter questions:** 3 pre-populated queries
- **Mobile-responsive:** Optimized padding, font sizes, button spacing

#### 5. **upload_documents.py** - Document Ingestion
- Supports PDF and TXT files
- **Chunking strategy:**
  - Chunk size: 1000 characters
  - Overlap: 200 characters
  - Sentence-boundary detection (looks for `. ` `? ` `! `)
- **Safety limits:** 10,000 iteration cap to prevent infinite loops
- **Batch upload:** 100 vectors per Pinecone upsert
- **Logging:** Progress tracking every 10 pages (PDF) / 50 chunks

---

## Training & Knowledge Base

### Documents Trained On

The chatbot was trained on **7 academic PDFs** (9,667 vectors total) from the SpiritDAO knowledge base:

| **Book Title** | **Author(s)** | **Source File** | **Approx. Chunks** |
|----------------|---------------|-----------------|-------------------|
| The World and Us | Roberto Mangabeira Unger | `FINAL TEXT FILE_World and Us, The (1).pdf` | ~1,400 |
| Governable Spaces | Unknown | `governable-spaces.pdf` | ~800 |
| Plurality: The Future of Collaborative Technology and Democracy | E. Glen Weyl, Audrey Tang | `Plurality-english.pdf` | ~2,500 |
| Self-Actualization in the Age of Crisis | Ron Rivers | `Self-Actualization in the Age of Crisis PDF.pdf` | ~1,200 |
| The Religion of the Future | Roberto Mangabeira Unger | `the-religion-of-the-future.pdf` | ~900 |
| The Singular Universe and the Reality of Time | Roberto Mangabeira Unger, Lee Smolin | `the-singular-universe-and-the-reality-of-time.pdf` | ~2,000 |
| Time Reborn | Lee Smolin | `Time Reborn - Lee Smolin.pdf` | ~867 |

**Total:** 9,667 vector embeddings in Pinecone index `spiritdao-books`

### Upload Process (Historical Context)

**Date:** 2025-10-19
**Location:** Local machine (`<repo>/src/sensemaker`)
**Method:** PowerShell script with environment variables

```powershell
# Set environment variables
$env:OPENAI_API_KEY = "sk-proj-..."
$env:PINECONE_API_KEY = "pcsk_..."
$env:PINECONE_INDEX_NAME = "spiritdao-books"

# Run upload script
python upload_documents.py "<repo>/src/sensemaker"
```

**Why from local machine?**
PythonAnywhere's server firewall blocks Pinecone connections even on paid tier. Local upload bypasses this restriction.

### Pinecone Configuration

- **Index Name:** `spiritdao-books`
- **Dimension:** 1536 (OpenAI text-embedding-3-small)
- **Metric:** Cosine similarity
- **Cloud:** AWS us-east-1 (Serverless Spec)
- **Current Vector Count:** 9,667

### Knowledge Base Maintenance

**Adding New Documents:**

1. Place PDFs in local directory (e.g., `<repo>/src/sensemaker`)
2. Add new entries to `SOURCE_NAME_MAPPING` in `rag_service.py`:
   ```python
   SOURCE_NAME_MAPPING = {
       'your-filename': 'Display Name by Author',
       # ...
   }
   ```
3. Run upload script from local machine:
   ```bash
   python upload_documents.py /path/to/documents
   ```
4. Verify upload in logs (should show chunk count and vector count)

**Deleting Documents:**

Pinecone provides vector deletion by ID or metadata filter. To remove a document:

```python
from pinecone import Pinecone
pc = Pinecone(api_key="...")
index = pc.Index("spiritdao-books")

# Delete by metadata
index.delete(filter={"source": "filename-to-remove"})
```

---

## Technical Implementation

### RAG Configuration Details

#### Embedding Model
- **Model:** `text-embedding-3-small` (OpenAI)
- **Dimensions:** 1536
- **Cost:** ~$0.00002 per 1,000 tokens
- **Speed:** ~500ms per embedding

#### Language Model
- **Model:** `gpt-4o-mini` (OpenAI)
- **Temperature:** 0.7 (balanced creativity/accuracy)
- **Max Tokens:** 800 (response length)
- **Cost:** ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
- **Context Window:** 128K tokens

#### Retrieval Strategy
- **Top-K:** 12 chunks retrieved per query
- **Similarity Threshold:** 0.5 (50% cosine similarity)
- **Re-ranking:** None (direct top-K retrieval)
- **Context Assembly:** Concatenate all matching chunks with source labels

#### Chunking Strategy
- **Chunk Size:** 1000 characters
- **Overlap:** 200 characters (20%)
- **Boundary Detection:** Sentence-aware (`. ` `? ` `! `)
- **Min Chunk Size:** 50 characters (filters out noise)

**Why these parameters?**

- **Large top_k (12):** Academic content is dense; more chunks = better context
- **Low threshold (0.5):** Prevents missing relevant passages in philosophical text
- **Moderate overlap (20%):** Maintains context across chunk boundaries
- **Sentence boundaries:** Preserves semantic integrity

### System Prompt Architecture

The 132-line system prompt structures responses with:

1. **Role Definition:** Academic reasoning model for Temporal Naturalism
2. **Objective:** 4-step analysis → synthesis → attribution → gap acknowledgment
3. **Instruction Flow:** Contextual analysis, multi-source synthesis, citation format
4. **Style Guide:** Scholarly yet accessible, structured output (Direct Answer → Evidence → Implications → Further Reading)
5. **Boundaries:** No speculation beyond retrieved texts, treat TN as collaborative paradigm
6. **Retrieval Priority:** Co-authored works > single-author works > Rivers' notes
7. **Example Behavior:** Concrete query/response demonstration

**Key Innovation:** The prompt enforces **inline citations** (e.g., "Smolin, *Time Reborn*, p. 89") to ground responses in source material.

### Lazy Initialization Pattern

**Problem:** PythonAnywhere free tier blocks external API connections at import time.

**Solution:** Defer Pinecone connection until first query.

```python
# Global variables
_pinecone_client = None
_pinecone_index = None

def get_pinecone_index():
    """Lazy initialize Pinecone connection"""
    global _pinecone_client, _pinecone_index
    if _pinecone_index is None:
        _pinecone_client = Pinecone(api_key=os.getenv('PINECONE_API_KEY'))
        _pinecone_index = _pinecone_client.Index(index_name)
    return _pinecone_index
```

This pattern is **critical** for PythonAnywhere deployment.

### Session Management

**In-Memory Storage (Current):**
- UUID-based session IDs
- 2-hour cleanup interval
- Last 10 messages per session

**Limitations:**
- Lost on server restart
- Not shared across server instances
- Memory usage grows with active users

**Production Recommendation:**
For DAO app integration, consider upgrading to **Redis** or **database-backed sessions** for persistence.

---

## API Documentation

### Base URL
```
https://spiritdao.pythonanywhere.com
```

### Endpoints

#### 1. `GET /`
**Description:** Landing page with chatbot info
**Response:** HTML page

#### 2. `GET /widget`
**Description:** Embeddable chat interface
**Response:** HTML page with full chat UI
**CORS:** Enabled for all origins

#### 3. `POST /api/chat`
**Description:** Main chat endpoint for RAG queries

**Request:**
```json
{
  "query": "What is Temporal Naturalism?",
  "session_id": "optional-uuid-for-conversation-continuity"
}
```

**Response (Success - 200):**
```json
{
  "response": "**Direct Answer**: Temporal Naturalism is a philosophical framework...",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (Error - 400):**
```json
{
  "error": "Query is required"
}
```

**Response (Error - 500):**
```json
{
  "error": "An error occurred processing your request"
}
```

**CORS:** Enabled for all origins
**Rate Limiting:** None (consider adding for production)

#### 4. `GET /api/health`
**Description:** Health check for monitoring

**Response (200):**
```json
{
  "status": "healthy",
  "service": "SpiritDAO Chatbot",
  "version": "1.0.0"
}
```

#### 5. `GET /embed-code`
**Description:** Page showing embedding instructions
**Response:** HTML page with iframe code

---

## Embedding on Websites

### Option 1: Full-Page Iframe (Recommended)

Use this for dedicated chatbot pages on your website.

```html
<iframe
  src="https://spiritdao.pythonanywhere.com/widget"
  width="100%"
  height="600px"
  style="border: none; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"
  title="Sensemaker AI Chatbot"
></iframe>
```

**Responsive sizing:**

```html
<div style="position: relative; width: 100%; max-width: 800px; margin: 0 auto;">
  <iframe
    src="https://spiritdao.pythonanywhere.com/widget"
    width="100%"
    height="600px"
    style="border: none; border-radius: 10px;"
  ></iframe>
</div>
```

### Option 2: Fixed Bottom-Right Widget

For a persistent chat widget in the corner of your site:

```html
<iframe
  id="sensemaker-widget"
  src="https://spiritdao.pythonanywhere.com/widget"
  style="
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 400px;
    height: 600px;
    border: none;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    z-index: 9999;
  "
></iframe>
```

**Mobile-responsive version:**

```html
<style>
  #sensemaker-widget {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 400px;
    height: 600px;
    border: none;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    z-index: 9999;
  }

  @media (max-width: 768px) {
    #sensemaker-widget {
      bottom: 10px;
      right: 10px;
      left: 10px;
      width: auto;
      height: 500px;
    }
  }
</style>

<iframe
  id="sensemaker-widget"
  src="https://spiritdao.pythonanywhere.com/widget"
></iframe>
```

### Option 3: Embedded Section

For a dedicated section within a page:

```html
<section id="chatbot-section" style="padding: 40px 20px; background: #F5F8FA;">
  <div style="max-width: 1000px; margin: 0 auto;">
    <h2 style="text-align: center; margin-bottom: 20px; color: #2E3F4F;">
      Ask Sensemaker AI
    </h2>
    <p style="text-align: center; margin-bottom: 30px; color: #4a5568;">
      Explore our library of Temporal Naturalism philosophy
    </p>
    <iframe
      src="https://spiritdao.pythonanywhere.com/widget"
      width="100%"
      height="700px"
      style="border: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"
    ></iframe>
  </div>
</section>
```

### Webflow-Specific Instructions

1. **Add an Embed Element:**
   - Drag "Embed" component from Add Panel
   - Paste iframe code (any option above)
   - Set custom attributes if needed

2. **Custom Code in Page Settings:**
   - Go to Page Settings → Custom Code
   - Paste iframe code in "Before </body> tag" for bottom-right widget

3. **Using Custom Code Block:**
   - Insert HTML Embed element
   - Paste full HTML + CSS for styled sections

### Styling Recommendations

**Match SpiritDAO Branding:**

The widget already uses SpiritDAO colors:
- Primary: `#2E3F4F` (dark slate-blue)
- Accent: `#5CA88B` (medium green)
- Highlight: `#7BC9A8` (lighter teal)
- Background: `#F5F8FA`

**Custom container styling:**

```css
.chatbot-container {
  max-width: 900px;
  margin: 60px auto;
  padding: 20px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(46, 63, 79, 0.15);
}
```

---

## DAO App Integration Guide

### Current Architecture

The chatbot is currently **standalone** on PythonAnywhere. To integrate into the DAO app, you have three options:

### Integration Option 1: Iframe Embed (Easiest)

**Pros:**
- No code changes to DAO app
- Isolated security context
- Independent deployment

**Cons:**
- Limited customization
- Separate session management
- Cannot access DAO app state

**Implementation:**

Add to your DAO app frontend:

```jsx
// In your React component
function SensemakerWidget() {
  return (
    <div className="sensemaker-container">
      <iframe
        src="https://spiritdao.pythonanywhere.com/widget"
        width="100%"
        height="600px"
        style={{ border: 'none', borderRadius: '12px' }}
        title="Sensemaker AI"
      />
    </div>
  );
}
```

### Integration Option 2: API Integration (Recommended)

**Pros:**
- Full UI control
- Shared authentication
- Access to DAO app context
- Custom styling

**Cons:**
- Requires frontend development
- More complex state management

**Implementation:**

1. **Copy files to DAO app:**

```bash
# Backend
cp -r <path-to>/spiritdao_chatbot/services \
     <repo>/src/sensemaker/

# Frontend (create new component)
# Use widget.html as reference for React component
```

2. **Create React component:**

```jsx
// components/SensemakerChat.jsx
import { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';

export default function SensemakerChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const sendMessage = async (query) => {
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: query }]);

    try {
      const response = await fetch('https://spiritdao.pythonanywhere.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, session_id: sessionId })
      });

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      setSessionId(data.session_id);
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sensemaker-chat">
      {/* Implement UI based on widget.html */}
    </div>
  );
}
```

3. **Add to DAO app routes:**

```jsx
// In your router
<Route path="/sensemaker" element={<SensemakerChat />} />
```

### Integration Option 3: Full Migration (Advanced)

**Pros:**
- Complete control
- Shared infrastructure
- Unified deployment

**Cons:**
- Requires backend integration
- Database schema changes
- Complex migration

**Implementation Steps:**

1. **Copy Python services:**

```bash
cp -r spiritdao_chatbot/services commapp/src/sensemaker/
```

2. **Add Flask blueprints to DAO app:**

```python
# In your DAO Flask app
from sensemaker.services.rag_service import rag_query
from sensemaker.services.conversation_manager import ConversationManager

# Create blueprint
sensemaker_bp = Blueprint('sensemaker', __name__, url_prefix='/api/sensemaker')

@sensemaker_bp.route('/chat', methods=['POST'])
def chat():
    # Implement using existing rag_query function
    pass
```

3. **Migrate conversation management to database:**

```python
# Create new model
class SensemakerConversation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(36), unique=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    history = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)
```

4. **Update environment variables:**

Add to DAO app's `.env`:

```bash
OPENAI_API_KEY=sk-proj-...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=spiritdao-books
```

### Recommended Approach

For **immediate deployment:** Use **Option 1** (Iframe Embed)

For **future DAO integration:** Plan **Option 2** (API Integration) with:
- Custom React component matching DAO design system
- Shared user authentication (link sessions to DAO user IDs)
- Unified navigation (chatbot as DAO app feature)

---

## Configuration & Environment

### Environment Variables

Required in `.env` file:

```bash
# OpenAI API Configuration
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx

# Pinecone Configuration
PINECONE_API_KEY=pcsk_xxxxxxxxxxxxxxxxxxxxx
PINECONE_INDEX_NAME=spiritdao-books

# Flask Configuration
SECRET_KEY=your-secret-key-change-in-production
FLASK_ENV=production
```

### PythonAnywhere Configuration

**Web Tab Settings:**

- **Source code:** `/home/SpiritDAO/spiritdao_chatbot`
- **Working directory:** `/home/SpiritDAO/spiritdao_chatbot`
- **WSGI file:** `/var/www/spiritdao_pythonanywhere_com_wsgi.py`
- **Virtualenv:** `/home/SpiritDAO/spiritdao_chatbot/venv`
- **Python version:** 3.10

**WSGI File Contents:**

```python
import sys
import os

# Add project directory to path
project_home = '/home/SpiritDAO/spiritdao_chatbot'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Load environment variables
from dotenv import load_dotenv
load_dotenv(os.path.join(project_home, '.env'))

# Import Flask app
from app import app as application
```

### Dependencies

From `requirements.txt`:

```
Flask==3.0.0
flask-cors==4.0.0
python-dotenv==1.0.0
openai>=2.0.0
pinecone-client==5.0.1
gunicorn==21.2.0
PyPDF2==3.0.1
```

**Installation:**

```bash
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

---

## Deployment History

### Timeline

**2025-10-19 - Initial Development**
- Created standalone Flask chatbot structure
- Set up Pinecone index (`spiritdao-books`)
- Configured OpenAI integration

**2025-10-19 - Dependency Resolution**
- Fixed Pinecone version compatibility (3.0.0 → 5.0.1)
- Upgraded OpenAI library (1.54.0 → 2.5.0)
- Updated requirements.txt

**2025-10-19 - PythonAnywhere Setup**
- Uploaded code to spiritdao.pythonanywhere.com
- Configured WSGI file
- Hit Pinecone connection issues (free tier firewall)

**2025-10-19 - Paid Tier Upgrade**
- Upgraded PythonAnywhere to paid tier ($5/month)
- Implemented lazy Pinecone initialization
- Successfully connected to external APIs

**2025-10-19 - Document Upload**
- Initial upload had chunking infinite loop bug
- Fixed chunking algorithm with forward progress checks
- Uploaded 9,667 vectors from 7 PDFs

**2025-10-19 - RAG Optimization**
- Tuned retrieval parameters (top_k=12, threshold=0.5)
- Added Temporal Naturalism system prompt (132 lines)
- Tested with "What are the eight dignities?" query

**2025-10-19 - Source Name Mapping**
- Created `SOURCE_NAME_MAPPING` dictionary
- Mapped filenames to proper book titles with authors

**2025-10-19 - Feature Additions**
- Added voice input (Web Speech API)
- Added copy/share buttons
- Integrated Markdown rendering (marked.js)

**2025-10-19 - Branding & UI**
- Applied SpiritDAO color palette
- Rebranded to "Sensemaker AI"
- Replaced emojis with Lucide React icons
- Improved mobile responsiveness

**2025-10-19 - Final Touches**
- Added 3 starter question buttons
- Fixed layout issues (restored chat-messages container)
- Removed blockquote border styling

### Known Issues & Resolutions

**Issue 1: Chunking Infinite Loop**
- **Problem:** 100,000+ chunks from single PDF
- **Cause:** Overlap logic not ensuring forward progress
- **Fix:** Added safety check `if new_start <= start: new_start = start + chunk_size`

**Issue 2: Page Numbers Incorrect**
- **Problem:** PyPDF2 doesn't track actual page numbers (counts from 0, ignores front matter)
- **Status:** Unresolved (low priority)
- **Workaround:** Remove page references or manually map page numbers

**Issue 3: PythonAnywhere Firewall**
- **Problem:** Free tier blocks Pinecone connections
- **Fix:** Upgraded to paid tier + lazy initialization

**Issue 4: No Relevant Context Found**
- **Problem:** Initial queries returned no results
- **Cause:** Threshold too high (0.7), top_k too low (5)
- **Fix:** Lowered threshold to 0.5, increased top_k to 12

---

## Future Enhancements

### Phase 1: Content Expansion

- [ ] Add DAO governance documents (separate namespace)
- [ ] Upload remaining SpiritDAO library (20+ books)
- [ ] Implement page number correction system
- [ ] Add metadata filtering (filter by author, book, date)

### Phase 2: Feature Improvements

- [ ] Add citation links (deep links to source PDFs)
- [ ] Implement conversation export (PDF/TXT download)
- [ ] Add "related questions" suggestions
- [ ] Multi-language support (Spanish, Portuguese)

### Phase 3: DAO Integration

- [ ] Migrate to DAO app infrastructure
- [ ] Link conversations to DAO user accounts
- [ ] Add role-based access control (public vs member content)
- [ ] Integrate with DAO voting (e.g., "What does Temporal Naturalism say about this proposal?")

### Phase 4: Advanced RAG

- [ ] Implement re-ranking algorithm (e.g., Cohere Rerank)
- [ ] Add hybrid search (keyword + vector)
- [ ] Enable multi-hop reasoning (follow-up questions)
- [ ] Fine-tune embedding model on SpiritDAO corpus

### Phase 5: Analytics

- [ ] Track most-asked questions
- [ ] Monitor response quality (user feedback)
- [ ] Usage analytics dashboard
- [ ] A/B test different system prompts

---

## Embedding Code Reference

### For spiritdao.org (Primary Site)

```html
<!-- Full-page embed -->
<div style="max-width: 1000px; margin: 60px auto; padding: 20px;">
  <h1 style="text-align: center; color: #2E3F4F; margin-bottom: 10px;">
    Sensemaker AI
  </h1>
  <p style="text-align: center; color: #4a5568; margin-bottom: 30px;">
    Explore our library of Temporal Naturalism philosophy
  </p>
  <iframe
    src="https://spiritdao.pythonanywhere.com/widget"
    width="100%"
    height="700px"
    style="border: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"
    title="Sensemaker AI Chatbot"
  ></iframe>
</div>
```

### For Second Website (Floating Widget)

```html
<!-- Add this anywhere in your HTML -->
<style>
  #sensemaker-floating {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 400px;
    height: 600px;
    border: none;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(46, 63, 79, 0.3);
    z-index: 9999;
    transition: transform 0.3s ease;
  }

  #sensemaker-floating.minimized {
    transform: translateY(calc(100% - 60px));
  }

  @media (max-width: 768px) {
    #sensemaker-floating {
      bottom: 10px;
      right: 10px;
      left: 10px;
      width: auto;
      height: 500px;
    }
  }
</style>

<iframe
  id="sensemaker-floating"
  src="https://spiritdao.pythonanywhere.com/widget"
  title="Sensemaker AI"
></iframe>
```

### WordPress Shortcode (if applicable)

If either site uses WordPress, create a custom shortcode:

```php
// Add to functions.php
function sensemaker_ai_shortcode() {
    return '<iframe
        src="https://spiritdao.pythonanywhere.com/widget"
        width="100%"
        height="700px"
        style="border: none; border-radius: 12px;"
        title="Sensemaker AI">
    </iframe>';
}
add_shortcode('sensemaker', 'sensemaker_ai_shortcode');

// Usage in posts/pages: [sensemaker]
```

---

## Cost Estimates

### Monthly Operational Costs

**PythonAnywhere Hosting:**
- Plan: Hacker ($5/month)
- Includes: 2 CPU cores, 2GB RAM, unlimited bandwidth

**OpenAI API:**
- Embeddings: ~$0.02 per 1,000 queries (text-embedding-3-small)
- Chat: ~$0.10 per 1,000 queries (gpt-4o-mini)
- **Estimated:** $10-30/month for 1,000-3,000 queries

**Pinecone:**
- Plan: Starter (Free)
- Includes: 100K vectors, serverless queries
- **Cost:** $0/month (within limits)

**Total:** ~$15-35/month

### Scaling Considerations

**If traffic exceeds 5,000 queries/month:**
- Consider caching frequent queries
- Implement rate limiting
- Upgrade to OpenAI batch API for cost savings

**If vector count exceeds 100K:**
- Upgrade Pinecone to paid tier (~$70/month for 500K vectors)
- Or implement vector pruning (remove low-quality chunks)

---

## Support & Maintenance

### Log Monitoring

**PythonAnywhere Logs:**
- Error log: `/var/log/spiritdao.pythonanywhere.com.error.log`
- Access log: `/var/log/spiritdao.pythonanywhere.com.access.log`

**Key log messages:**

```bash
# Successful query
INFO:__main__:Chat query: What is Temporal Naturalism...
INFO:services.rag_service:Pinecone returned 12 results for query
INFO:services.rag_service:Returning 8 contexts after filtering

# Error patterns
ERROR:services.rag_service:Knowledge base search error: Connection refused
ERROR:__main__:Chat error: [error details]
```

### Health Monitoring

**Automated check:**

```bash
curl https://spiritdao.pythonanywhere.com/api/health
# Expected: {"status":"healthy","service":"SpiritDAO Chatbot","version":"1.0.0"}
```

**Set up cron job (optional):**

```bash
# Check health every 5 minutes
*/5 * * * * curl -s https://spiritdao.pythonanywhere.com/api/health | grep -q healthy || echo "Sensemaker AI is down!" | mail -s "Alert" admin@spiritdao.org
```

### Troubleshooting Guide

**Problem:** Chatbot returns "No relevant context found"

**Diagnosis:**
1. Check Pinecone connection: `python -c "from services.rag_service import get_pinecone_index; print(get_pinecone_index().describe_index_stats())"`
2. Verify vector count (should be 9,667)
3. Check similarity threshold in `rag_service.py` (should be 0.5)

**Solution:** Adjust `top_k` or `threshold` in `search_knowledge_base()`

---

**Problem:** 500 Internal Server Error

**Diagnosis:**
1. Check error log: `tail -f /var/log/spiritdao.pythonanywhere.com.error.log`
2. Verify environment variables: `echo $OPENAI_API_KEY`
3. Test Pinecone connection

**Solution:** Check API keys, restart web app in PythonAnywhere dashboard

---

**Problem:** Slow response times (>10 seconds)

**Diagnosis:**
1. Check OpenAI API status: https://status.openai.com
2. Monitor Pinecone query latency in logs
3. Test embedding generation speed

**Solution:**
- Reduce `top_k` to 8 (faster retrieval)
- Reduce `max_tokens` to 600 (faster generation)
- Implement response caching for common queries

---

## Appendix: Complete Code Audit

### Critical Files for DAO Integration

**1. rag_service.py** (247 lines)
- Contains all RAG logic
- **Dependencies:** openai, pinecone, os, logging
- **External Calls:** OpenAI API, Pinecone API
- **State:** Lazy-initialized Pinecone client (global variables)
- **Integration Notes:** Can be imported as module, no Flask dependencies

**2. conversation_manager.py** (65 lines)
- Manages session state
- **Dependencies:** uuid, datetime, logging
- **Storage:** In-memory dictionary (not persistent)
- **Integration Notes:** Replace with database-backed sessions for production

**3. app.py** (107 lines)
- Flask application routes
- **Dependencies:** flask, flask-cors, dotenv
- **Integration Notes:** Can be converted to Flask blueprints for DAO app

**4. widget.html** (591 lines)
- Complete chat interface
- **Dependencies:** marked.js (CDN), lucide icons (CDN)
- **Integration Notes:** Can be converted to React component with minimal changes

**5. upload_documents.py** (289 lines)
- Standalone script (no server dependencies)
- **Dependencies:** openai, pinecone, PyPDF2, pathlib
- **Integration Notes:** Can be run as CLI tool or integrated as admin feature

### Source Name Mapping Reference

```python
SOURCE_NAME_MAPPING = {
    'FINAL TEXT FILE_World and Us, The (1)': 'The World and Us by Roberto Mangabeira Unger',
    'governable-spaces': 'Governable Spaces',
    'Plurality-english': 'Plurality: The Future of Collaborative Technology and Democracy',
    'Self-Actualization in the Age of Crisis PDF': 'Self-Actualization in the Age of Crisis by Ron Rivers',
    'the-religion-of-the-future': 'The Religion of the Future by Roberto Mangabeira Unger',
    'the-singular-universe-and-the-reality-of-time': 'The Singular Universe and the Reality of Time by Roberto Mangabeira Unger and Lee Smolin',
    'Time Reborn - Lee Smolin': 'Time Reborn by Lee Smolin'
}
```

**To add new sources:** Update this dictionary in `rag_service.py` before uploading documents.

---

## Contact & Credits

**Developed by:** Claude Code (Anthropic)
**Project Owner:** SpiritDAO
**Deployment Date:** October 19, 2025
**Version:** 1.0.0

**Technologies:**
- Flask 3.0.0
- OpenAI GPT-4o-mini + text-embedding-3-small
- Pinecone 5.0.1
- Marked.js (markdown rendering)
- Lucide Icons (UI icons)

**Special Thanks:**
- Roberto Mangabeira Unger (philosophical framework)
- Lee Smolin (cosmological foundations)
- Ron Rivers (contemporary applications)

---

**END OF DOCUMENTATION**

*Last Updated: 2025-10-19*
*Next Review: 2025-11-19*
