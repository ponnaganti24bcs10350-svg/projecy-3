/**
 * RAG Pipeline — Core Library
 *
 * Implements the full Retrieval-Augmented Generation pipeline:
 *   1. Chunking     — splits document text into overlapping chunks
 *   2. Embedding    — converts chunks to vectors via OpenAI
 *   3. Storage      — upserts vectors into Qdrant vector database
 *   4. Retrieval    — finds the most semantically similar chunks for a query
 *   5. Generation   — uses retrieved context + OpenAI LLM to answer grounded queries
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";

// ─── Constants ────────────────────────────────────────────────────────────────
const EMBEDDING_MODEL = "text-embedding-3-large";
const CHAT_MODEL = "gpt-4.1-mini";
const VECTOR_SIZE = 3072; // dimensions for text-embedding-3-large
const CHUNK_SIZE = 800;   // characters per chunk
const CHUNK_OVERLAP = 150; // overlap between consecutive chunks
const TOP_K = 5;           // how many chunks to retrieve

// ─── Clients ──────────────────────────────────────────────────────────────────
function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getQdrantClient() {
  return new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
  });
}

// ─── 1. Chunking Strategy — Fixed-Size with Overlap ──────────────────────────
/**
 * Splits text into overlapping fixed-size chunks.
 *
 * Strategy: Fixed-size chunking with overlap
 *   - Chunk size: 800 characters
 *   - Overlap:    150 characters
 *
 * Why this strategy?
 *   Fixed-size chunking is simple and predictable. The overlap ensures that
 *   sentences or concepts that span a chunk boundary are still captured in at
 *   least one chunk, improving retrieval recall.
 *
 * @param {string} text     - Full document text
 * @param {string} source   - Source file name (stored as metadata)
 * @returns {Array<{id, text, source, chunkIndex}>}
 */
export function chunkDocument(text, source) {
  const chunks = [];
  let start = 0;
  let chunkIndex = 0;

  // Normalise whitespace so chunk sizes are more consistent
  const cleanedText = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  while (start < cleanedText.length) {
    const end = Math.min(start + CHUNK_SIZE, cleanedText.length);
    const chunkText = cleanedText.slice(start, end).trim();

    if (chunkText.length > 20) { // Skip tiny trailing chunks
      chunks.push({
        id: `${source}-chunk-${chunkIndex}`,
        text: chunkText,
        source,
        chunkIndex,
        charStart: start,
        charEnd: end,
      });
      chunkIndex++;
    }

    // Move forward, stepping back by overlap to maintain context continuity
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

// ─── 2. Embedding ─────────────────────────────────────────────────────────────
/**
 * Embeds an array of text strings using OpenAI's embedding model.
 * Batches requests to avoid rate-limit issues.
 *
 * @param {string[]} texts
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export async function embedTexts(texts) {
  const openai = getOpenAIClient();
  const BATCH_SIZE = 20;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    const batchEmbeddings = response.data.map((item) => item.embedding);
    allEmbeddings.push(...batchEmbeddings);
  }

  return allEmbeddings;
}

// ─── 3. Ensure Qdrant Collection Exists ───────────────────────────────────────
async function ensureCollection(client, collectionName) {
  try {
    await client.getCollection(collectionName);
  } catch {
    // Collection doesn't exist — create it
    await client.createCollection(collectionName, {
      vectors: {
        size: VECTOR_SIZE,
        distance: "Cosine",
      },
    });
  }
}

// ─── 4. Storage — Upsert to Qdrant ────────────────────────────────────────────
/**
 * Stores embedded chunks into the Qdrant vector database.
 * Uses the document's session ID as the collection name.
 *
 * @param {Array} chunks       - Output from chunkDocument()
 * @param {number[][]} vectors - Output from embedTexts()
 * @param {string} sessionId   - Unique identifier for this document session
 */
export async function storeEmbeddings(chunks, vectors, sessionId) {
  const client = getQdrantClient();
  const collectionName = `notebooklm-${sessionId}`;

  await ensureCollection(client, collectionName);

  const points = chunks.map((chunk, idx) => ({
    id: idx,
    vector: vectors[idx],
    payload: {
      text: chunk.text,
      source: chunk.source,
      chunkIndex: chunk.chunkIndex,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
    },
  }));

  // Qdrant recommends batching large upserts
  const UPSERT_BATCH = 100;
  for (let i = 0; i < points.length; i += UPSERT_BATCH) {
    await client.upsert(collectionName, {
      points: points.slice(i, i + UPSERT_BATCH),
      wait: true,
    });
  }

  return { collectionName, totalChunks: chunks.length };
}

// ─── 5. Retrieval ─────────────────────────────────────────────────────────────
/**
 * Retrieves the top-K most relevant chunks for a user query.
 *
 * @param {string} query       - User's natural language question
 * @param {string} sessionId   - Session ID to identify the correct collection
 * @returns {Promise<Array>}   - Retrieved chunks with text and score
 */
export async function retrieveChunks(query, sessionId) {
  const client = getQdrantClient();
  const openai = getOpenAIClient();
  const collectionName = `notebooklm-${sessionId}`;

  // Embed the user query using the same model
  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: [query],
  });
  const queryVector = embeddingResponse.data[0].embedding;

  // Perform cosine-similarity search in Qdrant
  const searchResult = await client.search(collectionName, {
    vector: queryVector,
    limit: TOP_K,
    with_payload: true,
  });

  return searchResult.map((hit) => ({
    text: hit.payload.text,
    source: hit.payload.source,
    chunkIndex: hit.payload.chunkIndex,
    score: hit.score,
  }));
}

