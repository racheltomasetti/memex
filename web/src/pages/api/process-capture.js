// pages/api/process-capture.js
import { processCapture } from "../../lib/textProcessing";
import { createClient } from "@supabase/supabase-js";

// Use service role key for server-side operations to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { captureId, userId } = req.body;

    console.log("Process capture request:", { captureId, userId });

    if (!captureId) {
      return res.status(400).json({ error: "Capture ID is required" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Get capture details with user authentication
    console.log("Querying captures table for:", { captureId, userId });
    const { data: capture, error: fetchError } = await supabase
      .from("captures")
      .select("*")
      .eq("id", captureId)
      .eq("user_id", userId)
      .single();

    console.log("Capture query result:", { capture, fetchError });

    if (fetchError || !capture) {
      console.log("Capture not found - Error details:", fetchError);
      return res.status(404).json({
        error: "Capture not found",
        details:
          fetchError?.message ||
          "No capture found with the given ID and user ID",
        captureId,
        userId,
      });
    }

    // Check if already processed
    if (capture.processing_status === "completed") {
      return res.status(200).json({
        success: true,
        captureId,
        message: "Capture already processed",
        extractedText: capture.extracted_text,
        hasEmbedding: !!capture.embedding,
      });
    }

    // Check if currently processing
    if (capture.processing_status === "processing") {
      return res.status(202).json({
        success: false,
        captureId,
        message: "Capture is currently being processed",
        status: "processing",
      });
    }

    // Process the capture
    const result = await processCapture(
      capture.id,
      capture.media_url,
      capture.note,
      capture.tags,
      supabase
    );

    res.status(200).json({
      success: true,
      captureId,
      extractedText: result.extractedText,
      hasEmbedding: result.hasEmbedding,
      temporalInfo: result.temporalInfo,
    });
  } catch (error) {
    console.error("Processing error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: "Processing failed",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}
