// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Content Addressable Storage (CAS) implementation for images and thread data.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;

use crate::error::{Result, StorageError};
use crate::types::{
    AttachmentRegistry, OcrFrame, OcrRegion, StoredImage, ThreadData, ThreadMessage, ThreadMetadata,
};

const DEFAULT_OCR_MODEL_ID: &str = "pp-ocr-v5-en";
const AUTO_OCR_DISABLED_MODEL_ID: &str = "__meta_auto_ocr_disabled__";

fn is_supported_ocr_model_id(model_id: &str) -> bool {
    matches!(
        model_id,
        "pp-ocr-v5-en"
            | "pp-ocr-v5-latin"
            | "pp-ocr-v5-cyrillic"
            | "pp-ocr-v5-korean"
            | "pp-ocr-v5-cjk"
            | "pp-ocr-v5-devanagari"
    )
}

fn normalize_ocr_model_id(model_id: &str) -> &str {
    let trimmed = model_id.trim();
    if trimmed.is_empty() {
        return DEFAULT_OCR_MODEL_ID;
    }
    if is_supported_ocr_model_id(trimmed) {
        return trimmed;
    }
    DEFAULT_OCR_MODEL_ID
}

fn is_reserved_ocr_frame_id(model_id: &str) -> bool {
    model_id == AUTO_OCR_DISABLED_MODEL_ID
}

fn canonicalize_ocr_frame_id(model_id: &str) -> Option<&str> {
    let trimmed = model_id.trim();
    if trimmed.is_empty() {
        return None;
    }
    if is_supported_ocr_model_id(trimmed) || is_reserved_ocr_frame_id(trimmed) {
        return Some(trimmed);
    }
    None
}

fn retain_supported_ocr_frame_ids(frame: &mut OcrFrame) -> bool {
    let keys: Vec<String> = frame.keys().cloned().collect();
    let mut changed = false;

    for key in keys {
        if !is_supported_ocr_model_id(&key) && !is_reserved_ocr_frame_id(&key) {
            frame.remove(&key);
            changed = true;
        }
    }

    changed
}

/// Main storage manager for threads and images.
pub struct ThreadStorage {
    /// Base directory for all storage.
    base_dir: PathBuf,
    /// Directory for CAS objects (images).
    objects_dir: PathBuf,
    /// Path to the thread index file.
    index_path: PathBuf,
}

impl ThreadStorage {
    /// Create a new storage manager with a custom base directory.
    ///
    /// This is the primary constructor for thread storage.
    /// Use this with the global threads directory.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use squigit_memory::ThreadStorage;
    /// use std::path::PathBuf;
    ///
    /// let threads_dir = PathBuf::from("/path/to/squigit/threads");
    /// let storage = ThreadStorage::with_base_dir(threads_dir).unwrap();
    /// ```
    pub fn with_base_dir(base_dir: PathBuf) -> Result<Self> {
        let objects_dir = crate::paths::base_config_dir()
            .ok_or(StorageError::NoDataDir)?
            .join("objects");
        let index_path = base_dir.join("index.json");

        // Create directories if they don't exist
        fs::create_dir_all(&objects_dir)?;

        Ok(Self {
            base_dir,
            objects_dir,
            index_path,
        })
    }

    /// Create a new storage manager using the default location.
    ///
    /// Uses `~/.config/squigit/threads/` on Linux (and appropriate config dirs on other OSs).
    ///
    /// This uses the global thread directory shared by every account and guest mode.
    pub fn new() -> Result<Self> {
        let base_dir = crate::paths::base_config_dir()
            .ok_or(StorageError::NoDataDir)?
            .join("threads");

        Self::with_base_dir(base_dir)
    }

    /// Get the base storage directory path.
    pub fn base_dir(&self) -> &PathBuf {
        &self.base_dir
    }

    /// Get the objects directory path.
    pub fn objects_dir(&self) -> &PathBuf {
        &self.objects_dir
    }

    // =========================================================================
    // Image Storage (CAS)
    // =========================================================================

