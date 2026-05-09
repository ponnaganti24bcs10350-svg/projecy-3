/**
 * POST /api/chat
 *
 * Accepts:
 *   - query:     user's natural language question
 *   - sessionId: identifies which Qdrant collection to query
 *
 * Pipeline: embed query → retrieve top-K chunks → generate grounded answer
 * Returns: { answer, sources }
 */

import { NextResponse } from "next/server";
import { retrieveChunks, generateAnswer } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request) {
  try {
    const body = await request.json();
    const { query, sessionId } = body;

    if (!query || !sessionId) {
      return NextResponse.json(
        { error: "Missing query or sessionId" },
        { status: 400 }
      );
    }

    if (query.trim().length < 3) {
      return NextResponse.json(
        { error: "Query is too short." },
        { status: 400 }
      );
    }

    // ── Step 1: Retrieve relevant chunks ────────────────────────────────────
    const retrievedChunks = await retrieveChunks(query, sessionId);

    if (!retrievedChunks || retrievedChunks.length === 0) {
      return NextResponse.json({
        answer:
          "I couldn't find any relevant information in the uploaded document for your question.",
        sources: [],
      });
    }

    // ── Step 2: Generate grounded answer ────────────────────────────────────
    const answer = await generateAnswer(query, retrievedChunks);

    // Return answer + source metadata for UI display
    const sources = retrievedChunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      score: (chunk.score * 100).toFixed(1),
      preview: chunk.text.slice(0, 200) + (chunk.text.length > 200 ? "…" : ""),
    }));

    return NextResponse.json({ answer, sources });
  } catch (err) {
    console.error("[/api/chat] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate answer." },
      { status: 500 }
    );
  }
}
