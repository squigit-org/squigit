// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Content Addressable Storage (CAS) implementation for images and thread data.

use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use crate::error::{Result, StorageError};
use crate::types::{
    default_ocr_annotations, AttachmentRegistry, ContextWindow, OcrAnnotationEntry, OcrAnnotations,
    OcrModelAnnotation, OcrRegion, ReverseImageSearchCache, StoredImage, ThreadData, ThreadMessage,
    ThreadMetadata, EMPTY_STATE_ASSET_ID,
};

const OCR_ANNOTATIONS_FILE: &str = "ocr_annotations.json";
const CONTEXT_WINDOW_FILE: &str = "context_window.json";
const REVERSE_IMAGE_SEARCH_FILE: &str = "reverse_image_search.json";
const MESSAGES_FILE: &str = "messages.json";
const ATTACHMENT_REGISTRY_FILE: &str = "attachment_registry.json";
type ThreadIndex = BTreeMap<String, ThreadMetadata>;

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

fn canonicalize_ocr_annotations_id(model_id: &str) -> Option<&str> {
    let trimmed = model_id.trim();
    if trimmed.is_empty() {
        return None;
    }
    if is_supported_ocr_model_id(trimmed) {
        return Some(trimmed);
    }
    None
}

fn retain_supported_ocr_annotations_ids(annotations: &mut OcrAnnotations) -> bool {
    let unsupported_keys: Vec<String> = annotations
        .keys()
        .filter(|key| key.as_str() != EMPTY_STATE_ASSET_ID && !is_supported_ocr_model_id(key))
        .cloned()
        .collect();

    for key in &unsupported_keys {
        annotations.remove(key);
    }

    !unsupported_keys.is_empty()
}

fn ensure_empty_state_asset(annotations: &mut OcrAnnotations) -> bool {
    if matches!(
        annotations.get(EMPTY_STATE_ASSET_ID),
        Some(OcrAnnotationEntry::EmptyState(_))
    ) {
        return false;
    }

    annotations.insert(
        EMPTY_STATE_ASSET_ID.to_string(),
        OcrAnnotationEntry::EmptyState(Vec::new()),
    );
    true
}

fn ocr_annotations_path(thread_dir: &Path) -> PathBuf {
    thread_dir.join(OCR_ANNOTATIONS_FILE)
}

fn context_window_path(thread_dir: &Path) -> PathBuf {
    thread_dir.join(CONTEXT_WINDOW_FILE)
}

fn reverse_image_search_path(thread_dir: &Path) -> PathBuf {
    thread_dir.join(REVERSE_IMAGE_SEARCH_FILE)
}

fn messages_path(thread_dir: &Path) -> PathBuf {
    thread_dir.join(MESSAGES_FILE)
}