    /// Store image bytes using content-addressable storage.
    ///
    /// Returns the hash and path to the stored image.
    /// If the image already exists (same hash), returns the existing path.
    pub fn store_image(&self, bytes: &[u8], explicit_tone: Option<String>) -> Result<StoredImage> {
        if bytes.is_empty() {
            return Err(StorageError::EmptyImage);
        }

        // Compute BLAKE3 hash
        let hash = blake3::hash(bytes).to_hex().to_string();

        // Create subdirectory using first 2 chars of hash
        let prefix = &hash[..2];
        let subdir = self.objects_dir.join(prefix);
        fs::create_dir_all(&subdir)?;

        // Full path: objects/<prefix>/<hash>.png
        let file_path = subdir.join(format!("{}.png", hash));
        let tone_path = subdir.join(format!("{}.tone", hash));

        let explicit_tone = explicit_tone
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(|v| v.to_string());
        let mut tone = explicit_tone.clone().unwrap_or_else(|| "d".to_string());

        // Only write if file doesn't exist (deduplication)
        if !file_path.exists() {
            let mut file = File::create(&file_path)?;
            file.write_all(bytes)?;

            // Cache explicit tone
            let _ = fs::write(&tone_path, &tone);
        } else if let Some(explicit) = explicit_tone {
            // If caller provided a tone for an existing deduplicated object,
            // prefer it over stale cached values.
            tone = explicit;
            let _ = fs::write(&tone_path, &tone);
        } else if tone_path.exists() {
            if let Ok(cached) = fs::read_to_string(&tone_path) {
                let trimmed = cached.trim();
                if !trimmed.is_empty() {
                    tone = trimmed.to_string();
                }
            }
        }

        Ok(StoredImage {
            hash,
            path: file_path.to_string_lossy().to_string(),
            tone: Some(tone),
        })
    }

