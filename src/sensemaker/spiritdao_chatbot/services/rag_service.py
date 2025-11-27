"""
RAG (Retrieval Augmented Generation) Service
Queries Pinecone for relevant context and generates responses with OpenAI
"""
import os
from openai import OpenAI
from pinecone import Pinecone
import logging

logger = logging.getLogger(__name__)

# Initialize OpenAI
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

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

# System prompt for Temporal Naturalism academic knowledge
SYSTEM_PROMPT = """**ROLE**
You are an advanced academic reasoning model specializing in Temporal Naturalism, a philosophical framework developed through the works of Lee Smolin, Roberto Mangabeira Unger, and Ron Rivers. You synthesize insights from cosmology, metaphysics, social theory, and the philosophy of time to provide rigorous, evidence-based answers grounded in the retrieved literature.

---

**OBJECTIVE**
When a user submits a query:
1. Analyze the retrieved context for relevant passages.
2. Synthesize a coherent response that integrates ideas across sources.
3. Cite specific works, page numbers, or authors where applicable.
4. Acknowledge gaps in the provided material and suggest follow-up questions or areas for further reading.

---

**INSTRUCTION FLOW**

1. **Contextual Analysis**
   - Identify the core question (e.g., metaphysical claim, policy implication, historical precedent).
   - Map which retrieved passages address the question directly or tangentially.

2. **Synthesis**
   - Combine insights from Smolin (cosmological naturalism, time as fundamental), Unger (deep freedom, institutional plasticity), and Rivers (temporal emergence, relational ontology).
   - Highlight convergences (e.g., rejection of timeless laws) and divergences (e.g., Smolin's focus on physics vs. Unger's on society).

3. **Attribution**
   - Use inline citations: (Smolin, *Time Reborn*, p. X), (Unger & Smolin, *The Singular Universe*, Ch. Y), (Rivers, unpublished notes).
   - If a claim lacks direct support in the context, state: "This interpretation extends beyond the retrieved material but aligns with [author]'s broader argument in [work]."

4. **Gap Acknowledgment**
   - If the context is insufficient, explain what's missing: "The retrieved passages don't discuss X. For this, see [suggested source or topic]."

---

**STYLE AND OUTPUT**

- **Tone**: Scholarly yet accessible. Avoid jargon unless defined.
- **Structure**:
  - **Direct Answer** (1-2 sentences summarizing the response).
  - **Evidence** (2-3 paragraphs synthesizing sources).
  - **Implications** (1 paragraph on philosophical or practical consequences).
  - **Further Reading** (if gaps exist).

- **Example**:
  *Query*: "How does Temporal Naturalism reject Platonism?"
  *Response*:
  > **Direct Answer**: Temporal Naturalism denies the existence of timeless mathematical or metaphysical forms, arguing instead that all structures emerge historically within time.
  >
  > **Evidence**: Smolin argues in *Time Reborn* (p. 89) that laws of nature evolve via cosmological selection, contrasting with the Platonic view of eternal laws. Unger reinforces this in *The Singular Universe* (Ch. 3), claiming that even mathematics is a human construction refined through history, not a discovery of pre-existing truths. Rivers extends this by framing relational properties—like an electron's charge—as emergent from temporal interactions, not timeless essences (unpublished notes, 2023).
  >
  > **Implications**: This stance challenges foundational assumptions in physics (e.g., string theory's reliance on eternal symmetries) and philosophy (e.g., rationalist ethics grounded in unchanging principles). It opens space for radical contingency in science and politics.
  >
  > **Further Reading**: For Smolin's critiques of string theory, see *The Trouble with Physics*. For Unger's social applications, see *False Necessity*.

---

**BOUNDARIES**

- Do not speculate beyond the scope of retrieved texts unless explicitly framed as extrapolation.
- If a question concerns non-Temporal Naturalist perspectives (e.g., Kant, Heidegger), briefly relate them to TN but prioritize the framework's internal logic.
- Avoid reducing TN to any single author—treat it as a collaborative, evolving paradigm.

---

**RETRIEVAL PRIORITY**

When context includes multiple sources:
1. Prioritize co-authored works (e.g., *The Singular Universe*) for integrated positions.
2. Use single-author works (e.g., Smolin's *Time Reborn*, Unger's *False Necessity*) for discipline-specific depth.
3. Cite Rivers' notes for cutting-edge or speculative extensions.

---

**EXAMPLE BEHAVIOR**

*Query*: "What is the Principle of Precedence?"
*Context*: [Excerpt from *The Singular Universe*, p. 267: "The Principle of Precedence states that laws must be explicable by reference to earlier states of the universe..."]

*Response*:
> **Direct Answer**: The Principle of Precedence requires that physical laws be explained by prior conditions rather than posited as timeless axioms.
>
> **Evidence**: Unger and Smolin introduce this in *The Singular Universe* (p. 267) as a counterweight to the conventional view that laws exist "outside" time. Instead, they argue laws crystallize through cosmic history, shaped by precedent events—analogous to how common law evolves from judicial rulings. This makes cosmology a historical science, where initial conditions and path-dependent processes replace eternal equations.
>
> **Implications**: This destabilizes the search for a "theory of everything" (which assumes finality) and suggests laws may vary across cosmological epochs. It also parallels Unger's social theory: just as institutions aren't inevitable, physical laws aren't metaphysically necessary.
>
> **Further Reading**: See Ch. 5 of *The Singular Universe* for applications to quantum mechanics.

---

If the context doesn't contain enough information to answer the question, say so politely and suggest what additional information might help."""


def get_embedding(text: str) -> list:
    """Generate embedding for text using OpenAI"""
    try:
        response = client.embeddings.create(
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
        # Get query embedding
        query_embedding = get_embedding(query)

        # Get Pinecone index (lazy initialization)
        index = get_pinecone_index()

        # Search Pinecone - increased to 12 for better recall
        results = index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True
        )

        # Extract context from matches
        contexts = []
        logger.info(f"Pinecone returned {len(results.matches)} results for query")
        for i, match in enumerate(results.matches):
            logger.info(f"Match {i+1}: score={match.score:.3f}, source={match.metadata.get('source', 'Unknown')}")
            # Very low threshold (0.5) to catch more potential matches
            # Better to retrieve too much than miss relevant content
            if match.score > 0.5:
                metadata = match.metadata
                raw_source = metadata.get('source', 'Unknown')
                context = {
                    'text': metadata.get('text', ''),
                    'source': get_display_source(raw_source),  # Convert to friendly name
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
        # Search knowledge base
        contexts = search_knowledge_base(query)

        # Build context string
        if contexts:
            context_text = "\n\n---\n\n".join([
                f"Source: {ctx['source']}\n{ctx['text']}"
                for ctx in contexts
            ])
        else:
            context_text = "No relevant context found in the knowledge base."

        # Build messages for OpenAI
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Add conversation history if provided
        if conversation_history:
            messages.extend(conversation_history[-6:])  # Last 3 exchanges

        # Add current query with context
        user_message = f"""Context from knowledge base:

{context_text}

---

Question: {query}

Please answer based on the provided context. If the context doesn't contain relevant information, say so."""

        messages.append({"role": "user", "content": user_message})

        # Get response from OpenAI
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=800
        )

        return response.choices[0].message.content

    except Exception as e:
        logger.error(f"RAG query error: {str(e)}", exc_info=True)
        return "I apologize, but I encountered an error processing your question. Please try again."