fn attachment_registry_path(thread_dir: &Path) -> PathBuf {
    thread_dir.join(ATTACHMENT_REGISTRY_FILE)
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
    /// use squigit_storage::ThreadStorage;
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
        fs::create_dir_all(&base_dir)?;
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

        // Always save OCR annotations file.
        let ocr_path = ocr_annotations_path(&thread_dir);
        let mut ocr_data = thread.ocr_data.clone();
        ensure_empty_state_asset(&mut ocr_data);
        retain_supported_ocr_annotations_ids(&mut ocr_data);
        let ocr_json = serde_json::to_string_pretty(&ocr_data)?;
        fs::write(&ocr_path, ocr_json)?;

        // Create thread-local state files.
        let context_path = context_window_path(&thread_dir);
        if !context_path.exists() {
            fs::write(
                &context_path,
                serde_json::to_string_pretty(&thread.context_window)?,
            )?;
        }

        let reverse_path = reverse_image_search_path(&thread_dir);
        if !reverse_path.exists() {
            fs::write(
                &reverse_path,
                serde_json::to_string_pretty(&thread.reverse_image_search)?,
            )?;
        }

        let messages_json_path = messages_path(&thread_dir);
        let json_content = serde_json::to_string_pretty(&thread.messages)?;
        fs::write(&messages_json_path, json_content)?;

        let attachment_registry_path = attachment_registry_path(&thread_dir);
        if !thread.attachment_registry.is_empty() {
            let registry_json = serde_json::to_string_pretty(&thread.attachment_registry)?;
            fs::write(&attachment_registry_path, registry_json)?;
        } else if attachment_registry_path.exists() {
            fs::remove_file(&attachment_registry_path)?;
        }

        self.update_index(&thread.metadata)?;

        Ok(())
    }

    /// Load a thread by ID.
    pub fn load_thread(&self, thread_id: &str) -> Result<ThreadData> {
        let thread_dir = self.thread_dir(thread_id);

        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }

        let metadata = self.get_index_metadata(thread_id)?;

        // Load OCR annotations from the only supported storage file.
        let ocr_path = ocr_annotations_path(&thread_dir);
        let mut annotations_changed = false;
        let mut ocr_data: OcrAnnotations = if ocr_path.exists() {
            let json = fs::read_to_string(&ocr_path)?;
            serde_json::from_str(&json)?
        } else {
            default_ocr_annotations()
        };

        if ensure_empty_state_asset(&mut ocr_data) {
            annotations_changed = true;
        }
        if retain_supported_ocr_annotations_ids(&mut ocr_data) {
            annotations_changed = true;
        }
        if annotations_changed {
            let new_json = serde_json::to_string_pretty(&ocr_data)?;
            fs::write(&ocr_path, new_json)?;
        }
        let messages_json_path = messages_path(&thread_dir);
        let messages = if messages_json_path.exists() {
            let json_content = fs::read_to_string(&messages_json_path)?;
            serde_json::from_str::<Vec<ThreadMessage>>(&json_content)?
        } else {
            Vec::new()
        };

        let context_path = context_window_path(&thread_dir);
        let context_window = if context_path.exists() {
            let json = fs::read_to_string(&context_path)?;
            serde_json::from_str::<ContextWindow>(&json)?
        } else {
            let context = ContextWindow::default();
            fs::write(&context_path, serde_json::to_string_pretty(&context)?)?;
            context
        };

        let reverse_path = reverse_image_search_path(&thread_dir);
        let reverse_image_search = if reverse_path.exists() {
            let json = fs::read_to_string(&reverse_path)?;
            serde_json::from_str::<ReverseImageSearchCache>(&json)?
        } else {
            let cache = ReverseImageSearchCache::default();
            fs::write(&reverse_path, serde_json::to_string_pretty(&cache)?)?;
            cache
        };

        let attachment_registry_path = attachment_registry_path(&thread_dir);
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
            context_window,
            reverse_image_search,
            attachment_registry,
            image_tone: Some("d".to_string()),
            image_brief: Some("summary of the image here".to_string()),
        })
    }

    /// Save image tone placeholder. Object manifests will own this value.
    pub fn save_image_tone(&self, thread_id: &str, _tone: &str) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }
        Ok(())
    }

    /// Save image brief placeholder. Object manifests will own this value.
    pub fn save_image_brief(&self, thread_id: &str, _brief: &str) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }
        Ok(())
    }

    /// List all threads (metadata only).
    pub fn list_threads(&self) -> Result<Vec<ThreadMetadata>> {
        if !self.index_path.exists() {
            return Ok(Vec::new());
        }

        let mut threads: Vec<ThreadMetadata> = self.read_index()?.into_values().collect();
        threads.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
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

        self.update_index(metadata)?;

        Ok(())
    }

    // =========================================================================
    // OCR and Thread State
    // =========================================================================

    /// Save OCR data for a specific model into the thread's OCR annotations.
    /// Merges the data into the existing annotations (read-modify-write).
    pub fn save_ocr_data(
        &self,
        thread_id: &str,
        model_id: &str,
        ocr_data: &[OcrRegion],
    ) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        fs::create_dir_all(&thread_dir)?;
        let canonical_model_id = canonicalize_ocr_annotations_id(model_id)
            .ok_or_else(|| StorageError::InvalidOcrModel(model_id.to_string()))?;

        let ocr_path = ocr_annotations_path(&thread_dir);
        let mut annotations: OcrAnnotations = if ocr_path.exists() {
            let json = fs::read_to_string(&ocr_path)?;
            serde_json::from_str(&json)?
        } else {
            default_ocr_annotations()
        };
        ensure_empty_state_asset(&mut annotations);
        retain_supported_ocr_annotations_ids(&mut annotations);

        annotations.insert(
            canonical_model_id.to_string(),
            OcrAnnotationEntry::Model(OcrModelAnnotation {
                scanned_at: Some(chrono::Utc::now()),
                ocr_data: ocr_data.to_vec(),
            }),
        );

        let json = serde_json::to_string_pretty(&annotations)?;
        fs::write(&ocr_path, json)?;

        Ok(())
    }

    /// Get OCR data for a specific model from the thread's annotations.
    /// Returns None if the model hasn't scanned yet, or if no annotations file exists.
    pub fn get_ocr_data(&self, thread_id: &str, model_id: &str) -> Result<Option<Vec<OcrRegion>>> {
        let thread_dir = self.thread_dir(thread_id);
        let ocr_path = ocr_annotations_path(&thread_dir);
        let canonical_model_id = canonicalize_ocr_annotations_id(model_id)
            .ok_or_else(|| StorageError::InvalidOcrModel(model_id.to_string()))?;

        if !ocr_path.exists() {
            return Ok(None);
        }

        let json = fs::read_to_string(&ocr_path)?;
        let mut annotations: OcrAnnotations = serde_json::from_str(&json)?;
        let mut annotations_changed = ensure_empty_state_asset(&mut annotations);
        if retain_supported_ocr_annotations_ids(&mut annotations) {
            annotations_changed = true;
        }
        if annotations_changed {
            fs::write(&ocr_path, serde_json::to_string_pretty(&annotations)?)?;
        }

        let data = annotations
            .get(canonical_model_id)
            .and_then(|entry| match entry {
                OcrAnnotationEntry::Model(model) if model.scanned_at.is_some() => {
                    Some(model.ocr_data.clone())
                }
                _ => None,
            });
        Ok(data)
    }

    /// Get the entire OCR annotations for a thread.
    pub fn get_ocr_annotations(&self, thread_id: &str) -> Result<OcrAnnotations> {
        let thread_dir = self.thread_dir(thread_id);
        let ocr_path = ocr_annotations_path(&thread_dir);

        if !ocr_path.exists() {
            return Ok(default_ocr_annotations());
        }

        let json = fs::read_to_string(&ocr_path)?;
        let mut annotations: OcrAnnotations = serde_json::from_str(&json)?;
        let mut annotations_changed = ensure_empty_state_asset(&mut annotations);
        if retain_supported_ocr_annotations_ids(&mut annotations) {
            annotations_changed = true;
        }
        if annotations_changed {
            fs::write(&ocr_path, serde_json::to_string_pretty(&annotations)?)?;
        }
        Ok(annotations)
    }

    /// Initialize OCR annotations with empty entries for all given model IDs.
    /// Only adds keys that don't already exist (won't overwrite cached data).
    pub fn init_ocr_annotations(&self, thread_id: &str, model_ids: &[String]) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        fs::create_dir_all(&thread_dir)?;

        let ocr_path = ocr_annotations_path(&thread_dir);
        let mut annotations: OcrAnnotations = if ocr_path.exists() {
            let json = fs::read_to_string(&ocr_path)?;
            serde_json::from_str(&json)?
        } else {
            default_ocr_annotations()
        };
        ensure_empty_state_asset(&mut annotations);
        retain_supported_ocr_annotations_ids(&mut annotations);

        for model_id in model_ids {
            let canonical_model_id = canonicalize_ocr_annotations_id(model_id)
                .ok_or_else(|| StorageError::InvalidOcrModel(model_id.clone()))?;
            annotations
                .entry(canonical_model_id.to_string())
                .or_insert(OcrAnnotationEntry::Model(OcrModelAnnotation {
                    scanned_at: None,
                    ocr_data: Vec::new(),
                }));
        }

        let json = serde_json::to_string_pretty(&annotations)?;
        fs::write(&ocr_path, json)?;

        Ok(())
    }

    /// Save the reverse image search cache for a thread.
    pub fn save_reverse_image_search_cache(
        &self,
        thread_id: &str,
        imgbb_url: &str,
        google_lens_url: &str,
    ) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }

        let cache = ReverseImageSearchCache {
            imgbb_url: Some(imgbb_url.to_string()),
            google_lens_url: Some(google_lens_url.to_string()),
            created_at: Some(chrono::Utc::now()),
        };
        fs::write(
            reverse_image_search_path(&thread_dir),
            serde_json::to_string_pretty(&cache)?,
        )?;

        Ok(())
    }

    /// Get the reverse image search cache for a thread.
    pub fn get_reverse_image_search_cache(
        &self,
        thread_id: &str,
    ) -> Result<Option<ReverseImageSearchCache>> {
        let thread_dir = self.thread_dir(thread_id);
        let path = reverse_image_search_path(&thread_dir);
        if !path.exists() {
            return Ok(None);
        }

        let json = fs::read_to_string(path)?;
        let cache = serde_json::from_str::<ReverseImageSearchCache>(&json)?;
        Ok(Some(cache))
    }

    /// Append a message to a thread.
    pub fn append_message(&self, thread_id: &str, message: &ThreadMessage) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        fs::create_dir_all(&thread_dir)?;

        let messages_json_path = messages_path(&thread_dir);

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

        if let Ok(mut metadata) = self.get_index_metadata(thread_id) {
            metadata.updated_at = chrono::Utc::now();
            self.update_index(&metadata)?;
        }

        Ok(())
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    fn read_index(&self) -> Result<ThreadIndex> {
        if !self.index_path.exists() {
            return Ok(ThreadIndex::new());
        }

        let index_json = fs::read_to_string(&self.index_path)?;
        let index = serde_json::from_str::<ThreadIndex>(&index_json)?;
        Ok(index)
    }

    fn write_index(&self, index: &ThreadIndex) -> Result<()> {
        let json = serde_json::to_string_pretty(index)?;
        fs::write(&self.index_path, json)?;
        Ok(())
    }

    fn get_index_metadata(&self, thread_id: &str) -> Result<ThreadMetadata> {
        let mut index = self.read_index()?;
        index
            .remove(thread_id)
            .ok_or_else(|| StorageError::ThreadNotFound(thread_id.to_string()))
    }

    /// Update the index with thread metadata.
    fn update_index(&self, metadata: &ThreadMetadata) -> Result<()> {
        let mut index = self.read_index()?;
        index.insert(metadata.id.clone(), metadata.clone());
        self.write_index(&index)
    }

    /// Remove a thread from the index.
    fn remove_from_index(&self, thread_id: &str) -> Result<()> {
        let mut index = self.read_index()?;
        index.remove(thread_id);
        self.write_index(&index)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[allow(unused_imports)]
    use crate::types::{ThreadAttachmentKind, ThreadAttachmentRecord};

    fn make_test_storage() -> (ThreadStorage, PathBuf) {
        let base_dir =
            std::env::temp_dir().join(format!("squigit-storage-test-{}", uuid::Uuid::new_v4()));
        let storage = ThreadStorage::with_base_dir(base_dir.clone()).expect("storage init");
        (storage, base_dir)
    }

    #[test]
    fn empty_state_asset_is_preserved_and_does_not_overwrite_english() {
        let (storage, base_dir) = make_test_storage();
        let metadata = ThreadMetadata::new("Test".to_string(), "0".repeat(64));
        let thread = ThreadData::new(metadata.clone());
        storage.save_thread(&thread).expect("save thread");

        let en_regions = vec![OcrRegion {
            text: "hello".to_string(),
            bbox: vec![vec![0, 0], vec![10, 0], vec![10, 10], vec![0, 10]],
        }];

        storage
            .save_ocr_data(&metadata.id, "pp-ocr-v5-en", &en_regions)
            .expect("save english ocr");

        let annotations = storage
            .get_ocr_annotations(&metadata.id)
            .expect("load annotations");
        let en = annotations
            .get("pp-ocr-v5-en")
            .and_then(|entry| match entry {
                OcrAnnotationEntry::Model(model) => Some(&model.ocr_data),
                OcrAnnotationEntry::EmptyState(_) => None,
            })
            .expect("english ocr present");
        assert_eq!(en.len(), 1);

        let empty_state_asset = annotations
            .get(EMPTY_STATE_ASSET_ID)
            .and_then(|entry| match entry {
                OcrAnnotationEntry::EmptyState(items) => Some(items),
                OcrAnnotationEntry::Model(_) => None,
            })
            .expect("empty-state asset present");
        assert!(empty_state_asset.is_empty());

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
        let metadata = ThreadMetadata::new("Registry".to_string(), "0".repeat(64));
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
