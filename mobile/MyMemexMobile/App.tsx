// App.tsx
import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  FlatList,
  Modal,
  Platform,
} from "react-native";
// import DateTimePicker from '@react-native-community/datetimepicker';
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { createClient } from "@supabase/supabase-js";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
// import * as VideoThumbnails from "expo-video-thumbnails";
import "react-native-url-polyfill/auto";

// Supabase configuration
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const { width, height } = Dimensions.get("window");

type AuthState = "loading" | "unauthenticated" | "authenticated";
type MediaType = "image" | "video" | "audio";
type AppScreen = "camera" | "library" | "captures";

interface Capture {
  id: string;
  user_id: string;
  media_url: string;
  media_type: MediaType;
  note: string | null;
  tags: string[] | null;
  created_at: string;
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAuthState();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        setAuthState("authenticated");
      } else {
        setUser(null);
        setAuthState("unauthenticated");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAuthState = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      setAuthState("authenticated");
    } else {
      setAuthState("unauthenticated");
    }
  };

  if (authState === "loading") {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.text}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (authState === "unauthenticated") {
    return <LoginScreen />;
  }

  return <MainApp />;
}

// Login Screen Component
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      Alert.alert("Error", error.message);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.loginScreenContainer}>
      <StatusBar style="light" />
      <View style={styles.loginContainer}>
        <Text style={styles.title}>Memex</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Main App Component with Navigation
