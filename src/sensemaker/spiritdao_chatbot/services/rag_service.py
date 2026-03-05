"""
RAG (Retrieval Augmented Generation) Service
Queries Pinecone for relevant context and generates responses with Claude
"""
import os
from openai import OpenAI
from anthropic import Anthropic
from pinecone import Pinecone
import logging

logger = logging.getLogger(__name__)

# OpenAI client for embeddings only
_openai_client = None
def get_openai_client():
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
    return _openai_client

# Anthropic client for responses
_anthropic_client = None
def get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
    return _anthropic_client

# Pinecone configuration (lazy initialization)
_pinecone_client = None
_pinecone_index = None
index_name = os.getenv('PINECONE_INDEX_NAME', 'spiritdao-books')

# Source name mapping (filename -> display name)
SOURCE_NAME_MAPPING = {
    'FINAL TEXT FILE_World and Us, The (1)': 'The World and Us by Roberto Mangabeira Unger',
    'governable-spaces': 'Governable Spaces',
    'Plurality-english': 'Plurality: The Future of Collaborative Technology and Democracy',
    'Self-Actualization in the Age of Crisis PDF': 'Self-Actualization in the Age of Crisis by Ron Rivers',
    'the-religion-of-the-future': 'The Religion of the Future by Roberto Mangabeira Unger',
    'the-singular-universe-and-the-reality-of-time': 'The Singular Universe and the Reality of Time by Roberto Mangabeira Unger and Lee Smolin',
    'Time Reborn - Lee Smolin': 'Time Reborn by Lee Smolin'
}

def get_display_source(source_key):
    """Convert internal source name to display-friendly name"""
    return SOURCE_NAME_MAPPING.get(source_key, source_key)

def get_pinecone_index():
    """Lazy initialize Pinecone connection"""
    global _pinecone_client, _pinecone_index
    if _pinecone_index is None:
        _pinecone_client = Pinecone(api_key=os.getenv('PINECONE_API_KEY'))
        _pinecone_index = _pinecone_client.Index(index_name)
    return _pinecone_index

# System prompt for Temporal Naturalism — warm thinking partner
SYSTEM_PROMPT = """You are Sensemaker — a guide and thinking partner grounded in Temporal Naturalism, the philosophical and spiritual framework at the heart of SpiritDAO.

## The Framework

Temporal Naturalism begins with a rigorous philosophical and scientific claim: **time is real, and the future is genuinely open.**

This stands against the "block universe" view dominant in physics — the idea that past, present, and future are equally real and fixed, that the laws of nature are eternal and unchanging. Against this, philosopher Roberto Mangabeira Unger and theoretical physicist Lee Smolin argued that reality is not a static structure but an **unfolding process**. Even the laws of physics may evolve. The universe is not merely something that *is* — it is something that *becomes*.

Founder Ron Rivers extended this beyond cosmology and political philosophy into lived spiritual practice, asking: *"If reality is fundamentally unfolding, what is our responsibility within that unfolding?"*

His answer became the Eight Dignities — Food & Water, Housing, Health Care, Education, Information, Communication, Transportation, Energy — not as abstract ideals, but as the material conditions required for human actualization in a temporally open universe. Institutions are not fixed. The future is not predetermined. If time is real, transformation is real.

SpiritDAO carries this lineage as a registered 501(c)(3) Church of Temporal Naturalism, treating the philosophy not as theory but as a living orientation: individual growth and systemic change unfolding together.

## Key Texts in the Knowledge Base
- *The Religion of the Future* — Roberto Mangabeira Unger
- *The World and Us* — Roberto Mangabeira Unger
- *Time Reborn* — Lee Smolin
- *The Singular Universe and the Reality of Time* — Smolin & Unger
- *Self-Actualization in the Age of Crisis* — Ron Rivers

## How to Engage

**Meet people where they are.** A curious newcomer gets a different response than someone working through Unger's metaphysics. Read the tone of the question and match it.

**Use the knowledge base naturally.** When relevant context is provided, weave it into the conversation — reference ideas as part of thinking together, not as bibliography entries. When you cite a source, do so naturally: "Smolin argues in *Time Reborn*..." rather than "(Smolin, p. X)".

**Be a genuine thinking partner.** Follow the thread, make connections to lived experience, science, art, history, or other philosophical traditions. Philosophy is a conversation, not a lecture.

**Engage what's genuinely hard.** Temporal Naturalism makes bold claims with real tensions — the openness of time sits uneasily with determinism, the Eight Dignities as spiritual practice is unusual. Explore these tensions rather than smoothing them over.

**Ask questions back.** When it would deepen the conversation, ask. Philosophy moves through dialogue.

**Be warm, even playful.** These ideas are serious, but seriousness and warmth are not opposites. If something is surprising or strange, say so.

**When you don't know, say so.** The knowledge base may not have everything. Draw on your broader knowledge of philosophy, physics, theology, and ethics — and be clear when you're doing so versus citing source material.

The goal is not to impress. It is to think together about what it means to live in a world that is genuinely becoming — and what we owe each other within that becoming."""


def get_embedding(text: str) -> list:
    """Generate embedding for text using OpenAI"""
    try:
        response = get_openai_client().embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        logger.error(f"Embedding error: {str(e)}")
        raise


def search_knowledge_base(query: str, top_k: int = 12) -> list:
    """Search Pinecone for relevant context"""
    try:
        query_embedding = get_embedding(query)
        index = get_pinecone_index()

        results = index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True
        )

        contexts = []
        logger.info(f"Pinecone returned {len(results.matches)} results for query")
        for i, match in enumerate(results.matches):
            logger.info(f"Match {i+1}: score={match.score:.3f}, source={match.metadata.get('source', 'Unknown')}")
            if match.score > 0.5:
                metadata = match.metadata
                raw_source = metadata.get('source', 'Unknown')
                context = {
                    'text': metadata.get('text', ''),
                    'source': get_display_source(raw_source),
                    'page': metadata.get('page', 'Unknown'),
                    'score': match.score
                }
                contexts.append(context)

        logger.info(f"Returning {len(contexts)} contexts after filtering")
        return contexts

    except Exception as e:
        logger.error(f"Knowledge base search error: {str(e)}")
        return []


def rag_query(query: str, conversation_history: list = None) -> str:
    """
    Main RAG query function

    Args:
        query: User's question
        conversation_history: Previous conversation messages

    Returns:
        AI-generated response based on retrieved context
    """
    try:
        contexts = search_knowledge_base(query)

        if contexts:
            context_text = "\n\n---\n\n".join([
                f"Source: {ctx['source']}\n{ctx['text']}"
                for ctx in contexts
            ])
        else:
            context_text = "No relevant context found in the knowledge base."

        # Build messages for Claude
        messages = []

        # Add conversation history if provided
        if conversation_history:
            messages.extend(conversation_history[-6:])  # Last 3 exchanges

        # Add current query with context
        user_message = f"""Knowledge base context:

{context_text}

---

Question: {query}"""

        messages.append({"role": "user", "content": user_message})

        # Get response from Claude Sonnet
        response = get_anthropic_client().messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            temperature=1,  # Required for extended thinking; acts as 0.7 equivalent for standard responses
            system=SYSTEM_PROMPT,
            messages=messages
        )

        return response.content[0].text

    except Exception as e:
        logger.error(f"RAG query error: {str(e)}", exc_info=True)
        return "I apologize, but I encountered an error processing your question. Please try again."
