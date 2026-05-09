/**
 * POST /api/upload
 *
 * Accepts a multipart form submission with:
 *   - file: PDF or TXT document
 *   - sessionId: unique string identifying this document session
 *
 * Pipeline: parse → extract text → chunk → embed → store in Qdrant
 * Returns: { success, totalChunks, collectionName }
 */

import { NextResponse } from "next/server";
import { ingestDocument } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for large documents

// Parse PDF bytes using pdf-parse (lazy import to avoid edge runtime issues)
async function extractTextFromPDF(buffer) {
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const data = await pdfParse(buffer);
  return data.text;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const sessionId = formData.get("sessionId");

    if (!file || !sessionId) {
      return NextResponse.json(
        { error: "Missing file or sessionId" },
        { status: 400 }
      );
    }

    const fileName = file.name;
    const fileType = file.type;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let text = "";

    // ── Text Extraction ──────────────────────────────────────────────────────
    if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
      text = await extractTextFromPDF(buffer);
    } else if (
      fileType === "text/plain" ||
      fileName.endsWith(".txt") ||
      fileName.endsWith(".md")
    ) {
      text = buffer.toString("utf-8");
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or TXT file." },
        { status: 400 }
      );
    }

    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        { error: "Could not extract meaningful text from the document." },
        { status: 400 }
      );
    }

    // ── RAG Ingestion ────────────────────────────────────────────────────────
    const result = await ingestDocument(text, fileName, sessionId);

    return NextResponse.json({
      success: true,
      fileName,
      totalChunks: result.totalChunks,
      collectionName: result.collectionName,
      message: `Document indexed successfully into ${result.totalChunks} chunks.`,
    });
  } catch (err) {
    console.error("[/api/upload] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process document." },
      { status: 500 }
    );
  }
}
