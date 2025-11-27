"""
SpiritDAO Chatbot - Standalone Flask Application
Academic document Q&A chatbot using Pinecone + OpenAI
"""
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Import services
from services.rag_service import rag_query
from services.conversation_manager import ConversationManager

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'spiritdao-secret-key-change-in-production')

# Enable CORS for embedding on Webflow
CORS(app, resources={
    r"/api/*": {"origins": "*"},
    r"/widget": {"origins": "*"}
})

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize conversation manager
conversation_manager = ConversationManager()


@app.route('/')
def index():
    """Home page - simple info about the chatbot"""
    return render_template('index.html')


@app.route('/widget')
def widget():
    """Embeddable chat widget"""
    return render_template('widget.html')


@app.route('/api/chat', methods=['POST'])
def chat():
    """
    Main chat endpoint
    Accepts: {"query": "user question", "session_id": "optional-session-id"}
    Returns: {"response": "AI answer", "session_id": "session-id"}
    """
    try:
        data = request.json
        query = data.get('query', '').strip()
        session_id = data.get('session_id')

        if not query:
            return jsonify({"error": "Query is required"}), 400

        logger.info(f"Chat query: {query[:100]}...")

        # Get or create conversation history
        conversation = conversation_manager.get_conversation(session_id)

        # Query RAG system
        response = rag_query(query, conversation['history'])

        # Update conversation history
        conversation['history'].append({"role": "user", "content": query})
        conversation['history'].append({"role": "assistant", "content": response})

        # Keep only last 10 messages (5 exchanges)
        if len(conversation['history']) > 10:
            conversation['history'] = conversation['history'][-10:]

        return jsonify({
            "response": response,
            "session_id": conversation['session_id']
        })

    except Exception as e:
        logger.error(f"Chat error: {str(e)}", exc_info=True)
        return jsonify({"error": "An error occurred processing your request"}), 500


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "SpiritDAO Chatbot",
        "version": "1.0.0"
    })


@app.route('/embed-code')
def embed_code():
    """Page showing how to embed the widget"""
    return render_template('embed_code.html')


if __name__ == '__main__':
    # For local development only
    app.run(debug=True, port=5000)
