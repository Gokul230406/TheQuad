"""
ChromaDB Vector Store – stores failure patterns and known fixes for fast recall.
"""
import logging
from typing import Optional
import chromadb
from chromadb.config import Settings as ChromaSettings

from backend.config import settings

logger = logging.getLogger(__name__)


class VectorStore:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        try:
            self.client = chromadb.PersistentClient(
                path=settings.CHROMA_PERSIST_DIR,
                settings=ChromaSettings(allow_reset=True)
            )
            self.failures_collection = self.client.get_or_create_collection(
                name="pipeline_failures",
                metadata={"hnsw:space": "cosine"}
            )
            self.fixes_collection = self.client.get_or_create_collection(
                name="known_fixes",
                metadata={"hnsw:space": "cosine"}
            )
            logger.info("[VectorStore] ChromaDB initialized successfully")
        except Exception as e:
            logger.error(f"[VectorStore] Failed to init ChromaDB: {e}")
            self.client = None

    async def store_failure(self, event_id: str, logs_summary: str, diagnosis: dict):
        """Store a failure pattern for future similarity search."""
        if not self.client:
            return
        try:
            self.failures_collection.add(
                documents=[logs_summary],
                metadatas=[{
                    "event_id": event_id,
                    "root_cause": diagnosis.get("root_cause", ""),
                    "failure_category": diagnosis.get("failure_category", ""),
                    "confidence": str(diagnosis.get("confidence", 0.5))
                }],
                ids=[f"failure_{event_id}"]
            )
        except Exception as e:
            logger.warning(f"[VectorStore] Store failure error: {e}")

    async def store_fix(self, event_id: str, failure_category: str,
                        root_cause: str, fix_data: dict):
        """Store a successful fix for future recall."""
        if not self.client:
            return
        try:
            doc = f"{failure_category}: {root_cause}"
            self.fixes_collection.add(
                documents=[doc],
                metadatas=[{
                    "event_id": event_id,
                    "failure_category": failure_category,
                    "fix_type": fix_data.get("fix_type", ""),
                    "fix_description": fix_data.get("fix_description", ""),
                    "fix_script": fix_data.get("fix_script", "")[:500]
                }],
                ids=[f"fix_{event_id}"]
            )
        except Exception as e:
            logger.warning(f"[VectorStore] Store fix error: {e}")

    async def search_similar_failures(self, logs: str, top_k: int = 3) -> list:
        """Find similar past failures."""
        if not self.client:
            return []
        try:
            results = self.failures_collection.query(
                query_texts=[logs[:500]],
                n_results=min(top_k, self.failures_collection.count())
            )
            return results.get("metadatas", [[]])[0]
        except Exception as e:
            logger.warning(f"[VectorStore] Search failures error: {e}")
            return []

    async def search_known_fixes(self, failure_category: str, root_cause: str,
                                  top_k: int = 2) -> list:
        """Find known fixes for a category."""
        if not self.client:
            return []
        try:
            query = f"{failure_category}: {root_cause}"
            count = self.fixes_collection.count()
            if count == 0:
                return []
            results = self.fixes_collection.query(
                query_texts=[query],
                n_results=min(top_k, count)
            )
            return results.get("metadatas", [[]])[0]
        except Exception as e:
            logger.warning(f"[VectorStore] Search fixes error: {e}")
            return []
