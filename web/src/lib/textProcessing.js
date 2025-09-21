// lib/textProcessing.js - Complete OCR and Processing Pipeline

import vision from "@google-cloud/vision";
import OpenAI from "openai";
import chrono from "chrono-node";
import path from "path";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure Google Cloud Vision client with credentials
// Try multiple authentication methods
let visionClient;
try {
  // Method 1: Use GOOGLE_APPLICATION_CREDENTIALS environment variable
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    visionClient = new vision.ImageAnnotatorClient();
  } else {
    // Method 2: Use key file path
    visionClient = new vision.ImageAnnotatorClient({
      keyFilename: path.join(process.cwd(), "google-cloud-key.json"),
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    });
  }
} catch (error) {
  console.error("Failed to initialize Google Cloud Vision client:", error);
  throw new Error("Google Cloud Vision client initialization failed");
}

// ===== TEXT CLEANING UTILITIES =====

function cleanExtractedText(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return "";
  }

  return (
    rawText
      // Remove console logs and browser artifacts
      .replace(/src\/lib\/api\.js.*?processCaptureAPI/gs, "")
      .replace(/src\/.*?\.(js|tsx?)\s*\(\d+:\d+\)/g, "")
      .replace(/Call Stack.*?(?=\n\n|\n[A-Z]|$)/gs, "")
      .replace(/async handleProcessCapture.*?(?=\n\n|\n[A-Z]|$)/gs, "")
      .replace(/if \(response\.ok\)\s*\{.*?\}/gs, "")
      .replace(/throw new Error.*?(?=\n\n|\n[A-Z]|$)/gs, "")
      .replace(/Processing failed.*?(?=\n\n|\n[A-Z]|$)/gs, "")
      .replace(/Capture not found.*?(?=\n\n|\n[A-Z]|$)/gs, "")
      .replace(/Error details:.*?(?=\n\n|\n[A-Z]|$)/gs, "")
      .replace(/API call failed:.*?(?=\n\n|\n[A-Z]|$)/gs, "")

      // Remove common browser console patterns
      .replace(/console\.(log|error|warn|info).*?(?=\n\n|\n[A-Z]|$)/gs, "")
      .replace(/at \w+.*?(?=\n\n|\n[A-Z]|$)/gs, "")
      .replace(/Uncaught.*?(?=\n\n|\n[A-Z]|$)/gs, "")

      // Remove specific code fragments and artifacts
      .replace(/\d+\s+\d+\s+return\s+date:/g, "") // Remove "201 21 return date:"
      .replace(/\d+\s+\d+\s+return/g, "") // Remove "201 21 return"
      .replace(/\d+\s+\d+\s+/g, "") // Remove standalone number pairs like "201 21"
      .replace(/return\s+date:.*?(?=\n\n|\n[A-Z]|$)/gs, "") // Remove "return date:" patterns
      .replace(/\d+\s*\/\s*\d+\s*\/\s*\d+/g, "") // Remove file path patterns that look like dates
      .replace(/\b\d{1,3}\s+\d{1,3}\b/g, "") // Remove short number pairs (likely line numbers)

      // Remove common JavaScript/TypeScript keywords that appear in console
      .replace(
        /\b(return|const|let|var|function|async|await|if|else|try|catch|throw|new|Error)\b.*?(?=\n\n|\n[A-Z]|$)/gs,
        ""
      )

      // Clean up years - keep reasonable years, remove others
      .replace(/\b\d{4}\b/g, (match) => {
        const year = parseInt(match);
        return year >= 1900 && year <= 2100 ? match : "";
      })

      // Preserve formatting while cleaning up excessive whitespace
      .replace(/\n{3,}/g, "\n\n") // Only reduce excessive newlines (3+ to 2)
      .replace(/[ \t]+$/gm, "") // Remove trailing spaces/tabs from each line
      .replace(/^[ \t]+$/gm, "") // Remove lines that are only whitespace
      .replace(/\n\s*\n\s*\n/g, "\n\n") // Clean up multiple empty lines
      .trim()
  );
}

// ===== FULL TEXT EXTRACTION =====