function MainApp() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>("camera");

  const renderScreen = () => {
    switch (currentScreen) {
      case "camera":
        return <CameraScreen onNavigate={setCurrentScreen} />;
      case "library":
        return <LibraryScreen onNavigate={setCurrentScreen} />;
      case "captures":
        return <CapturesScreen onNavigate={setCurrentScreen} />;
      default:
        return <CameraScreen onNavigate={setCurrentScreen} />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      {renderScreen()}
      <View style={styles.bottomNavigation}>
        <TouchableOpacity
          style={[
            styles.navButton,
            currentScreen === "camera" && styles.navButtonActive,
          ]}
          onPress={() => setCurrentScreen("camera")}
        >
          <Text
            style={[
              styles.navButtonText,
              currentScreen === "camera" && styles.navButtonTextActive,
            ]}
          >
            📷
          </Text>
          <Text
            style={[
              styles.navButtonLabel,
              currentScreen === "camera" && styles.navButtonLabelActive,
            ]}
          >
            Capture
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.navButton,
            currentScreen === "library" && styles.navButtonActive,
          ]}
          onPress={() => setCurrentScreen("library")}
        >
          <Text
            style={[
              styles.navButtonText,
              currentScreen === "library" && styles.navButtonTextActive,
            ]}
          >
            📁
          </Text>
          <Text
            style={[
              styles.navButtonLabel,
              currentScreen === "library" && styles.navButtonLabelActive,
            ]}
          >
            Library
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.navButton,
            currentScreen === "captures" && styles.navButtonActive,
          ]}
          onPress={() => setCurrentScreen("captures")}
        >
          <Text
            style={[
              styles.navButtonText,
              currentScreen === "captures" && styles.navButtonTextActive,
            ]}
          >
            📚
          </Text>
          <Text
            style={[
              styles.navButtonLabel,
              currentScreen === "captures" && styles.navButtonLabelActive,
            ]}
          >
            Knowledge
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Camera Screen Component
function CameraScreen({
  onNavigate,
}: {
  onNavigate: (screen: AppScreen) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedMedia, setCapturedMedia] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [isRecording, setIsRecording] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const cameraRef = useRef<CameraView>(null);

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
        });

        if (photo?.uri) {
          setCapturedMedia(photo.uri);
          setMediaType("image");
          setShowSaveModal(true);
        }
      } catch (error) {
        console.error("Error taking picture:", error);
        Alert.alert("Error", "Failed to take picture");
      }
    }
  };

  const recordVideo = async () => {
    if (cameraRef.current) {
      try {
        if (!isRecording) {
          setIsRecording(true);
          const video = await cameraRef.current.recordAsync({
            maxDuration: 60, // 1 minute max
          });

          if (video?.uri) {
            setCapturedMedia(video.uri);
            setMediaType("video");
            setShowSaveModal(true);
          }
        } else {
          cameraRef.current.stopRecording();
          setIsRecording(false);
        }
      } catch (error) {
        console.error("Error recording video:", error);
        Alert.alert("Error", "Failed to record video");
        setIsRecording(false);
      }
    }
  };

  const pickMedia = async (type: MediaType) => {
    try {
      const mediaTypes =
        type === "image"
          ? ImagePicker.MediaTypeOptions.Images
          : type === "video"
          ? ImagePicker.MediaTypeOptions.Videos
          : ImagePicker.MediaTypeOptions.All;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedMedia(result.assets[0].uri);
        setMediaType(type);
        setShowSaveModal(true);
      }
    } catch (error) {
      console.error("Error picking media:", error);
      Alert.alert("Error", "Failed to pick media");
    }
  };

  const uploadToSupabase = async (mediaUri: string, type: MediaType) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Determine file extension and content type
      const getFileInfo = (mediaType: MediaType) => {
        switch (mediaType) {
          case "image":
            return { ext: "jpg", contentType: "image/jpeg" };
          case "video":
            return { ext: "mp4", contentType: "video/mp4" };
          case "audio":
            return { ext: "m4a", contentType: "audio/m4a" };
          default:
            return { ext: "jpg", contentType: "image/jpeg" };
        }
      };

      const { ext, contentType } = getFileInfo(type);
      const fileName = `${Date.now()}.${ext}`;
      const filePath = `${user.id}/${fileName}`;

      // Read file using the legacy FileSystem API
      const fileInfo = await FileSystem.getInfoAsync(mediaUri);
      if (!fileInfo.exists) {
        throw new Error("File does not exist");
      }

      // Read file as base64 using the legacy API
      const base64 = await FileSystem.readAsStringAsync(mediaUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array for upload
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("media")
        .upload(filePath, byteArray, {
          contentType,
          cacheControl: "3600",
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("media")
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  };

  const saveCapture = async () => {
    if (!capturedMedia) return;

    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Upload media to Supabase
      const mediaUrl = await uploadToSupabase(capturedMedia, mediaType);

      // Save metadata to database
      const { error } = await supabase.from("captures").insert([
        {
          user_id: user.id,
          media_url: mediaUrl,
          media_type: mediaType,
          note: note,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          created_at: selectedDate.toISOString(),
        },
      ]);

      if (error) throw error;

      Alert.alert("Success", "Capture saved successfully!", [
        { text: "OK", onPress: resetCapture },
      ]);
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("Error", "Failed to save capture. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const resetCapture = () => {
    setCapturedMedia(null);
    setNote("");
    setTags("");
    setShowSaveModal(false);
    setIsRecording(false);
    setSelectedDate(new Date());
    setShowDatePicker(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No access to camera</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Camera View */}
      {!showSaveModal && (
        <View style={styles.cameraContainer}>
          <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
            <View style={styles.cameraOverlay}>
              <View style={styles.topBar}>
                <TouchableOpacity
                  style={styles.topButton}
                  onPress={() =>
                    setFacing(facing === "back" ? "front" : "back")
                  }
                >
                  <Text style={styles.buttonText}>🔄</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.topButton} onPress={signOut}>
                  <Text style={styles.buttonText}>Sign Out</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.bottomBar}>
                <TouchableOpacity
                  style={styles.libraryButton}
                  onPress={() => pickMedia("image")}
                >
                  <Text style={styles.buttonText}>📁</Text>
                </TouchableOpacity>

                <View style={styles.captureControls}>
                  <TouchableOpacity
                    style={[
                      styles.captureButton,
                      isRecording && styles.recordingButton,
                    ]}
                    onPress={mediaType === "image" ? takePicture : recordVideo}
                  >
                    <View
                      style={[
                        styles.captureButtonInner,
                        isRecording && styles.recordingButtonInner,
                      ]}
                    />
                  </TouchableOpacity>

                  <View style={styles.mediaTypeSelector}>
                    <TouchableOpacity
                      style={[
                        styles.mediaTypeButton,
                        mediaType === "image" && styles.mediaTypeButtonActive,
                      ]}
                      onPress={() => setMediaType("image")}
                    >
                      <Text style={styles.mediaTypeText}>📷</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.mediaTypeButton,
                        mediaType === "video" && styles.mediaTypeButtonActive,
                      ]}
                      onPress={() => setMediaType("video")}
                    >
                      <Text style={styles.mediaTypeText}>🎥</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.libraryButton}
                  onPress={() => pickMedia("video")}
                >
                  <Text style={styles.buttonText}>🎬</Text>
                </TouchableOpacity>
              </View>
            </View>
          </CameraView>
        </View>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <View style={styles.saveModal}>
          <ScrollView contentContainerStyle={styles.saveContent}>
            <Text style={styles.saveTitle}>Add Details</Text>

            {capturedMedia && (
              <View style={styles.previewContainer}>
                {mediaType === "image" ? (
                  <Image
                    source={{ uri: capturedMedia }}
                    style={styles.previewImage}
                  />
                ) : mediaType === "video" ? (
                  <View style={styles.videoPreview}>
                    <Text style={styles.videoPreviewText}>
                      🎥 Video Captured
                    </Text>
                    <Text style={styles.videoPreviewSubtext}>
                      Tap to preview
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            <TextInput
              style={styles.input}
              placeholder="Add a note about this capture..."
              placeholderTextColor="#666"
              value={note}
              onChangeText={setNote}
              multiline
            />

            <TextInput
              style={styles.input}
              placeholder="Add tags (comma separated)"
              placeholderTextColor="#666"
              value={tags}
              onChangeText={setTags}
            />

            <View style={styles.dateSection}>
              <Text style={styles.dateLabel}>Entry Date</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.dateButtonText}>
                  {selectedDate.toLocaleDateString()}{" "}
                  {selectedDate.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
                <Text style={styles.dateButtonIcon}>📅</Text>
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <View style={styles.datePickerContainer}>
                <View style={styles.datePickerHeader}>
                  <Text style={styles.datePickerTitle}>Select Date & Time</Text>
                  <TouchableOpacity
                    style={styles.datePickerCloseButton}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Text style={styles.datePickerCloseText}>Done</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.datePickerContent}>
                  <View style={styles.dateInputRow}>
                    <Text style={styles.dateInputLabel}>Date:</Text>
                    <TextInput
                      style={styles.dateInput}
                      value={selectedDate.toLocaleDateString()}
                      placeholder="MM/DD/YYYY"
                      placeholderTextColor="#666"
                      editable={false}
                    />
                  </View>
                  <View style={styles.dateInputRow}>
                    <Text style={styles.dateInputLabel}>Time:</Text>
                    <TextInput
                      style={styles.dateInput}
                      value={selectedDate.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      placeholder="HH:MM"
                      placeholderTextColor="#666"
                      editable={false}
                    />
                  </View>
                  <View style={styles.dateQuickButtons}>
                    <TouchableOpacity
                      style={styles.dateQuickButton}
                      onPress={() => {
                        const now = new Date();
                        setSelectedDate(now);
                      }}
                    >
                      <Text style={styles.dateQuickButtonText}>Now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dateQuickButton}
                      onPress={() => {
                        const yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        setSelectedDate(yesterday);
                      }}
                    >
                      <Text style={styles.dateQuickButtonText}>Yesterday</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dateQuickButton}
                      onPress={() => {
                        const lastWeek = new Date();
                        lastWeek.setDate(lastWeek.getDate() - 7);
                        setSelectedDate(lastWeek);
                      }}
                    >
                      <Text style={styles.dateQuickButtonText}>Last Week</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.saveButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={resetCapture}
                disabled={isLoading}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={saveCapture}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// Library Screen Component
function LibraryScreen({
  onNavigate,
}: {
  onNavigate: (screen: AppScreen) => void;
}) {
  const [mediaType, setMediaType] = useState<MediaType>("image");

  const pickMedia = async (type: MediaType) => {
    try {
      const mediaTypes =
        type === "image"
          ? ImagePicker.MediaTypeOptions.Images
          : type === "video"
          ? ImagePicker.MediaTypeOptions.Videos
          : ImagePicker.MediaTypeOptions.All;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes,
        allowsEditing: true,
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        // Handle multiple media selection
        for (const asset of result.assets) {
          // Process each selected media item
          console.log("Selected media:", asset.uri);
          // You can implement batch upload here
        }
      }
    } catch (error) {
      console.error("Error picking media:", error);
      Alert.alert("Error", "Failed to pick media");
    }
  };

  return (
    <View style={styles.libraryContainer}>
      <View style={styles.libraryHeader}>
        <Text style={styles.libraryTitle}>Media Library</Text>
        <Text style={styles.librarySubtitle}>
          Select media to add to your knowledge base
        </Text>
      </View>

      <View style={styles.mediaTypeTabs}>
        <TouchableOpacity
          style={[
            styles.mediaTab,
            mediaType === "image" && styles.mediaTabActive,
          ]}
          onPress={() => setMediaType("image")}
        >
          <Text
            style={[
              styles.mediaTabText,
              mediaType === "image" && styles.mediaTabTextActive,
            ]}
          >
            📷 Images
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.mediaTab,
            mediaType === "video" && styles.mediaTabActive,
          ]}
          onPress={() => setMediaType("video")}
        >
          <Text
            style={[
              styles.mediaTabText,
              mediaType === "video" && styles.mediaTabTextActive,
            ]}
          >
            🎥 Videos
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.libraryActions}>
        <TouchableOpacity
          style={styles.libraryActionButton}
          onPress={() => pickMedia(mediaType)}
        >
          <Text style={styles.libraryActionButtonText}>
            Select {mediaType === "image" ? "Images" : "Videos"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Captures Screen Component
function CapturesScreen({
  onNavigate,
}: {
  onNavigate: (screen: AppScreen) => void;
}) {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<MediaType | "all">(
    "all"
  );

  useEffect(() => {
    loadCaptures();
  }, []);

  const loadCaptures = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("captures")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCaptures(data || []);
    } catch (error) {
      console.error("Error loading captures:", error);
      Alert.alert("Error", "Failed to load captures");
    } finally {
      setLoading(false);
    }
  };

  const filteredCaptures = captures.filter((capture) => {
    const matchesSearch =
      !searchQuery ||
      capture.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      capture.tags?.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      );

    const matchesFilter =
      selectedFilter === "all" || capture.media_type === selectedFilter;

    return matchesSearch && matchesFilter;
  });

  const renderCapture = ({ item }: { item: Capture }) => (
    <View style={styles.captureItem}>
      <View style={styles.captureMedia}>
        {item.media_type === "image" ? (
          <Image
            source={{ uri: item.media_url }}
            style={styles.captureThumbnail}
          />
        ) : (
          <View style={styles.captureThumbnail}>
            <Text style={styles.captureThumbnailText}>🎥</Text>
          </View>
        )}
      </View>
      <View style={styles.captureInfo}>
        <Text style={styles.captureDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
        {item.note && (
          <Text style={styles.captureNote} numberOfLines={2}>
            {item.note}
          </Text>
        )}
        {item.tags && item.tags.length > 0 && (
          <View style={styles.captureTags}>
            {item.tags.slice(0, 3).map((tag, index) => (
              <Text key={index} style={styles.captureTag}>
                #{tag}
              </Text>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.text}>Loading captures...</Text>
      </View>
    );
  }

  return (
    <View style={styles.capturesContainer}>
      <View style={styles.capturesHeader}>
        <Text style={styles.capturesTitle}>Knowledge Base</Text>
        <Text style={styles.capturesSubtitle}>
          {captures.length} captures saved
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search captures..."
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            selectedFilter === "all" && styles.filterButtonActive,
          ]}
          onPress={() => setSelectedFilter("all")}
        >
          <Text
            style={[
              styles.filterButtonText,
              selectedFilter === "all" && styles.filterButtonTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            selectedFilter === "image" && styles.filterButtonActive,
          ]}
          onPress={() => setSelectedFilter("image")}
        >
          <Text
            style={[
              styles.filterButtonText,
              selectedFilter === "image" && styles.filterButtonTextActive,
            ]}
          >
            Images
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            selectedFilter === "video" && styles.filterButtonActive,
          ]}
          onPress={() => setSelectedFilter("video")}
        >
          <Text
            style={[
              styles.filterButtonText,
              selectedFilter === "video" && styles.filterButtonTextActive,
            ]}
          >
            Videos
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredCaptures}
        renderItem={renderCapture}
        keyExtractor={(item) => item.id}
        style={styles.capturesList}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  loginScreenContainer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontSize: 18,
    color: "#fff",
    textAlign: "center",
    marginTop: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 40,
    textAlign: "center",
  },
  loginContainer: {
    width: "80%",
    maxWidth: 400,
  },
  input: {
    backgroundColor: "#333",
    color: "#fff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#444",
  },
  loginButton: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  cameraContainer: {
    flex: 1,
    width: "100%",
  },
  camera: {
    flex: 1,
    width: "100%",
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 50,
  },
  topButton: {
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#fff",
  },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 30,
    paddingBottom: 50,
  },
  libraryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
  },
  placeholder: {
    width: 50,
    height: 50,
  },
  saveModal: {
    flex: 1,
    backgroundColor: "#000",
  },
  saveContent: {
    padding: 20,
    paddingTop: 50,
  },
  saveTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  previewImage: {
    width: "100%",
    height: 300,
    borderRadius: 10,
    marginBottom: 20,
  },
  saveButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 10,
    marginHorizontal: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#666",
  },
  saveButton: {
    backgroundColor: "#007AFF",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  // Navigation styles
  bottomNavigation: {
    flexDirection: "row",
    backgroundColor: "#111",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  navButtonActive: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderRadius: 8,
  },
  navButtonText: {
    fontSize: 20,
    marginBottom: 4,
  },
  navButtonTextActive: {
    color: "#007AFF",
  },
  navButtonLabel: {
    fontSize: 12,
    color: "#666",
  },
  navButtonLabelActive: {
    color: "#007AFF",
  },
  // Camera enhancements
  captureControls: {
    alignItems: "center",
  },
  mediaTypeSelector: {
    flexDirection: "row",
    marginTop: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 4,
  },
  mediaTypeButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 16,
  },
  mediaTypeButtonActive: {
    backgroundColor: "#007AFF",
  },
  mediaTypeText: {
    fontSize: 16,
    color: "#fff",
  },
  recordingButton: {
    borderColor: "#ff3b30",
  },
  recordingButtonInner: {
    backgroundColor: "#ff3b30",
  },
  // Preview enhancements
  previewContainer: {
    marginBottom: 20,
  },
  videoPreview: {
    width: "100%",
    height: 300,
    backgroundColor: "#333",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  videoPreviewText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 5,
  },
  videoPreviewSubtext: {
    color: "#666",
    fontSize: 14,
  },
  // Library screen styles
  libraryContainer: {
    flex: 1,
    backgroundColor: "#000",
    padding: 20,
  },
  libraryHeader: {
    marginBottom: 30,
  },
  libraryTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  librarySubtitle: {
    fontSize: 16,
    color: "#666",
  },
  mediaTypeTabs: {
    flexDirection: "row",
    backgroundColor: "#222",
    borderRadius: 10,
    padding: 4,
    marginBottom: 30,
  },
  mediaTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
  },
  mediaTabActive: {
    backgroundColor: "#007AFF",
  },
  mediaTabText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  mediaTabTextActive: {
    color: "#fff",
  },
  libraryActions: {
    flex: 1,
    justifyContent: "center",
  },
  libraryActionButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 20,
    paddingHorizontal: 30,
    borderRadius: 15,
    alignItems: "center",
  },
  libraryActionButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  // Captures screen styles
  capturesContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  capturesHeader: {
    padding: 20,
    paddingTop: 10,
  },
  capturesTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  capturesSubtitle: {
    fontSize: 16,
    color: "#666",
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  searchInput: {
    backgroundColor: "#222",
    color: "#fff",
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: "#222",
    borderWidth: 1,
    borderColor: "#333",
  },
  filterButtonActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  filterButtonText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "600",
  },
  filterButtonTextActive: {
    color: "#fff",
  },
  capturesList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  captureItem: {
    flexDirection: "row",
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#222",
  },
  captureMedia: {
    marginRight: 15,
  },
  captureThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  captureThumbnailText: {
    fontSize: 24,
  },
  captureInfo: {
    flex: 1,
  },
  captureDate: {
    color: "#666",
    fontSize: 12,
    marginBottom: 5,
  },
  captureNote: {
    color: "#fff",
    fontSize: 14,
    marginBottom: 8,
  },
  captureTags: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  captureTag: {
    color: "#007AFF",
    fontSize: 12,
    marginRight: 8,
    marginBottom: 4,
  },
  // Date picker styles
  dateSection: {
    marginBottom: 20,
  },
  dateLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
  },
  dateButton: {
    backgroundColor: "#333",
    borderRadius: 10,
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#444",
  },
  dateButtonText: {
    color: "#fff",
    fontSize: 16,
    flex: 1,
  },
  dateButtonIcon: {
    fontSize: 20,
    marginLeft: 10,
  },
  datePicker: {
    backgroundColor: "#333",
    borderRadius: 10,
    marginBottom: 20,
  },
  datePickerContainer: {
    backgroundColor: "#222",
    borderRadius: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  datePickerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  datePickerCloseButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  datePickerCloseText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  datePickerContent: {
    padding: 15,
  },
  dateInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  dateInputLabel: {
    color: "#fff",
    fontSize: 16,
    width: 60,
    marginRight: 10,
  },
  dateInput: {
    flex: 1,
    backgroundColor: "#333",
    color: "#fff",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#444",
  },
  dateQuickButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  dateQuickButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 2,
    alignItems: "center",
  },
  dateQuickButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
