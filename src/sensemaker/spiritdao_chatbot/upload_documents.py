"""
Upload documents to Pinecone knowledge base
Supports PDF, TXT, and DOCX files
"""
import os
import sys
from pathlib import Path
from openai import OpenAI
from pinecone import Pinecone, ServerlessSpec
from dotenv import load_dotenv
import hashlib
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize clients
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
pc = Pinecone(api_key=os.getenv('PINECONE_API_KEY'))
index_name = os.getenv('PINECONE_INDEX_NAME', 'spiritdao-books')


def create_index_if_not_exists():
    """Create Pinecone index if it doesn't exist"""
    try:
        # Check if index exists
        existing_indexes = [idx.name for idx in pc.list_indexes()]

        if index_name not in existing_indexes:
            logger.info(f"Creating index: {index_name}")
            pc.create_index(
                name=index_name,
                dimension=1536,  # text-embedding-3-small dimension
                metric='cosine',
                spec=ServerlessSpec(
                    cloud='aws',
                    region='us-east-1'
                )
            )
            logger.info(f"Index {index_name} created successfully")
        else:
            logger.info(f"Index {index_name} already exists")

        return pc.Index(index_name)

    except Exception as e:
        logger.error(f"Error creating index: {str(e)}")
        raise


def get_embedding(text: str) -> list:
    """Generate embedding using OpenAI"""
    try:
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        logger.error(f"Embedding error: {str(e)}")
        raise


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list:
    """
    Split text into overlapping chunks

    Args:
        text: Full text to chunk
        chunk_size: Maximum size of each chunk
        overlap: Number of characters to overlap between chunks

    Returns:
        List of text chunks
    """
    chunks = []
    text_length = len(text)
    logger.info(f"Starting chunking of {text_length} characters...")

    start = 0
    iteration = 0

    while start < text_length:
        iteration += 1
        if iteration % 100 == 0:
            logger.info(f"Chunking iteration {iteration}, position {start}/{text_length}")

        # Calculate end position
        end = min(start + chunk_size, text_length)

        # Try to break at sentence end (only if not at the end of text)
        if end < text_length:
            # Look for sentence endings in the last 200 chars of the chunk
            search_start = max(start, end - 200)
            chunk_section = text[search_start:end]

            last_period = chunk_section.rfind('. ')
            last_question = chunk_section.rfind('? ')
            last_exclaim = chunk_section.rfind('! ')

            break_point = max(last_period, last_question, last_exclaim)

            if break_point > 0:
                end = search_start + break_point + 2

        # Extract chunk
        chunk = text[start:end].strip()
        if chunk and len(chunk) > 50:  # Only add chunks with substantial content
            chunks.append(chunk)

        # Move to next chunk with overlap
        new_start = end - overlap

        # Ensure we're making progress
        if new_start <= start:
            new_start = start + chunk_size

        start = new_start

        # Safety check to prevent infinite loop
        if iteration > 10000:
            logger.error(f"Chunking iteration limit reached at {iteration}. Breaking to prevent infinite loop.")
            break

    logger.info(f"Chunking complete: {len(chunks)} chunks created")
    return chunks


def read_text_file(file_path: Path) -> str:
    """Read text from TXT file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        logger.error(f"Error reading {file_path}: {str(e)}")
        return None


def read_pdf_file(file_path: Path) -> str:
    """Read text from PDF file"""
    try:
        import PyPDF2
        logger.info(f"Opening PDF: {file_path.name}")
        text = []
        with open(file_path, 'rb') as f:
            pdf_reader = PyPDF2.PdfReader(f)
            num_pages = len(pdf_reader.pages)
            logger.info(f"PDF has {num_pages} pages, extracting text...")
            for i, page in enumerate(pdf_reader.pages):
                if i % 10 == 0:  # Log every 10 pages
                    logger.info(f"Processing page {i}/{num_pages}")
                text.append(page.extract_text())
        logger.info(f"Finished extracting text from {file_path.name}")
        return '\n\n'.join(text)
    except ImportError:
        logger.error("PyPDF2 not installed. Run: pip install PyPDF2")
        return None
    except Exception as e:
        logger.error(f"Error reading {file_path}: {str(e)}")
        return None


def upload_document(index, file_path: Path, source_name: str = None):
    """
    Upload a single document to Pinecone

    Args:
        index: Pinecone index
        file_path: Path to document
        source_name: Optional custom source name
    """
    logger.info(f"Processing: {file_path.name}")

    # Determine file type and read content
    suffix = file_path.suffix.lower()

    if suffix == '.txt':
        text = read_text_file(file_path)
    elif suffix == '.pdf':
        text = read_pdf_file(file_path)
    else:
        logger.warning(f"Unsupported file type: {suffix}")
        return

    if not text:
        logger.warning(f"No text extracted from {file_path.name}")
        return

    # Use custom source name or filename
    source = source_name or file_path.stem

    # Split into chunks
    logger.info(f"Chunking text from {file_path.name}...")
    chunks = chunk_text(text)
    logger.info(f"Split {file_path.name} into {len(chunks)} chunks")

    # Upload each chunk
    vectors = []
    logger.info(f"Generating embeddings for {len(chunks)} chunks...")
    for i, chunk in enumerate(chunks):
        if i % 50 == 0:  # Log every 50 chunks
            logger.info(f"Processing chunk {i}/{len(chunks)}")

        # Generate unique ID
        chunk_id = hashlib.md5(f"{source}_{i}".encode()).hexdigest()

        # Get embedding
        embedding = get_embedding(chunk)

        # Prepare metadata
        metadata = {
            'text': chunk,
            'source': source,
            'chunk_index': i,
            'total_chunks': len(chunks)
        }

        vectors.append({
            'id': chunk_id,
            'values': embedding,
            'metadata': metadata
        })

    logger.info(f"Finished generating all embeddings for {file_path.name}")

    # Upsert to Pinecone in batches
    batch_size = 100
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i:i + batch_size]
        index.upsert(vectors=batch)

    logger.info(f"Uploaded {len(vectors)} vectors from {file_path.name}")


def upload_directory(directory_path: str):
    """
    Upload all supported documents from a directory

    Args:
        directory_path: Path to directory containing documents
    """
    directory = Path(directory_path)

    if not directory.exists():
        logger.error(f"Directory not found: {directory_path}")
        return

    # Create/get index
    index = create_index_if_not_exists()

    # Find all supported files
    supported_extensions = ['.txt', '.pdf']
    files = []

    for ext in supported_extensions:
        files.extend(directory.glob(f'**/*{ext}'))

    if not files:
        logger.warning(f"No supported files found in {directory_path}")
        return

    logger.info(f"Found {len(files)} files to upload")

    # Upload each file
    for file_path in files:
        upload_document(index, file_path)

    logger.info("Upload complete!")
    logger.info(f"Total documents uploaded: {len(files)}")


def main():
    """Main function"""
    if len(sys.argv) < 2:
        print("Usage: python upload_documents.py <directory_path>")
        print("Example: python upload_documents.py ./documents")
        sys.exit(1)

    directory_path = sys.argv[1]
    upload_directory(directory_path)


if __name__ == '__main__':
    main()