    /// Store an image from a file path.
    pub fn store_image_from_path(
        &self,
        path: &str,
        explicit_tone: Option<String>,
    ) -> Result<StoredImage> {
        let mut file = File::open(path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;
        self.store_image(&buffer, explicit_tone)
    }

    /// Store a generic file using content-addressable storage, preserving the original extension.
    ///
    /// Returns the hash and path to the stored file.
    /// If the file already exists (same hash + extension), returns the existing path.
    pub fn store_file(
        &self,
        bytes: &[u8],
        extension: &str,
        explicit_tone: Option<String>,
    ) -> Result<StoredImage> {
        if bytes.is_empty() {
            return Err(StorageError::EmptyImage);
        }

        let hash = blake3::hash(bytes).to_hex().to_string();

        let prefix = &hash[..2];
        let subdir = self.objects_dir.join(prefix);
        fs::create_dir_all(&subdir)?;

        let ext = if extension.is_empty() {
            "bin"
        } else {
            extension
        };
        let is_image_ext = ext == "png" || ext == "jpeg" || ext == "jpg" || ext == "webp";
        let file_path = subdir.join(format!("{}.{}", hash, ext));
        let tone_path = subdir.join(format!("{}.tone", hash));
        let explicit_tone = explicit_tone
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(|v| v.to_string());
        let mut tone = explicit_tone.clone().unwrap_or_else(|| "d".to_string());

        if !file_path.exists() {
            let mut file = File::create(&file_path)?;
            file.write_all(bytes)?;

            if is_image_ext {
                let _ = fs::write(&tone_path, &tone);
            }
        } else if is_image_ext {
            if let Some(explicit) = explicit_tone {
                tone = explicit;
                let _ = fs::write(&tone_path, &tone);
            } else if tone_path.exists() {
                if let Ok(cached) = fs::read_to_string(&tone_path) {
                    let trimmed = cached.trim();
                    if !trimmed.is_empty() {
                        tone = trimmed.to_string();
                    }
                }
            }
        } else if tone_path.exists() {
            if let Ok(cached) = fs::read_to_string(&tone_path) {
                let trimmed = cached.trim();
                if !trimmed.is_empty() {
                    tone = trimmed.to_string();
                }
            }
        }

        Ok(StoredImage {
            hash,
            path: file_path.to_string_lossy().to_string(),
            tone: Some(tone),
        })
    }

    /// Store a file from a filesystem path, preserving the original extension.
    pub fn store_file_from_path(
        &self,
        path: &str,
        explicit_tone: Option<String>,
    ) -> Result<StoredImage> {
        let source = std::path::Path::new(path);
        let extension = source
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let mut file = File::open(path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;
        self.store_file(&buffer, &extension, explicit_tone)
    }

    /// Get the path to a stored image by its hash.
    pub fn get_image_path(&self, hash: &str) -> Result<String> {
        let prefix = hash.get(..2).ok_or(StorageError::InvalidHash)?;
        let file_path = self.objects_dir.join(prefix).join(format!("{}.png", hash));

        if file_path.exists() {
            Ok(file_path.to_string_lossy().to_string())
        } else {
            Err(StorageError::ImageNotFound(hash.to_string()))
        }
    }

    /// Get the cached tone for a stored image by its hash.
    pub fn get_image_tone(&self, hash: &str) -> Option<String> {
        let prefix = hash.get(..2)?;
        let tone_path = self.objects_dir.join(prefix).join(format!("{}.tone", hash));
        if tone_path.exists() {
            if let Ok(cached) = fs::read_to_string(&tone_path) {
                let trimmed = cached.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
        None
    }

    // =========================================================================
    // Thread Storage
    // =========================================================================

    /// Get the directory for a specific thread.
    fn thread_dir(&self, thread_id: &str) -> PathBuf {
        self.base_dir.join(thread_id)
    }

    /// Save a new thread or update an existing one.
    pub fn save_thread(&self, thread: &ThreadData) -> Result<()> {
        let thread_dir = self.thread_dir(&thread.metadata.id);
        fs::create_dir_all(&thread_dir)?;

        // Save metadata
        let meta_path = thread_dir.join("meta.json");
        let mut metadata = thread.metadata.clone();
        if metadata.image_brief.is_none() {
            metadata.image_brief = thread.image_brief.clone();
        }
        let meta_json = serde_json::to_string_pretty(&metadata)?;
        fs::write(&meta_path, meta_json)?;

        // Always save OCR frame file
        let ocr_path = thread_dir.join("ocr_frame.json");
        let ocr_json = serde_json::to_string_pretty(&thread.ocr_data)?;
        fs::write(&ocr_path, ocr_json)?;

        // Save messages as JSON only
        let messages_json_path = thread_dir.join("messages.json");
        if !thread.messages.is_empty() {
            let json_content = serde_json::to_string_pretty(&thread.messages)?;
            fs::write(&messages_json_path, json_content)?;
        } else if messages_json_path.exists() {
            fs::remove_file(&messages_json_path)?
        }

        let attachment_registry_path = thread_dir.join("attachment_registry.json");
        if !thread.attachment_registry.is_empty() {
            let registry_json = serde_json::to_string_pretty(&thread.attachment_registry)?;
            fs::write(&attachment_registry_path, registry_json)?;
        } else if attachment_registry_path.exists() {
            fs::remove_file(&attachment_registry_path)?;
        }

        // Update the index
        self.update_index(&metadata)?;

        Ok(())
    }

    /// Load a thread by ID.
    pub fn load_thread(&self, thread_id: &str) -> Result<ThreadData> {
        let thread_dir = self.thread_dir(thread_id);

        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }

        // Load metadata
        let meta_path = thread_dir.join("meta.json");
        let meta_json = fs::read_to_string(&meta_path)?;
        let mut metadata: ThreadMetadata = serde_json::from_str(&meta_json)?;
        let mut metadata_changed = false;
        if let Some(lang) = metadata.ocr_lang.clone() {
            let normalized_lang = normalize_ocr_model_id(&lang).to_string();
            if normalized_lang != lang {
                metadata.ocr_lang = Some(normalized_lang);
                metadata_changed = true;
            }
        }

        // Load OCR frame (supports one-time conversion from old ocr.json).
        let frame_path = thread_dir.join("ocr_frame.json");
        let old_frame_path = thread_dir.join("ocr.json");
        let mut frame_changed = false;
        let mut ocr_data: OcrFrame = if frame_path.exists() {
            let json = fs::read_to_string(&frame_path)?;
            serde_json::from_str(&json)?
        } else if old_frame_path.exists() {
            // Convert old flat array into frame format keyed by default model id.
            let json = fs::read_to_string(&old_frame_path)?;
            let old_regions: Vec<OcrRegion> = serde_json::from_str(&json).unwrap_or_default();
            let mut frame = OcrFrame::new();
            if !old_regions.is_empty() {
                frame.insert(DEFAULT_OCR_MODEL_ID.to_string(), Some(old_regions));
            }
            frame_changed = true;
            let _ = fs::remove_file(&old_frame_path);
            frame
        } else {
            OcrFrame::new()
        };

        if retain_supported_ocr_frame_ids(&mut ocr_data) {
            frame_changed = true;
        }
        if frame_changed {
            let new_json = serde_json::to_string_pretty(&ocr_data)?;
            fs::write(&frame_path, new_json)?;
        }
        if metadata_changed {
            let new_meta = serde_json::to_string_pretty(&metadata)?;
            fs::write(&meta_path, new_meta)?;
            self.update_index(&metadata)?;
        }

        // Load messages from JSON
        let messages_json_path = thread_dir.join("messages.json");
        let messages = if messages_json_path.exists() {
            let json_content = fs::read_to_string(&messages_json_path)?;
            serde_json::from_str::<Vec<ThreadMessage>>(&json_content)?
        } else {
            Vec::new()
        };

        // Load rolling summary
        let summary_path = thread_dir.join("rolling_summary.txt");
        let rolling_summary = if summary_path.exists() {
            Some(fs::read_to_string(&summary_path)?)
        } else {
            None
        };

        let image_brief = metadata.image_brief.clone();

        let attachment_registry_path = thread_dir.join("attachment_registry.json");
        let attachment_registry = if attachment_registry_path.exists() {
            let json = fs::read_to_string(&attachment_registry_path)?;
            serde_json::from_str::<AttachmentRegistry>(&json)?
        } else {
            AttachmentRegistry::new()
        };

        Ok(ThreadData {
            metadata,
            messages,
            ocr_data,
            rolling_summary,
            attachment_registry,
            image_brief,
        })
    }

    /// Save the detected tone for a thread to its metadata directly.
    pub fn save_image_tone(&self, thread_id: &str, tone: &str) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }
        let meta_path = thread_dir.join("meta.json");
        let meta_json = fs::read_to_string(&meta_path)?;
        let mut metadata: ThreadMetadata = serde_json::from_str(&meta_json)?;

        metadata.image_tone = Some(tone.to_string());
        metadata.updated_at = chrono::Utc::now();

        let new_meta = serde_json::to_string_pretty(&metadata)?;
        fs::write(&meta_path, new_meta)?;
        self.update_index(&metadata)?;

        Ok(())
    }

    /// Save image brief for a thread.
    pub fn save_image_brief(&self, thread_id: &str, brief: &str) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }
        let meta_path = thread_dir.join("meta.json");
        let meta_json = fs::read_to_string(&meta_path)?;
        let mut metadata: ThreadMetadata = serde_json::from_str(&meta_json)?;
        metadata.image_brief = Some(brief.to_string());