export async function extractTextFromImage(imageUrl) {
  console.log("Starting Google Vision OCR for image:", imageUrl);

  if (!imageUrl) {
    throw new Error("No image URL provided");
  }

  if (!visionClient) {
    throw new Error("Google Cloud Vision client not initialized");
  }

  try {
    console.log("Calling Google Vision API...");
    // Google Vision can work with URLs directly
    const [result] = await visionClient.textDetection(imageUrl);
    console.log("Google Vision API response received");

    const detections = result.textAnnotations;
    console.log("Number of text detections:", detections?.length || 0);

    if (!detections || detections.length === 0) {
      console.log("No text detected in image");
      return "";
    }

    // First detection contains the full text
    const fullText = detections[0].description;
    console.log("Extracted text length:", fullText?.length || 0);

    // Clean up the text using our comprehensive cleaning function
    const cleanedText = cleanExtractedText(fullText);

    console.log("Cleaned text length:", cleanedText.length);
    console.log("Cleaned text preview:", cleanedText.substring(0, 200) + "...");

    return cleanedText;
  } catch (error) {
    console.error("Google Vision OCR error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      status: error.status,
      details: error.details,
    });
    throw new Error(`Google Vision OCR failed: ${error.message}`);
  }
}

// Optional: Add confidence scoring
export async function extractTextWithConfidence(imageUrl) {
  try {
    const [result] = await visionClient.documentTextDetection(imageUrl);
    const fullTextAnnotation = result.fullTextAnnotation;

    if (!fullTextAnnotation) {
      return { text: "", confidence: 0 };
    }

    const text = fullTextAnnotation.text;

    // Calculate average confidence from all detected words
    const pages = fullTextAnnotation.pages || [];
    let totalConfidence = 0;
    let wordCount = 0;

    pages.forEach((page) => {
      page.blocks?.forEach((block) => {
        block.paragraphs?.forEach((paragraph) => {
          paragraph.words?.forEach((word) => {
            if (word.confidence) {
              totalConfidence += word.confidence;
              wordCount++;
            }
          });
        });
      });
    });

    const averageConfidence = wordCount > 0 ? totalConfidence / wordCount : 0;

    return {
      text: cleanExtractedText(text),
      confidence: averageConfidence,
    };
  } catch (error) {
    console.error("Google Vision document OCR error:", error);
    throw new Error(`Google Vision document OCR failed: ${error.message}`);
  }
}

// ===== TEMPORAL EXTRACTION FROM TEXT =====

const DATE_PATTERNS = [
  // Full dates - MM/DD/YYYY, DD/MM/YYYY, YYYY/MM/DD
  /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/g,
  /\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/g,

  // Month names with dates
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{2,4})\b/gi,
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s*(\d{2,4})\b/gi,

  // Day of week with dates
  /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*,?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{2,4})\b/gi,
];

