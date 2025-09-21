// pages/api/search.js
import {
  hybridSearch,
  semanticSearch,
  fullTextSearch,
} from "../../lib/textProcessing";
import { createClient } from "@supabase/supabase-js";

// Use service role key for server-side operations to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      q: query,
      type = "hybrid",
      limit = 10,
      threshold = 0.7,
      userId,
    } = req.query;

    if (!query) {
      return res.status(400).json({ error: "Query parameter is required" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    let results;

    switch (type) {
      case "semantic":
        results = await semanticSearch(
          query,
          userId,
          supabase,
          parseInt(limit),
          parseFloat(threshold)
        );
        break;
      case "fulltext":
        results = await fullTextSearch(query, userId, supabase);
        break;
      case "hybrid":
      default:
        results = await hybridSearch(query, userId, supabase, {
          semanticLimit: Math.ceil(parseInt(limit) / 2),
          fullTextLimit: Math.ceil(parseInt(limit) / 2),
          semanticThreshold: parseFloat(threshold),
        });
        break;
    }

    res.status(200).json({
      success: true,
      query,
      type,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({
      error: "Search failed",
      details: error.message,
    });
  }
}
