"use client";

import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { processCaptureAPI, searchAPI } from "../../lib/api";
import Image from "next/image";

interface Capture {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video" | "audio";
  note: string | null;
  tags: string[] | null;
  created_at: string;
  // OCR and processing fields
  extracted_text: string | null;
  embedding: number[] | null;
  processing_status: "pending" | "processing" | "completed" | "failed";
  processed_at: string | null;
  extracted_date: string | null;
  extracted_time: string | null;
  extracted_datetime: string | null;
  date_confidence: number | null;
  temporal_context: Record<string, any> | null;
}

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loadingCaptures, setLoadingCaptures] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<
    "all" | "image" | "video" | "audio"
  >("all");
  const [selectedCapture, setSelectedCapture] = useState<Capture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingCaptures, setProcessingCaptures] = useState<Set<string>>(
    new Set()
  );
  const [searchResults, setSearchResults] = useState<Capture[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      loadCaptures();
    }
  }, [user]);

  const loadCaptures = async () => {
    try {
      setError(null);
      if (!user?.id) {
        console.log("No user ID available");
        setLoadingCaptures(false);
        return;
      }

      const { data, error } = await supabase
        .from("captures")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading captures:", error);
        // If it's an auth error, the user might need to sign in again
        if (
          error.message.includes("JWT") ||
          error.message.includes("token") ||
          error.message.includes("refresh")
        ) {
          setError("Your session has expired. Please sign in again.");
          console.log(
            "Authentication error detected, user may need to sign in again"
          );
        } else {
          setError("Failed to load captures. Please try again.");
        }
        setCaptures([]);
      } else {
        setCaptures(data || []);
      }
    } catch (error) {
      console.error("Error loading captures:", error);
      setError("An unexpected error occurred. Please try again.");
      setCaptures([]);
    } finally {
      setLoadingCaptures(false);
    }
  };

  const filteredCaptures =
    searchResults.length > 0
      ? searchResults.filter((capture) => {
          const matchesFilter =
            selectedFilter === "all" || capture.media_type === selectedFilter;
          return matchesFilter;
        })
      : captures.filter((capture) => {
          const matchesSearch =
            !searchQuery ||
            capture.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            capture.tags?.some((tag) =>
              tag.toLowerCase().includes(searchQuery.toLowerCase())
            ) ||
            capture.extracted_text
              ?.toLowerCase()
              .includes(searchQuery.toLowerCase());

          const matchesFilter =
            selectedFilter === "all" || capture.media_type === selectedFilter;

          return matchesSearch && matchesFilter;
        });

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const handleProcessCapture = async (captureId: string) => {
    if (!user?.id) return;

    setProcessingCaptures((prev) => new Set(prev).add(captureId));

    try {
      const result = await processCaptureAPI(captureId, user.id);
      console.log("Processing result:", result);

      // Refresh captures to show updated data
      await loadCaptures();

      // Update selected capture if it's the one being processed
      if (selectedCapture?.id === captureId) {
        setSelectedCapture((prev) => (prev ? { ...prev, ...result } : null));
      }
    } catch (error) {
      console.error("Processing failed:", error);
      setError("Failed to process capture. Please try again.");
    } finally {
      setProcessingCaptures((prev) => {
        const newSet = new Set(prev);
        newSet.delete(captureId);
        return newSet;
      });
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !user?.id) return;

    setIsSearching(true);
    try {
      const result = await searchAPI({
        query: searchQuery,
        userId: user.id,
        type: "hybrid",
        limit: 20,
      });

      setSearchResults(result.results);
    } catch (error) {
      console.error("Search failed:", error);
      setError("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    loadCaptures(); // Refresh to show all captures
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-400"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Navigation */}
      <nav className="bg-gray-800 shadow-sm border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-white">
                MyMemex Dashboard
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center">
                    <span className="text-sm font-medium text-white">
                      {user.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="hidden md:block">
                  <p className="text-sm font-medium text-gray-300">
                    {user.email}
                  </p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="bg-gray-700 py-2 px-3 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-300 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">
              Your Knowledge Base
            </h2>
            <p className="text-gray-300">
              {captures.length} captures saved • {filteredCaptures.length}{" "}
              showing
            </p>
          </div>

          {/* Search and Filter */}
          <div className="mb-8 space-y-4">
            {/* Batch Processing Button */}
            {captures.some(
              (c) =>
                c.media_type === "image" && c.processing_status === "pending"
            ) && (
              <div className="bg-blue-900 border border-blue-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-blue-200 font-medium">
                      Process All Images
                    </h3>
                    <p className="text-blue-300 text-sm">
                      {
                        captures.filter(
                          (c) =>
                            c.media_type === "image" &&
                            c.processing_status === "pending"
                        ).length
                      }{" "}
                      images ready for OCR processing
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const pendingImages = captures.filter(
                        (c) =>
                          c.media_type === "image" &&
                          c.processing_status === "pending"
                      );
                      for (const capture of pendingImages) {
                        await handleProcessCapture(capture.id);
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Process All
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search captures with AI (OCR text, semantic search)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={!searchQuery.trim() || isSearching}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    {isSearching ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Searching...
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        AI Search
                      </>
                    )}
                  </button>
                  {searchResults.length > 0 && (
                    <button
                      onClick={clearSearch}
                      className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {["all", "image", "video", "audio"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setSelectedFilter(filter as any)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedFilter === filter
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {filter === "all"
                      ? "All"
                      : filter.charAt(0).toUpperCase() + filter.slice(1) + "s"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-900 border border-red-700 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg
                    className="w-5 h-5 text-red-400 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="text-red-200">{error}</p>
                </div>
                <button
                  onClick={loadCaptures}
                  className="ml-4 px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-sm rounded transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Media Grid */}
          {loadingCaptures ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
            </div>
          ) : filteredCaptures.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📱</div>
              <h3 className="text-xl font-semibold text-white mb-2">
                No captures found
              </h3>
              <p className="text-gray-400">
                {captures.length === 0
                  ? "Start capturing media with your mobile app to see it here!"
                  : "Try adjusting your search or filter criteria."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {filteredCaptures.map((capture) => (
                <div
                  key={capture.id}
                  onClick={() => setSelectedCapture(capture)}
                  className="bg-gray-800 rounded-lg overflow-hidden shadow-sm border border-gray-700 hover:border-indigo-500 transition-colors cursor-pointer group"
                >
                  <div className="aspect-square relative">
                    {capture.media_type === "image" ? (
                      <Image
                        src={capture.media_url}
                        alt={capture.note || "Captured image"}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-200"
                        sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                      />
                    ) : capture.media_type === "video" ? (
                      <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-4xl mb-2">🎥</div>
                          <div className="text-sm text-gray-300">Video</div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-4xl mb-2">🎵</div>
                          <div className="text-sm text-gray-300">Audio</div>
                        </div>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                      <span className="bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                        {capture.media_type}
                      </span>
                      {capture.media_type === "image" && (
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            capture.processing_status === "completed"
                              ? "bg-green-600 text-white"
                              : capture.processing_status === "processing"
                              ? "bg-yellow-600 text-white"
                              : capture.processing_status === "failed"
                              ? "bg-red-600 text-white"
                              : "bg-gray-600 text-white"
                          }`}
                        >
                          {capture.processing_status === "completed"
                            ? "✓ OCR"
                            : capture.processing_status === "processing"
                            ? "⏳"
                            : capture.processing_status === "failed"
                            ? "✗"
                            : "⏸"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-gray-400 mb-2">
                      {new Date(capture.created_at).toLocaleDateString()}
                    </div>
                    {capture.note && (
                      <p className="text-white text-sm mb-2 line-clamp-2">
                        {capture.note}
                      </p>
                    )}
                    {capture.tags && capture.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {capture.tags.slice(0, 3).map((tag, index) => (
                          <span
                            key={index}
                            className="bg-indigo-600 text-white text-xs px-2 py-1 rounded"
                          >
                            #{tag}
                          </span>
                        ))}
                        {capture.tags.length > 3 && (
                          <span className="text-gray-400 text-xs">
                            +{capture.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    {capture.media_type === "image" &&
                      capture.processing_status !== "completed" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleProcessCapture(capture.id);
                          }}
                          disabled={
                            processingCaptures.has(capture.id) ||
                            capture.processing_status === "processing"
                          }
                          className="w-full mt-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded transition-colors flex items-center justify-center gap-1"
                        >
                          {processingCaptures.has(capture.id) ||
                          capture.processing_status === "processing" ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              Processing...
                            </>
                          ) : (
                            <>
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                              Extract Text
                            </>
                          )}
                        </button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Media Modal */}
      {selectedCapture && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">
                {selectedCapture.media_type === "image"
                  ? "Image"
                  : selectedCapture.media_type === "video"
                  ? "Video"
                  : "Audio"}{" "}
                Capture
              </h3>
              <button
                onClick={() => setSelectedCapture(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <div className="mb-4">
                {selectedCapture.media_type === "image" ? (
                  <div className="relative w-full h-96">
                    <Image
                      src={selectedCapture.media_url}
                      alt={selectedCapture.note || "Captured image"}
                      fill
                      className="object-contain rounded-lg"
                    />
                  </div>
                ) : selectedCapture.media_type === "video" ? (
                  <video
                    src={selectedCapture.media_url}
                    controls
                    className="w-full h-96 rounded-lg"
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <audio
                    src={selectedCapture.media_url}
                    controls
                    className="w-full"
                  >
                    Your browser does not support the audio tag.
                  </audio>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Date Captured
                  </label>
                  <p className="text-white">
                    {new Date(selectedCapture.created_at).toLocaleString()}
                  </p>
                </div>
                {selectedCapture.note && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Note
                    </label>
                    <p className="text-white">{selectedCapture.note}</p>
                  </div>
                )}
                {selectedCapture.tags && selectedCapture.tags.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Tags
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {selectedCapture.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="bg-indigo-600 text-white text-sm px-3 py-1 rounded-full"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* OCR Processing Section */}
                {selectedCapture.media_type === "image" && (
                  <div className="border-t border-gray-700 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-300">
                        OCR Processing
                      </label>
                      {selectedCapture.processing_status !== "completed" && (
                        <button
                          onClick={() =>
                            handleProcessCapture(selectedCapture.id)
                          }
                          disabled={
                            processingCaptures.has(selectedCapture.id) ||
                            selectedCapture.processing_status === "processing"
                          }
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors flex items-center gap-2"
                        >
                          {processingCaptures.has(selectedCapture.id) ||
                          selectedCapture.processing_status === "processing" ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              Processing...
                            </>
                          ) : (
                            <>
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                              Extract Text
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">Status:</span>
                        <span
                          className={`text-sm px-2 py-1 rounded ${
                            selectedCapture.processing_status === "completed"
                              ? "bg-green-600 text-white"
                              : selectedCapture.processing_status ===
                                "processing"
                              ? "bg-yellow-600 text-white"
                              : selectedCapture.processing_status === "failed"
                              ? "bg-red-600 text-white"
                              : "bg-gray-600 text-white"
                          }`}
                        >
                          {selectedCapture.processing_status}
                        </span>
                      </div>

                      {selectedCapture.extracted_text && (
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">
                            Extracted Text
                          </label>
                          <div className="bg-gray-700 p-3 rounded-lg max-h-40 overflow-y-auto">
                            <p className="text-white text-sm whitespace-pre-wrap">
                              {selectedCapture.extracted_text}
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedCapture.extracted_date && (
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">
                            Extracted Date
                          </label>
                          <p className="text-white text-sm">
                            {selectedCapture.extracted_date}
                            {selectedCapture.extracted_time &&
                              ` at ${selectedCapture.extracted_time}`}
                            {selectedCapture.date_confidence && (
                              <span className="text-gray-400 ml-2">
                                (confidence:{" "}
                                {Math.round(
                                  selectedCapture.date_confidence * 100
                                )}
                                %)
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {selectedCapture.temporal_context &&
                        Object.keys(selectedCapture.temporal_context).length >
                          0 && (
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                              Temporal Context
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(
                                selectedCapture.temporal_context
                              ).map(([key, value]) => (
                                <span
                                  key={key}
                                  className="bg-blue-600 text-white text-xs px-2 py-1 rounded"
                                >
                                  {value.text}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
