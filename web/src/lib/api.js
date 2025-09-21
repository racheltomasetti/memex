// lib/api.js - API utility functions for OCR processing and search

// ===== PROCESSING API =====

export async function processCaptureAPI(captureId, userId) {
  try {
    const response = await fetch("/api/process-capture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ captureId, userId }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("API Error Response:", data);
      throw new Error(data.error || data.details || "Processing failed");
    }

    return data;
  } catch (error) {
    console.error("API call failed:", error);
    console.error("Error details:", error.message);
    throw error;
  }
}

// ===== SEARCH API =====

export async function searchAPI({
  query,
  userId,
  type = "hybrid",
  limit = 10,
  threshold = 0.7,
}) {
  try {
    const params = new URLSearchParams({
      q: query,
      userId,
      type,
      limit: limit.toString(),
      threshold: threshold.toString(),
    });

    const response = await fetch(`/api/search?${params}`, {
      method: "GET",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Search failed");
    }

    return data;
  } catch (error) {
    console.error("Search API call failed:", error);
    throw error;
  }
}

// ===== CONVENIENCE FUNCTIONS =====

export async function processAllPendingCaptures(userId, supabase) {
  try {
    // Get all pending captures for the user
    const { data: pendingCaptures, error } = await supabase
      .from("captures")
      .select("id, media_url, media_type")
      .eq("user_id", userId)
      .eq("processing_status", "pending")
      .eq("media_type", "image"); // Only process images

    if (error) throw error;

    if (!pendingCaptures || pendingCaptures.length === 0) {
      return { processed: 0, message: "No pending captures to process" };
    }

    // Process each capture
    const results = await Promise.allSettled(
      pendingCaptures.map((capture) => processCaptureAPI(capture.id, userId))
    );

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return {
      processed: successful,
      failed,
      total: pendingCaptures.length,
      results: results.map((result, index) => ({
        captureId: pendingCaptures[index].id,
        success: result.status === "fulfilled",
        error: result.status === "rejected" ? result.reason.message : null,
      })),
    };
  } catch (error) {
    console.error("Batch processing error:", error);
    throw error;
  }
}

export async function getProcessingStatus(captureId, supabase) {
  try {
    const { data: capture, error } = await supabase
      .from("captures")
      .select("processing_status, processed_at, extracted_text, embedding")
      .eq("id", captureId)
      .single();

    if (error) throw error;

    return {
      status: capture.processing_status,
      processedAt: capture.processed_at,
      hasExtractedText: !!capture.extracted_text,
      hasEmbedding: !!capture.embedding,
    };
  } catch (error) {
    console.error("Status check error:", error);
    throw error;
  }
}
