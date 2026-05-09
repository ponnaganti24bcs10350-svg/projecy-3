
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
const CHAT_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "liquid/lfm-2.5-1.2b-instruct:free",
  "nvidia/nemotron-nano-9b-v2:free",
];
const VECTOR_SIZE = 384;
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;
const TOP_K = 5;


let _embedder = null;
async function getEmbedder() {
  if (!_embedder) {
    const { pipeline, env } = await import("@huggingface/transformers");
    // WASM backend — no native binaries, works on Vercel serverless
    env.backends.onnx.wasm.proxy = false;
    env.cacheDir = "/tmp/hf-cache";
    _embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return _embedder;
}


function getQdrant() {
  return new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
  });
}

export function chunkDocument(text, source) {
  const chunks = [];
  let chunkIndex = 0;
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    const chunkText = clean.slice(start, end).trim();
    if (chunkText.length > 20) {
      chunks.push({ text: chunkText, source, chunkIndex, charStart: start, charEnd: end });
      chunkIndex++;
    }
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}


async function embedSingle(text) {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

export async function embedTexts(texts) {
  const results = [];
  for (const text of texts) {
    results.push(await embedSingle(text));
  }
  return results;
}


async function ensureCollection(client, collectionName) {
  try {
    await client.getCollection(collectionName);
  } catch {
    await client.createCollection(collectionName, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" },
    });
  }
}


export async function storeEmbeddings(chunks, vectors, sessionId) {
  const client = getQdrant();
  const collectionName = `notebooklm-${sessionId}`;
  await ensureCollection(client, collectionName);

  const points = chunks.map((chunk, idx) => ({
    id: idx,
    vector: vectors[idx],
    payload: {
      text: chunk.text,
      source: chunk.source,
      chunkIndex: chunk.chunkIndex,
    },
  }));

  await client.upsert(collectionName, { points, wait: true });
  return { collectionName, totalChunks: chunks.length };
}

// ─── 6. Retrieve top-K chunks ────────────────────────────────────────────────
export async function retrieveChunks(query, sessionId) {
  const client = getQdrant();
  const collectionName = `notebooklm-${sessionId}`;
  const queryVector = await embedSingle(query);

  const hits = await client.search(collectionName, {
    vector: queryVector,
    limit: TOP_K,
    with_payload: true,
  });

  return hits.map((hit) => ({
    text: hit.payload.text,
    source: hit.payload.source,
    chunkIndex: hit.payload.chunkIndex,
    score: hit.score,
  }));
}


export async function generateAnswer(query, retrievedChunks) {
  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "NotebookLM RAG",
    },
  });

  const contextBlock = retrievedChunks
    .map((c, i) => `[Chunk ${i + 1} | ${(c.score * 100).toFixed(1)}% match]\n${c.text}`)
    .join("\n\n---\n\n");

  const messages = [
    {
      role: "system",
      content: `You are NotebookLM — answer ONLY from the document context below.

RULES:
1. Use ONLY the context. Never use general knowledge.
2. If not in context, say: "I couldn't find that in the uploaded document."
3. Cite chunk numbers when helpful.

=== DOCUMENT CONTEXT ===
${contextBlock}
========================`,
    },
    { role: "user", content: query },
  ];


  let lastError;
  for (const model of CHAT_MODELS) {
    try {
      const response = await client.chat.completions.create({
        model,
        temperature: 0.2,
        messages,
      });
      return response.choices[0].message.content;
    } catch (err) {
      const is429 = err?.status === 429 || err?.message?.includes("429") || err?.message?.includes("rate") || err?.message?.includes("Provider returned error");
      if (is429) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error("All models rate-limited. Please try again in a moment.");
}


export async function ingestDocument(text, fileName, sessionId) {
  const chunks = chunkDocument(text, fileName);
  const vectors = await embedTexts(chunks.map((c) => c.text));
  return storeEmbeddings(chunks, vectors, sessionId);
}
