"""
Simple conversation manager to track user sessions
Uses in-memory storage (for production, consider Redis or database)
"""
import uuid
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class ConversationManager:
    """Manages conversation sessions and history"""

    def __init__(self):
        self.conversations = {}
        self.cleanup_interval = timedelta(hours=2)

    def get_conversation(self, session_id=None):
        """
        Get existing conversation or create new one

        Args:
            session_id: Optional session ID

        Returns:
            dict with session_id, history, and created_at
        """
        # Create new session if none provided
        if not session_id:
            session_id = str(uuid.uuid4())
            self.conversations[session_id] = {
                'session_id': session_id,
                'history': [],
                'created_at': datetime.utcnow()
            }
            logger.info(f"Created new session: {session_id}")
            return self.conversations[session_id]

        # Return existing session or create new one
        if session_id in self.conversations:
            return self.conversations[session_id]
        else:
            self.conversations[session_id] = {
                'session_id': session_id,
                'history': [],
                'created_at': datetime.utcnow()
            }
            return self.conversations[session_id]

    def cleanup_old_sessions(self):
        """Remove sessions older than cleanup_interval"""
        now = datetime.utcnow()
        to_remove = []

        for session_id, session in self.conversations.items():
            if now - session['created_at'] > self.cleanup_interval:
                to_remove.append(session_id)

        for session_id in to_remove:
            del self.conversations[session_id]
            logger.info(f"Cleaned up session: {session_id}")

        return len(to_remove)
