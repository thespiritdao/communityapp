# SpiritDAO Chatbot - Quick Start (5 Minutes)

## What You Need
- ✅ PythonAnywhere account (spiritdao)
- ✅ OpenAI API key
- ✅ Pinecone API key
- ✅ Documents/PDFs to upload

## Deploy in 5 Steps

### 1. Upload ZIP (1 min)
1. Go to https://www.pythonanywhere.com → Files tab
2. Upload `spiritdao_chatbot.zip`
3. Run in Bash console:
```bash
cd ~
unzip spiritdao_chatbot.zip
```

### 2. Update .env (1 min)
Edit `/home/spiritdao/.env`:
```bash
nano .env
```

Replace with your actual keys:
```
OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
PINECONE_API_KEY=YOUR_PINECONE_KEY_HERE
PINECONE_INDEX_NAME=spiritdao-books
SECRET_KEY=any-random-string-123
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`

### 3. Install Dependencies (2 min)
```bash
cd ~/spiritdao_chatbot
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Configure Web App (1 min)
1. Web tab → Add new web app → Manual config → Python 3.10
2. Set paths:
   - Source: `/home/spiritdao/spiritdao_chatbot`
   - Virtualenv: `/home/spiritdao/spiritdao_chatbot/venv`
3. Edit WSGI file → Delete all → Paste:

```python
import sys, os
project_home = '/home/spiritdao/spiritdao_chatbot'
sys.path.insert(0, project_home)
from dotenv import load_dotenv
load_dotenv(os.path.join(project_home, '.env'))
from app import app as application
```

4. Save → Reload

### 5. Test (30 sec)
Visit: https://spiritdao.pythonanywhere.com/widget

## Upload Documents (Optional - 5 min)

```bash
cd ~/spiritdao_chatbot
source venv/bin/activate

# Upload PDFs to ~/spiritdao_chatbot/documents/ via Files tab

# Then run:
python upload_documents.py ./documents
```

## Done!

Your chatbot is live at: **https://spiritdao.pythonanywhere.com/widget**

Embed on Webflow: Get code at `/embed-code`

## Troubleshooting

**"Application failed to start"**
- Check .env has all keys
- Check WSGI path is `/home/spiritdao/spiritdao_chatbot`
- View error log in Web tab

**"No response from chatbot"**
- Upload documents first: `python upload_documents.py ./documents`
- Check Pinecone index name matches .env

Need help? Check full guide: `DEPLOYMENT.md`