        let new_meta = serde_json::to_string_pretty(&metadata)?;
        fs::write(&meta_path, new_meta)?;
        self.update_index(&metadata)?;
        Ok(())
    }

    /// List all threads (metadata only).
    pub fn list_threads(&self) -> Result<Vec<ThreadMetadata>> {
        if !self.index_path.exists() {
            return Ok(Vec::new());
        }

        let index_json = fs::read_to_string(&self.index_path)?;
        let threads: Vec<ThreadMetadata> = serde_json::from_str(&index_json)?;
        Ok(threads)
    }

    /// Delete a thread by ID.
    pub fn delete_thread(&self, thread_id: &str) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);

        if thread_dir.exists() {
            fs::remove_dir_all(&thread_dir)?;
        }

        // Update index to remove the thread
        self.remove_from_index(thread_id)?;

        Ok(())
    }

    /// Update thread metadata (for rename, pin, star, etc.).
    pub fn update_thread_metadata(&self, metadata: &ThreadMetadata) -> Result<()> {
        let thread_dir = self.thread_dir(&metadata.id);

        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(metadata.id.clone()));
        }

        let meta_path = thread_dir.join("meta.json");
        let mut metadata_to_save = metadata.clone();
        if meta_path.exists() {
            let current_json = fs::read_to_string(&meta_path)?;
            let current: ThreadMetadata = serde_json::from_str(&current_json)?;
            if metadata_to_save.image_brief.is_none() {
                metadata_to_save.image_brief = current.image_brief;
            }
        }

        // Save updated metadata
        let meta_json = serde_json::to_string_pretty(&metadata_to_save)?;
        fs::write(&meta_path, meta_json)?;

        // Update index
        self.update_index(&metadata_to_save)?;

        Ok(())
    }

    // =========================================================================
    // OCR and Thread Metadata
    // =========================================================================

    /// Save OCR data for a specific model into the thread's OCR frame.
    /// Merges the data into the existing frame (read-modify-write).
    pub fn save_ocr_data(
        &self,
        thread_id: &str,
        model_id: &str,
        ocr_data: &[OcrRegion],
    ) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        fs::create_dir_all(&thread_dir)?;
        let canonical_model_id = canonicalize_ocr_frame_id(model_id)
            .ok_or_else(|| StorageError::InvalidOcrModel(model_id.to_string()))?;

        let frame_path = thread_dir.join("ocr_frame.json");
        let mut frame: OcrFrame = if frame_path.exists() {
            let json = fs::read_to_string(&frame_path)?;
            serde_json::from_str(&json)?
        } else {
            OcrFrame::new()
        };
        retain_supported_ocr_frame_ids(&mut frame);

        frame.insert(canonical_model_id.to_string(), Some(ocr_data.to_vec()));

        let json = serde_json::to_string_pretty(&frame)?;
        fs::write(&frame_path, json)?;

        Ok(())
    }

    /// Get OCR data for a specific model from the thread's frame.
    /// Returns None if the model hasn't scanned yet, or empty vec if no frame exists.
    pub fn get_ocr_data(&self, thread_id: &str, model_id: &str) -> Result<Option<Vec<OcrRegion>>> {
        let frame_path = self.thread_dir(thread_id).join("ocr_frame.json");
        let canonical_model_id = canonicalize_ocr_frame_id(model_id)
            .ok_or_else(|| StorageError::InvalidOcrModel(model_id.to_string()))?;

        if !frame_path.exists() {
            return Ok(None);
        }

        let json = fs::read_to_string(&frame_path)?;
        let mut frame: OcrFrame = serde_json::from_str(&json)?;
        if retain_supported_ocr_frame_ids(&mut frame) {
            let normalized = serde_json::to_string_pretty(&frame)?;
            fs::write(&frame_path, normalized)?;
        }
        Ok(frame.get(canonical_model_id).cloned().unwrap_or(None))
    }

    /// Get the entire OCR frame for a thread.
    pub fn get_ocr_frame(&self, thread_id: &str) -> Result<OcrFrame> {
        let frame_path = self.thread_dir(thread_id).join("ocr_frame.json");

        if !frame_path.exists() {
            return Ok(OcrFrame::new());
        }

        let json = fs::read_to_string(&frame_path)?;
        let mut frame: OcrFrame = serde_json::from_str(&json)?;
        if retain_supported_ocr_frame_ids(&mut frame) {
            let normalized = serde_json::to_string_pretty(&frame)?;
            fs::write(&frame_path, normalized)?;
        }
        Ok(frame)
    }

    /// Initialize an OCR frame with null values for all given model IDs.
    /// Only adds keys that don't already exist (won't overwrite cached data).
    pub fn init_ocr_frame(&self, thread_id: &str, model_ids: &[String]) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        fs::create_dir_all(&thread_dir)?;

        let frame_path = thread_dir.join("ocr_frame.json");
        let mut frame: OcrFrame = if frame_path.exists() {
            let json = fs::read_to_string(&frame_path)?;
            serde_json::from_str(&json)?
        } else {
            OcrFrame::new()
        };
        retain_supported_ocr_frame_ids(&mut frame);

        for model_id in model_ids {
            let canonical_model_id = canonicalize_ocr_frame_id(model_id)
                .ok_or_else(|| StorageError::InvalidOcrModel(model_id.clone()))?;
            frame.entry(canonical_model_id.to_string()).or_insert(None);
        }

        let json = serde_json::to_string_pretty(&frame)?;
        fs::write(&frame_path, json)?;

        Ok(())
    }

    /// Save the reverse image search URL for a thread.
    pub fn save_reverse_image_search_url(&self, thread_id: &str, url: &str) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }

        let meta_path = thread_dir.join("meta.json");
        let meta_json = fs::read_to_string(&meta_path)?;
        let mut metadata: ThreadMetadata = serde_json::from_str(&meta_json)?;
        metadata.reverse_image_search_url = Some(url.to_string());
        fs::write(&meta_path, serde_json::to_string_pretty(&metadata)?)?;
        self.update_index(&metadata)?;

        Ok(())
    }

    /// Get the reverse image search URL for a thread.
    pub fn get_reverse_image_search_url(&self, thread_id: &str) -> Result<Option<String>> {
        let meta_path = self.thread_dir(thread_id).join("meta.json");
        let meta_json = fs::read_to_string(&meta_path)?;
        let metadata: ThreadMetadata = serde_json::from_str(&meta_json)?;
        Ok(metadata.reverse_image_search_url)
    }

    /// Save rolling summary for a thread.
    pub fn save_rolling_summary(&self, thread_id: &str, summary: &str) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        fs::create_dir_all(&thread_dir)?;

        let summary_path = thread_dir.join("rolling_summary.txt");
        fs::write(&summary_path, summary)?;

        Ok(())
    }

    /// Get rolling summary for a thread.
    pub fn get_rolling_summary(&self, thread_id: &str) -> Result<Option<String>> {
        let summary_path = self.thread_dir(thread_id).join("rolling_summary.txt");

        if !summary_path.exists() {
            return Ok(None);
        }

        let summary = fs::read_to_string(&summary_path)?;
        Ok(Some(summary))
    }

    /// Append a message to a thread.
    pub fn append_message(&self, thread_id: &str, message: &ThreadMessage) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        fs::create_dir_all(&thread_dir)?;

        let messages_json_path = thread_dir.join("messages.json");

        // Load existing messages or start fresh
        let mut json_messages: Vec<ThreadMessage> = if messages_json_path.exists() {
            let json = fs::read_to_string(&messages_json_path)?;
            serde_json::from_str(&json)?
        } else {
            Vec::new()
        };
        json_messages.push(message.clone());
        fs::write(
            &messages_json_path,
            serde_json::to_string_pretty(&json_messages)?,
        )?;

        // Update the thread's updated_at timestamp
        let meta_path = thread_dir.join("meta.json");
        if meta_path.exists() {
            let meta_json = fs::read_to_string(&meta_path)?;
            let mut metadata: ThreadMetadata = serde_json::from_str(&meta_json)?;
            metadata.updated_at = chrono::Utc::now();
            let updated_json = serde_json::to_string_pretty(&metadata)?;
            fs::write(&meta_path, updated_json)?;
            self.update_index(&metadata)?;
        }

        Ok(())
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    /// Update the index with thread metadata.
    fn update_index(&self, metadata: &ThreadMetadata) -> Result<()> {
        let mut threads = self.list_threads().unwrap_or_default();

        // Remove existing entry if present
        threads.retain(|c| c.id != metadata.id);

        // Add updated entry
        threads.push(metadata.clone());

        // Sort by updated_at descending
        threads.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

        let json = serde_json::to_string_pretty(&threads)?;
        fs::write(&self.index_path, json)?;

        Ok(())
    }

    /// Remove a thread from the index.
    fn remove_from_index(&self, thread_id: &str) -> Result<()> {
        let mut threads = self.list_threads().unwrap_or_default();
        threads.retain(|c| c.id != thread_id);

        let json = serde_json::to_string_pretty(&threads)?;
        fs::write(&self.index_path, json)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[allow(unused_imports)]
    use crate::types::{ThreadAttachmentKind, ThreadAttachmentRecord};

    fn make_test_storage() -> (ThreadStorage, PathBuf) {
        let base_dir =
            std::env::temp_dir().join(format!("squigit-ocr-storage-test-{}", uuid::Uuid::new_v4()));
        let storage = ThreadStorage::with_base_dir(base_dir.clone()).expect("storage init");
        (storage, base_dir)
    }

    #[test]
    fn auto_ocr_disabled_key_is_preserved_and_does_not_overwrite_english() {
        let (storage, base_dir) = make_test_storage();
        let metadata = ThreadMetadata::new("Test".to_string(), "0".repeat(64), None);
        let thread = ThreadData::new(metadata.clone());
        storage.save_thread(&thread).expect("save thread");

        let en_regions = vec![OcrRegion {
            text: "hello".to_string(),
            bbox: vec![vec![0, 0], vec![10, 0], vec![10, 10], vec![0, 10]],
        }];

        storage
            .save_ocr_data(&metadata.id, DEFAULT_OCR_MODEL_ID, &en_regions)
            .expect("save english ocr");
        storage
            .save_ocr_data(&metadata.id, AUTO_OCR_DISABLED_MODEL_ID, &[])
            .expect("save auto-disable marker");

        let frame = storage.get_ocr_frame(&metadata.id).expect("load frame");
        let en = frame
            .get(DEFAULT_OCR_MODEL_ID)
            .and_then(|v| v.as_ref())
            .expect("english ocr present");
        assert_eq!(en.len(), 1);

        let auto_disabled = frame
            .get(AUTO_OCR_DISABLED_MODEL_ID)
            .and_then(|v| v.as_ref())
            .expect("auto-disable marker present");
        assert!(auto_disabled.is_empty());

        let _ = std::fs::remove_dir_all(base_dir);
    }

    #[test]
    fn invalid_ocr_model_id_returns_error() {
        let (storage, base_dir) = make_test_storage();
        let result = storage.save_ocr_data("thread-1", "bogus-model", &[]);

        assert!(matches!(result, Err(StorageError::InvalidOcrModel(_))));

        let _ = std::fs::remove_dir_all(base_dir);
    }

    #[test]
    fn attachment_registry_round_trips_via_sidecar() {
        let (storage, base_dir) = make_test_storage();
        let metadata = ThreadMetadata::new("Registry".to_string(), "0".repeat(64), None);
        let mut thread = ThreadData::new(metadata.clone());
        thread.attachment_registry.insert(
            "/tmp/threads/objects/ab/file.pdf".to_string(),
            ThreadAttachmentRecord {
                cas_path: "/tmp/threads/objects/ab/file.pdf".to_string(),
                display_name: "file.pdf".to_string(),
                kind: ThreadAttachmentKind::DocumentUpload,
                mime_type: "application/pdf".to_string(),
                source_path: None,
                provider_file: None,
                last_seen_at: chrono::Utc::now(),
                last_recalled_at: None,
            },
        );

        storage
            .save_thread(&thread)
            .expect("save thread with registry");

        let loaded = storage.load_thread(&metadata.id).expect("load thread");
        assert_eq!(loaded.attachment_registry.len(), 1);
        assert!(loaded
            .attachment_registry
            .contains_key("/tmp/threads/objects/ab/file.pdf"));

        let _ = std::fs::remove_dir_all(base_dir);
    }
}
