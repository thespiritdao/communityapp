# SpiritDAO Chatbot - Deployment Guide for PythonAnywhere

## Step-by-Step Deployment

### Step 1: Prepare Your Files Locally

1. **Update `.env` file** with your actual API keys:
   ```
   OPENAI_API_KEY=sk-proj-...
   PINECONE_API_KEY=pc...
   PINECONE_INDEX_NAME=spiritdao-books
   SECRET_KEY=generate-random-string-here
   ```

2. **Create a ZIP file** of the entire `spiritdao_chatbot` folder
   - Right-click folder → Send to → Compressed (zipped) folder
   - Or use: `tar -czf spiritdao.tar.gz spiritdao_chatbot/`

### Step 2: Upload to PythonAnywhere

1. **Log into** https://www.pythonanywhere.com (spiritdao account)

2. **Go to Files tab**
   - Navigate to `/home/spiritdao/` (or your username)
   - Click "Upload a file"
   - Upload your ZIP file

3. **Extract files**:
   ```bash
   cd /home/spiritdao
   unzip spiritdao.tar.gz
   # or tar -xzf spiritdao.tar.gz

   # You should now have: /home/spiritdao/spiritdao_chatbot/
   ```

### Step 3: Set Up Virtual Environment

```bash
cd /home/spiritdao/spiritdao_chatbot
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

**Note**: Installation may take 5-10 minutes.

### Step 4: Configure Web App

1. **Go to Web tab** in PythonAnywhere

2. **Click "Add a new web app"**
   - Choose "Manual configuration"
   - Select Python 3.10

3. **Configure paths**:
   - **Source code**: `/home/spiritdao/spiritdao_chatbot`
   - **Working directory**: `/home/spiritdao/spiritdao_chatbot`
   - **Virtualenv**: `/home/spiritdao/spiritdao_chatbot/venv`

4. **Edit WSGI configuration file**:
   - Click on WSGI configuration file link
   - Delete ALL existing content
   - Paste this:

```python
import sys
import os

# IMPORTANT: Change 'spiritdao' to your actual PythonAnywhere username
project_home = '/home/spiritdao/spiritdao_chatbot'

if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Load environment variables
from dotenv import load_dotenv
env_path = os.path.join(project_home, '.env')
load_dotenv(dotenv_path=env_path)

# Import Flask app
from app import app as application
```

5. **Save** the WSGI file

6. **Reload** the web app (green button at top)

### Step 5: Verify Deployment

Visit these URLs to test:

1. **Home page**: https://spiritdao.pythonanywhere.com/
2. **Chat widget**: https://spiritdao.pythonanywhere.com/widget
3. **Health check**: https://spiritdao.pythonanywhere.com/api/health

You should see:
- Home page with links
- Working chat widget
- Health check returning JSON: `{"status": "healthy"}`

### Step 6: Upload Documents to Pinecone

```bash
cd /home/spiritdao/spiritdao_chatbot
source venv/bin/activate

# Create documents folder
mkdir documents

# Upload your PDFs/TXT files to the documents folder
# (Use Files tab in PythonAnywhere)

# Run upload script
python upload_documents.py ./documents
```

**This will**:
- Create Pinecone index `spiritdao-books`
- Split documents into chunks
- Generate embeddings
- Upload to Pinecone

**Expected output**:
```
INFO:__main__:Creating index: spiritdao-books
INFO:__main__:Processing: book1.pdf
INFO:__main__:Split book1.pdf into 45 chunks
INFO:__main__:Uploaded 45 vectors from book1.pdf
...
INFO:__main__:Upload complete!
```

### Step 7: Test the Chatbot

1. Go to https://spiritdao.pythonanywhere.com/widget
2. Ask a question about your uploaded documents
3. Verify it returns relevant answers

### Step 8: Embed on Webflow

1. **Get embed code**: https://spiritdao.pythonanywhere.com/embed-code

2. **In Webflow**:
   - Add an "Embed" element to your page
   - Paste this code:
   ```html
   <iframe
     src="https://spiritdao.pythonanywhere.com/widget"
     width="100%"
     height="600px"
     style="border: none; border-radius: 10px;"
   ></iframe>
   ```
   - Publish your site

### Step 9: (Optional) Custom Domain

To use `chatbot.spiritdao.org`:

1. **In DreamHost**:
   - Add CNAME record: `chatbot` → `spiritdao.pythonanywhere.com`

2. **Wait 24 hours** for DNS propagation

3. **Update embed code** to use `chatbot.spiritdao.org`

## Troubleshooting

### Error: "ModuleNotFoundError"
```bash
# Reinstall dependencies
cd /home/spiritdao/spiritdao_chatbot
source venv/bin/activate
pip install -r requirements.txt
```

### Error: "ImportError: attempted relative import"
- Check WSGI file paths are correct
- Ensure `project_home` matches your directory
- Reload web app

### Chat returns "No relevant context"
- Upload documents to Pinecone first
- Verify `PINECONE_INDEX_NAME` in `.env` matches
- Check documents uploaded successfully

### Widget not loading
- Check error log in PythonAnywhere Web tab
- Verify all files uploaded correctly
- Ensure virtual environment activated

## File Structure on Server

```
/home/spiritdao/
└── spiritdao_chatbot/
    ├── venv/                 # Virtual environment
    ├── app.py
    ├── requirements.txt
    ├── .env                  # Your API keys
    ├── upload_documents.py
    ├── services/
    │   ├── rag_service.py
    │   └── conversation_manager.py
    ├── templates/
    │   ├── index.html
    │   ├── widget.html
    │   └── embed_code.html
    └── documents/            # Your PDFs/TXT files
```

## Maintenance

### Add New Documents
```bash
cd /home/spiritdao/spiritdao_chatbot
source venv/bin/activate

# Upload new PDFs to documents/ folder
python upload_documents.py ./documents
```

### View Logs
- Go to Web tab → Error log
- Check for any Python errors

### Update Code
1. Make changes locally
2. Create new ZIP
3. Upload to PythonAnywhere
4. Extract and overwrite files
5. Reload web app

## Support

For issues, check:
1. Error log in Web tab
2. `.env` file has all keys
3. Virtual environment activated
4. Documents uploaded to Pinecone
