// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Content Addressable Storage (CAS) implementation for images and chat data.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;

use crate::error::{Result, StorageError};
use crate::types::{ChatData, ChatMetadata, ChatMessage, OcrRegion, Project, StoredImage};

/// Main storage manager for chats and images.
pub struct ChatStorage {
    /// Base directory for all storage.
    base_dir: PathBuf,
    /// Directory for CAS objects (images).
    objects_dir: PathBuf,
    /// Path to the chat index file.
    index_path: PathBuf,
    /// Path to the projects file.
    projects_path: PathBuf,
}

impl ChatStorage {
    /// Create a new storage manager.
    ///
    /// Uses `~/.config/spatialshot/chats/` on Linux (and appropriate config dirs on other OSs).
    pub fn new() -> Result<Self> {
        let base_dir = dirs::config_dir()
            .ok_or(StorageError::NoDataDir)?
            .join("spatialshot")
            .join("chats");

        let objects_dir = base_dir.join("objects");
        let index_path = base_dir.join("index.json");
        let projects_path = base_dir.join("projects.json");

        // Create directories if they don't exist
        fs::create_dir_all(&objects_dir)?;

        let storage = Self {
            base_dir,
            objects_dir,
            index_path,
            projects_path,
        };

        Ok(storage)
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
    pub fn store_image(&self, bytes: &[u8]) -> Result<StoredImage> {
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

        // Only write if file doesn't exist (deduplication)
        if !file_path.exists() {
            let mut file = File::create(&file_path)?;
            file.write_all(bytes)?;
        }

        Ok(StoredImage {
            hash,
            path: file_path.to_string_lossy().to_string(),
        })
    }

    /// Store an image from a file path.
    pub fn store_image_from_path(&self, path: &str) -> Result<StoredImage> {
        let mut file = File::open(path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;
        self.store_image(&buffer)
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

    // =========================================================================
    // Chat Storage
    // =========================================================================

    /// Get the directory for a specific chat.
    fn chat_dir(&self, chat_id: &str) -> PathBuf {
        self.base_dir.join(chat_id)
    }

    /// Save a new chat or update an existing one.
    pub fn save_chat(&self, chat: &ChatData) -> Result<()> {
        let chat_dir = self.chat_dir(&chat.metadata.id);
        fs::create_dir_all(&chat_dir)?;

        // Save metadata
        let meta_path = chat_dir.join("meta.json");
        let meta_json = serde_json::to_string_pretty(&chat.metadata)?;
        fs::write(&meta_path, meta_json)?;

        // Always save OCR data file (create if missing)
        let ocr_path = chat_dir.join("ocr.json");
        let ocr_json = serde_json::to_string_pretty(&chat.ocr_data)?;
        fs::write(&ocr_path, ocr_json)?;

        // Always save messages file (create if missing)
        let messages_path = chat_dir.join("messages.md");
        let md_content = self.messages_to_markdown(&chat.messages);
        fs::write(&messages_path, md_content)?;

        // Save imgbb URL if present
        if let Some(ref url) = chat.imgbb_url {
            let url_path = chat_dir.join("imgbb_url.txt");
            fs::write(&url_path, url)?;
        }

        // Update the index
        self.update_index(&chat.metadata)?;

        Ok(())
    }

    /// Load a chat by ID.
    pub fn load_chat(&self, chat_id: &str) -> Result<ChatData> {
        let chat_dir = self.chat_dir(chat_id);

        if !chat_dir.exists() {
            return Err(StorageError::ChatNotFound(chat_id.to_string()));
        }

        // Load metadata
        let meta_path = chat_dir.join("meta.json");
        let meta_json = fs::read_to_string(&meta_path)?;
        let metadata: ChatMetadata = serde_json::from_str(&meta_json)?;

        // Load OCR data
        let ocr_path = chat_dir.join("ocr.json");
        let ocr_data: Vec<OcrRegion> = if ocr_path.exists() {
            let ocr_json = fs::read_to_string(&ocr_path)?;
            serde_json::from_str(&ocr_json)?
        } else {
            Vec::new()
        };

        // Load messages from markdown
        let messages_path = chat_dir.join("messages.md");
        let messages = if messages_path.exists() {
            let md_content = fs::read_to_string(&messages_path)?;
            self.markdown_to_messages(&md_content)
        } else {
            Vec::new()
        };

        // Load imgbb URL
        let url_path = chat_dir.join("imgbb_url.txt");
        let imgbb_url = if url_path.exists() {
            Some(fs::read_to_string(&url_path)?)
        } else {
            None
        };

        Ok(ChatData {
            metadata,
            messages,
            ocr_data,
            imgbb_url,
        })
    }

    /// List all chats (metadata only).
    pub fn list_chats(&self) -> Result<Vec<ChatMetadata>> {
        if !self.index_path.exists() {
            return Ok(Vec::new());
        }

        let index_json = fs::read_to_string(&self.index_path)?;
        let chats: Vec<ChatMetadata> = serde_json::from_str(&index_json)?;
        Ok(chats)
    }

    /// Delete a chat by ID.
    pub fn delete_chat(&self, chat_id: &str) -> Result<()> {
        let chat_dir = self.chat_dir(chat_id);

        if chat_dir.exists() {
            fs::remove_dir_all(&chat_dir)?;
        }

        // Update index to remove the chat
        self.remove_from_index(chat_id)?;

        Ok(())
    }

    /// Update chat metadata (for rename, pin, star, etc.).
    pub fn update_chat_metadata(&self, metadata: &ChatMetadata) -> Result<()> {
        let chat_dir = self.chat_dir(&metadata.id);

        if !chat_dir.exists() {
            return Err(StorageError::ChatNotFound(metadata.id.clone()));
        }

        // Save updated metadata
        let meta_path = chat_dir.join("meta.json");
        let meta_json = serde_json::to_string_pretty(metadata)?;
        fs::write(&meta_path, meta_json)?;

        // Update index
        self.update_index(metadata)?;

        Ok(())
    }

    // =========================================================================
    // OCR and ImgBB
    // =========================================================================

    /// Save OCR data for a chat.
    pub fn save_ocr_data(&self, chat_id: &str, ocr_data: &[OcrRegion]) -> Result<()> {
        let chat_dir = self.chat_dir(chat_id);
        fs::create_dir_all(&chat_dir)?;

        let ocr_path = chat_dir.join("ocr.json");
        let ocr_json = serde_json::to_string_pretty(ocr_data)?;
        fs::write(&ocr_path, ocr_json)?;

        Ok(())
    }

    /// Get OCR data for a chat.
    pub fn get_ocr_data(&self, chat_id: &str) -> Result<Vec<OcrRegion>> {
        let ocr_path = self.chat_dir(chat_id).join("ocr.json");

        if !ocr_path.exists() {
            return Ok(Vec::new());
        }

        let ocr_json = fs::read_to_string(&ocr_path)?;
        let ocr_data: Vec<OcrRegion> = serde_json::from_str(&ocr_json)?;
        Ok(ocr_data)
    }

    /// Save imgbb URL for a chat.
    pub fn save_imgbb_url(&self, chat_id: &str, url: &str) -> Result<()> {
        let chat_dir = self.chat_dir(chat_id);
        fs::create_dir_all(&chat_dir)?;

        let url_path = chat_dir.join("imgbb_url.txt");
        fs::write(&url_path, url)?;

        Ok(())
    }

    /// Get imgbb URL for a chat.
    pub fn get_imgbb_url(&self, chat_id: &str) -> Result<Option<String>> {
        let url_path = self.chat_dir(chat_id).join("imgbb_url.txt");

        if !url_path.exists() {
            return Ok(None);
        }

        let url = fs::read_to_string(&url_path)?;
        Ok(Some(url))
    }

    /// Append a message to a chat.
    pub fn append_message(&self, chat_id: &str, message: &ChatMessage) -> Result<()> {
        let chat_dir = self.chat_dir(chat_id);
        fs::create_dir_all(&chat_dir)?;

        let messages_path = chat_dir.join("messages.md");

        // Append to existing file or create new
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&messages_path)?;

        let md_entry = self.message_to_markdown(message);
        file.write_all(md_entry.as_bytes())?;

        // Update the chat's updated_at timestamp
        let meta_path = chat_dir.join("meta.json");
        if meta_path.exists() {
            let meta_json = fs::read_to_string(&meta_path)?;
            let mut metadata: ChatMetadata = serde_json::from_str(&meta_json)?;
            metadata.updated_at = chrono::Utc::now();
            let updated_json = serde_json::to_string_pretty(&metadata)?;
            fs::write(&meta_path, updated_json)?;
            self.update_index(&metadata)?;
        }

        Ok(())
    }

    // =========================================================================
    // Projects
    // =========================================================================

    /// List all projects.
    pub fn list_projects(&self) -> Result<Vec<Project>> {
        if !self.projects_path.exists() {
            return Ok(Vec::new());
        }

        let json = fs::read_to_string(&self.projects_path)?;
        let projects: Vec<Project> = serde_json::from_str(&json)?;
        Ok(projects)
    }

    /// Create a new project.
    pub fn create_project(&self, name: String) -> Result<Project> {
        let mut projects = self.list_projects()?;

        let project = Project::new(name);
        projects.push(project.clone());

        let json = serde_json::to_string_pretty(&projects)?;
        fs::write(&self.projects_path, json)?;

        Ok(project)
    }

    /// Delete a project.
    pub fn delete_project(&self, project_id: &str) -> Result<()> {
        let mut projects = self.list_projects()?;
        projects.retain(|p| p.id != project_id);

        let json = serde_json::to_string_pretty(&projects)?;
        fs::write(&self.projects_path, json)?;

        Ok(())
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    /// Update the index with chat metadata.
    fn update_index(&self, metadata: &ChatMetadata) -> Result<()> {
        let mut chats = self.list_chats().unwrap_or_default();

        // Remove existing entry if present
        chats.retain(|c| c.id != metadata.id);

        // Add updated entry
        chats.push(metadata.clone());

        // Sort by updated_at descending
        chats.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

        let json = serde_json::to_string_pretty(&chats)?;
        fs::write(&self.index_path, json)?;

        Ok(())
    }

    /// Remove a chat from the index.
    fn remove_from_index(&self, chat_id: &str) -> Result<()> {
        let mut chats = self.list_chats().unwrap_or_default();
        chats.retain(|c| c.id != chat_id);

        let json = serde_json::to_string_pretty(&chats)?;
        fs::write(&self.index_path, json)?;

        Ok(())
    }

    /// Convert messages to markdown format.
    fn messages_to_markdown(&self, messages: &[ChatMessage]) -> String {
        messages
            .iter()
            .map(|m| self.message_to_markdown(m))
            .collect::<Vec<_>>()
            .join("")
    }

    /// Convert a single message to markdown.
    fn message_to_markdown(&self, message: &ChatMessage) -> String {
        let role_label = if message.role == "user" {
            "## User"
        } else {
            "## Assistant"
        };

        format!(
            "{}\n<!-- {} -->\n\n{}\n\n",
            role_label,
            message.timestamp.to_rfc3339(),
            message.content
        )
    }

    /// Parse markdown back to messages.
    fn markdown_to_messages(&self, content: &str) -> Vec<ChatMessage> {
        let mut messages = Vec::new();
        let mut current_role: Option<String> = None;
        let mut current_timestamp: Option<chrono::DateTime<chrono::Utc>> = None;
        let mut current_content = String::new();

        for line in content.lines() {
            if line.starts_with("## User") {
                // Save previous message if any
                if let Some(role) = current_role.take() {
                    messages.push(ChatMessage {
                        role,
                        content: current_content.trim().to_string(),
                        timestamp: current_timestamp.unwrap_or_else(chrono::Utc::now),
                    });
                }
                current_role = Some("user".to_string());
                current_content.clear();
                current_timestamp = None;
            } else if line.starts_with("## Assistant") {
                // Save previous message if any
                if let Some(role) = current_role.take() {
                    messages.push(ChatMessage {
                        role,
                        content: current_content.trim().to_string(),
                        timestamp: current_timestamp.unwrap_or_else(chrono::Utc::now),
                    });
                }
                current_role = Some("assistant".to_string());
                current_content.clear();
                current_timestamp = None;
            } else if line.starts_with("<!-- ") && line.ends_with(" -->") {
                // Parse timestamp from comment
                let ts_str = &line[5..line.len() - 4];
                if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                    current_timestamp = Some(ts.with_timezone(&chrono::Utc));
                }
            } else if current_role.is_some() {
                current_content.push_str(line);
                current_content.push('\n');
            }
        }

        // Save last message
        if let Some(role) = current_role {
            messages.push(ChatMessage {
                role,
                content: current_content.trim().to_string(),
                timestamp: current_timestamp.unwrap_or_else(chrono::Utc::now),
            });
        }

        messages
    }
}