// ─── 6. Generation ────────────────────────────────────────────────────────────
/**
 * Generates a grounded answer using retrieved context + OpenAI LLM.
 *
 * The system prompt strictly instructs the model to answer ONLY from
 * the provided document context — not from its general training knowledge.
 *
 * @param {string} query            - User's question
 * @param {Array}  retrievedChunks  - Output from retrieveChunks()
 * @returns {Promise<string>}       - LLM-generated answer
 */
export async function generateAnswer(query, retrievedChunks) {
  const openai = getOpenAIClient();

  // Format retrieved chunks with their chunk number for transparency
  const contextBlock = retrievedChunks
    .map(
      (chunk, idx) =>
        `[Chunk ${idx + 1} | Relevance: ${(chunk.score * 100).toFixed(1)}%]\n${chunk.text}`
    )
    .join("\n\n---\n\n");

  const systemPrompt = `You are NotebookLM — an AI assistant that answers questions STRICTLY based on the document context provided below.

RULES (follow without exception):
1. Answer ONLY using information from the provided context chunks.
2. If the answer is not in the context, say: "I couldn't find information about that in the uploaded document."
3. Never use your general training knowledge to answer.
4. If relevant, cite which chunk(s) support your answer (e.g., "According to Chunk 2...").
5. Be concise, accurate, and helpful.

=== DOCUMENT CONTEXT ===
${contextBlock}
========================`;

  const response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
    temperature: 0.2, // Low temperature for factual, grounded answers
    max_tokens: 1024,
  });

  return response.choices[0].message.content;
}

// ─── Full Ingestion Pipeline ───────────────────────────────────────────────────
/**
 * Orchestrates the complete document ingestion flow:
 *   text → chunks → embeddings → Qdrant storage
 *
 * @param {string} text      - Raw document text
 * @param {string} fileName  - Original file name (used as source metadata)
 * @param {string} sessionId - Unique session identifier
 * @returns {Promise<{totalChunks, collectionName}>}
 */
export async function ingestDocument(text, fileName, sessionId) {
  // Step 1: Chunk
  const chunks = chunkDocument(text, fileName);

  // Step 2: Embed
  const texts = chunks.map((c) => c.text);
  const vectors = await embedTexts(texts);

  // Step 3: Store
  const result = await storeEmbeddings(chunks, vectors, sessionId);

  return result;
}