const TIME_PATTERNS = [
  /\b(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)\b/g,
  /\b(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM|am|pm)\b/g,
  /\b(\d{1,2}):(\d{2})\b/g, // 24-hour format
  /\b(\d{1,2})\s*(o'clock|oclock)\b/gi,
];

const TEMPORAL_CONTEXT_PATTERNS = [
  /\b(today|yesterday|tomorrow|tonight|this morning|this afternoon|this evening)\b/gi,
  /\b(last (week|month|year|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi,
  /\b(next (week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi,
  /\b(\d+)\s*(days?|weeks?|months?)\s*(ago|from now)\b/gi,
  /\b(morning|afternoon|evening|night)\s*(pages|journal|notes|thoughts|reflection)\b/gi,
];

export function extractTemporalInfo(text, captureDate = new Date()) {
  if (!text || typeof text !== "string") {
    return null;
  }

  const results = {
    extractedDate: null,
    extractedTime: null,
    extractedDatetime: null,
    confidence: 0,
    rawMatches: [],
    temporalContext: {},
  };

  try {
    // Use chrono-node for sophisticated date parsing
    const chronoResults = chrono.parse(text, captureDate);

    if (chronoResults.length > 0) {
      const bestMatch = chronoResults[0];

      results.extractedDatetime = bestMatch.start.date();
      results.extractedDate = bestMatch.start
        .date()
        .toISOString()
        .split("T")[0];

      if (bestMatch.start.get("hour") !== null) {
        const time = bestMatch.start.date().toTimeString().split(" ")[0];
        results.extractedTime = time;
      }

      results.confidence = calculateConfidence(bestMatch, text);
      results.rawMatches.push({
        text: bestMatch.text,
        index: bestMatch.index,
        method: "chrono",
      });
    }

    // Extract temporal context regardless of date extraction
    results.temporalContext = extractTemporalContext(text);

    return results.extractedDate ||
      results.extractedTime ||
      Object.keys(results.temporalContext).length > 0
      ? results
      : null;
  } catch (error) {
    console.error("Temporal extraction error:", error);
    return null;
  }
}

function extractTemporalContext(text) {
  const context = {};

  for (const pattern of TEMPORAL_CONTEXT_PATTERNS) {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match) => {
      const key = match[0].toLowerCase().replace(/\s+/g, "_");
      context[key] = {
        text: match[0],
        index: match.index,
      };
    });
  }

  return context;
}

function calculateConfidence(chronoResult, text) {
  let confidence = 0.8; // Base confidence for chrono

  if (chronoResult.text.match(/\d{4}/)) confidence += 0.1; // Has year
  if (
    chronoResult.text.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i
    )
  )
    confidence += 0.05;
  if (chronoResult.start.get("hour") !== null) confidence += 0.05;

  if (chronoResult.text.length < 5) confidence -= 0.2; // Very short match
  if (chronoResult.text.match(/\b(today|yesterday|tomorrow)\b/i))
    confidence -= 0.1; // Relative dates

  return Math.min(1.0, Math.max(0.0, confidence));
}

// ===== VECTOR EMBEDDINGS =====

export async function generateEmbedding(text) {
  if (!text || text.trim().length === 0) {
    throw new Error("No text provided for embedding generation");
  }

  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text.substring(0, 8000), // Limit to token constraints
    });

    return response.data[0].embedding;
  } catch (error) {
    throw new Error(`Embedding generation failed: ${error.message}`);
  }
}

// ===== COMBINE TEXT FOR EMBEDDING =====

export function combineTextForEmbedding(
  note,
  extractedText,
  tags = [],
  temporalContext = {}
) {
  const parts = [];

  if (note && note.trim()) {
    parts.push(`Note: ${note.trim()}`);
  }

  if (extractedText && extractedText.trim()) {
    parts.push(`Content: ${extractedText.trim()}`);
  }

  if (tags && tags.length > 0) {
    parts.push(`Tags: ${tags.join(", ")}`);
  }

  if (temporalContext && Object.keys(temporalContext).length > 0) {
    const contextText = Object.values(temporalContext)
      .map((ctx) => ctx.text)
      .join(" ");
    parts.push(`Temporal context: ${contextText}`);
  }

  return parts.join("\n\n");
}

// ===== MAIN PROCESSING FUNCTION =====

