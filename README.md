# NotebookLM — RAG-Powered Document Chat

A full-stack **Retrieval-Augmented Generation (RAG)** application built for Assignment 03. Upload any PDF or text document and have an intelligent, grounded conversation with it — powered by OpenAI embeddings, Qdrant vector search, and GPT-4.1-mini.

![NotebookLM Screenshot](./screenshot.png)

## 🔗 Links

- **Live Demo**: [your-vercel-url.vercel.app]
- **GitHub**: [your-github-url]

---

## 🏗️ Architecture

```
User Upload (PDF/TXT)
        │
        ▼
  ┌─────────────────────────────────────────┐
  │          INGESTION PIPELINE             │
  │                                         │
  │  1. Text Extraction (pdf-parse)         │
  │  2. Chunking (fixed-size + overlap)     │
  │     • chunk_size   = 800 chars          │
  │     • chunk_overlap = 150 chars         │
  │  3. Embedding (text-embedding-3-large)  │
  │  4. Storage → Qdrant Cloud              │
  └─────────────────────────────────────────┘
        │
        ▼
User Question
        │
        ▼
  ┌─────────────────────────────────────────┐
  │           RETRIEVAL PIPELINE            │
  │                                         │
  │  1. Embed Query (text-embedding-3-large)│
  │  2. Cosine Search in Qdrant (top-5)     │
  │  3. LLM Generation (gpt-4.1-mini)       │
  │     • Strict context-only prompt        │
  │     • Temperature = 0.2                 │
  └─────────────────────────────────────────┘
        │
        ▼
   Grounded Answer + Source Chunks
```

---

## 🧩 RAG Pipeline Details

### 1. Chunking Strategy — Fixed-Size with Overlap

```
Document Text → [ Chunk 0 ] [ Chunk 1 ] [ Chunk 2 ] ...
                      ↑ 150-char overlap ↑
```

- **Chunk Size**: 800 characters
- **Overlap**: 150 characters
- **Why?** Fixed-size chunks are predictable and work well with embedding models. Overlap ensures context at boundaries isn't lost.

### 2. Embedding
- Model: `text-embedding-3-large` (OpenAI)
- Dimensions: 3072
- Batched in groups of 20 to respect rate limits

### 3. Vector Storage — Qdrant
- One collection per session (isolated per upload)
- Distance metric: Cosine Similarity
- Each point stores: `text`, `source`, `chunkIndex`, `charStart`, `charEnd`

### 4. Retrieval
- Query is embedded with the same model
- Top-5 most similar chunks are retrieved via cosine search

### 5. Generation — Grounded Answering
- Model: `gpt-4.1-mini`
- Temperature: 0.2 (low → factual, less creative)
- System prompt strictly forbids answering from general knowledge
- Retrieved chunks passed as context with relevance scores

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| LLM | OpenAI GPT-4.1-mini |
| Embeddings | OpenAI text-embedding-3-large |
| Vector DB | Qdrant Cloud |
| PDF Parsing | pdf-parse |
| Deployment | Vercel |

---

## ⚙️ Local Setup

### Prerequisites
- Node.js 18+
- OpenAI API Key
- Qdrant Cloud account (free tier at [cloud.qdrant.io](https://cloud.qdrant.io))

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd project-3
npm install
```

### 2. Configure Environment

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Fill in your keys:

```env
OPENAI_API_KEY=sk-...
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
```

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🌐 Deploying to Vercel

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → Import Project
3. Add environment variables in Vercel Dashboard:
   - `OPENAI_API_KEY`
   - `QDRANT_URL`
   - `QDRANT_API_KEY`
4. Deploy!

---

## 📁 Project Structure

```
project-3/
├── app/
│   ├── api/
│   │   ├── upload/route.js     # File upload + RAG ingestion
│   │   └── chat/route.js       # Query retrieval + generation
│   ├── globals.css             # Premium dark UI styles
│   ├── layout.js               # Root layout + SEO metadata
│   └── page.js                 # Main UI (upload + chat)
├── lib/
│   └── rag.js                  # Core RAG pipeline (chunking, embedding, storage, retrieval, generation)
├── next.config.mjs
└── .env.local                  # API keys (not committed)
```

---

## 💡 Answer Quality

The system is designed to minimize hallucination:
- The system prompt explicitly forbids using general training knowledge
- Temperature is set to 0.2
- Each answer is accompanied by the source chunks used
- If no relevant context is found, the system says so explicitly

---

## 📋 Marking Checklist

- [x] GitHub Repository (public)
- [x] Live Project (deployed on Vercel)
- [x] RAG Pipeline: chunking → embedding → retrieval → generation
- [x] Answers grounded in document — not hallucinated
- [x] Clean code with documentation
