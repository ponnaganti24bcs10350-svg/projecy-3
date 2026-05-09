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
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";
export const maxDuration = 300;

async function extractTextFromPDF(buffer) {
  const uint8 = new Uint8Array(buffer);
  // unpdf requires a document proxy — pass that to extractText
  const pdf = await getDocumentProxy(uint8);
  const { text } = await extractText(pdf, { mergePages: true });
  return text ?? "";
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
    if (fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
      text = await extractTextFromPDF(buffer);
    } else if (
      fileType === "text/plain" ||
      fileName.toLowerCase().endsWith(".txt") ||
      fileName.toLowerCase().endsWith(".md")
    ) {
      text = buffer.toString("utf-8");
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or TXT file." },
        { status: 400 }
      );
    }

    if (!text || text.trim().length < 10) {
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