export async function processCapture(
  captureId,
  imageUrl,
  note,
  tags,
  supabase
) {
  console.log("Starting processCapture for:", captureId);
  console.log("Image URL:", imageUrl);
  console.log("Note:", note);
  console.log("Tags:", tags);

  try {
    // Update status to processing
    console.log("Updating status to processing...");
    const { error: updateError } = await supabase
      .from("captures")
      .update({ processing_status: "processing" })
      .eq("id", captureId);

    if (updateError) {
      throw new Error(
        `Failed to update processing status: ${updateError.message}`
      );
    }

    // Step 1: Extract ALL text from image
    let extractedText = "";
    if (imageUrl) {
      console.log("Extracting text from image...");
      extractedText = await extractTextFromImage(imageUrl);
      console.log("Extracted text:", extractedText.substring(0, 200) + "...");
    } else {
      console.log("No image URL provided, skipping OCR");
    }

    // Step 2: Extract temporal information from ALL the text
    const allText = [note, extractedText].filter(Boolean).join("\n\n");
    const temporalInfo = extractTemporalInfo(allText);
    console.log("Temporal info:", temporalInfo);

    // Step 3: Combine everything for embedding
    const combinedText = combineTextForEmbedding(
      note,
      extractedText,
      tags,
      temporalInfo?.temporalContext
    );

    // Step 4: Generate embedding if we have content
    let embedding = null;
    if (combinedText.trim().length > 0) {
      console.log("Generating embedding...");
      try {
        embedding = await generateEmbedding(combinedText);
        console.log("Embedding generated successfully");
      } catch (embeddingError) {
        console.error("Embedding generation failed:", embeddingError);
        // Continue without embedding rather than failing completely
      }
    } else {
      console.log("No text content for embedding");
    }

    // Step 5: Update database with ALL results
    const updateData = {
      extracted_text: extractedText, // Store ALL extracted text
      processing_status: "completed",
      processed_at: new Date().toISOString(),
    };

    if (embedding) {
      updateData.embedding = embedding;
    }

    // Add temporal information as metadata
    if (temporalInfo) {
      if (temporalInfo.extractedDate) {
        updateData.extracted_date = temporalInfo.extractedDate;
      }
      if (temporalInfo.extractedTime) {
        updateData.extracted_time = temporalInfo.extractedTime;
      }
      if (temporalInfo.extractedDatetime) {
        updateData.extracted_datetime =
          temporalInfo.extractedDatetime.toISOString();
      }
      if (temporalInfo.confidence) {
        updateData.date_confidence = temporalInfo.confidence;
      }
      if (
        temporalInfo.temporalContext &&
        Object.keys(temporalInfo.temporalContext).length > 0
      ) {
        updateData.temporal_context = temporalInfo.temporalContext;
      }
    }

    const { error } = await supabase
      .from("captures")
      .update(updateData)
      .eq("id", captureId);

    if (error) throw error;

    return {
      success: true,
      extractedText,
      hasEmbedding: !!embedding,
      temporalInfo,
    };
  } catch (error) {
    console.error("Processing error:", error);

    // Update status to failed
    await supabase
      .from("captures")
      .update({
        processing_status: "failed",
        processed_at: new Date().toISOString(),
      })
      .eq("id", captureId);

    throw error;
  }
}

// ===== SEARCH FUNCTIONS =====

export async function semanticSearch(
  query,
  userId,
  supabase,
  limit = 10,
  threshold = 0.7
) {
  try {
    const queryEmbedding = await generateEmbedding(query);

    const { data, error } = await supabase.rpc("match_captures", {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_user_id: userId,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(`Semantic search failed: ${error.message}`);
  }
}

export async function fullTextSearch(query, userId, supabase) {
  try {
    const { data, error } = await supabase
      .from("captures")
      .select(
        "id, media_url, note, extracted_text, tags, created_at, extracted_date, extracted_time"
      )
      .textSearch("search_vector", query)
      .eq("user_id", userId)
      .eq("processing_status", "completed")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(`Full-text search failed: ${error.message}`);
  }
}

export async function hybridSearch(query, userId, supabase, options = {}) {
  const {
    semanticLimit = 5,
    fullTextLimit = 5,
    semanticThreshold = 0.7,
  } = options;

  try {
    const [semanticResults, fullTextResults] = await Promise.all([
      semanticSearch(query, userId, supabase, semanticLimit, semanticThreshold),
      fullTextSearch(query, userId, supabase),
    ]);

    // Combine and deduplicate results
    const combinedResults = new Map();

    semanticResults.forEach((result) => {
      combinedResults.set(result.id, {
        ...result,
        searchType: "semantic",
        relevanceScore: result.similarity,
      });
    });

    fullTextResults.slice(0, fullTextLimit).forEach((result, index) => {
      if (!combinedResults.has(result.id)) {
        combinedResults.set(result.id, {
          ...result,
          searchType: "fulltext",
          relevanceScore: 1 - index / fullTextLimit,
        });
      }
    });

    return Array.from(combinedResults.values()).sort(
      (a, b) => b.relevanceScore - a.relevanceScore
    );
  } catch (error) {
    throw new Error(`Hybrid search failed: ${error.message}`);
  }
}
