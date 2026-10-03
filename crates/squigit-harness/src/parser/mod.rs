// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod collage;
pub mod media;
mod output;
mod pdf;
mod video;

pub use collage::{CollageBuilder, ImageOptions, Tile};
pub use output::{source_path, OutputDirectory};

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub type Result<T> = std::result::Result<T, Error>;
pub const MAX_ITEMS: u64 = 300;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Local parsing was cancelled")]
    Cancelled,
    #[error("{0}")]
    InvalidInput(String),
    #[error("{0}")]
    Parse(String),
    #[error("{program}: {message}")]
    Process { program: String, message: String },
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Image error: {0}")]
    Image(#[from] image::ImageError),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Selection {
    Pages {
        from: u32,
        to: u32,
        total_pages: u32,
    },
    Time {
        from: u64,
        to: u64,
        jump: u64,
        duration_ms: u64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileInfo {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp_ms: Option<u64>,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollageInfo {
    pub file: PathBuf,
    pub width: u32,
    pub height: u32,
    pub bytes: u64,
    pub quality: f32,
    pub tiles: Vec<TileInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub schema: u32,
    pub source: PathBuf,
    pub source_format: String,
    pub selection: Selection,
    pub images: Vec<CollageInfo>,
    pub text: Option<PathBuf>,
    pub audio: Option<PathBuf>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseOutput {
    pub output_dir: PathBuf,
    pub manifest: Manifest,
}

pub use pdf::PdfRequest;
pub use video::VideoRequest;

pub fn parse_pdf(request: PdfRequest, control: &ParseControl) -> Result<ParseOutput> {
    crate::parser::pdf::parse(request, control)
}
pub fn parse_video(request: VideoRequest, control: &ParseControl) -> Result<ParseOutput> {
    crate::parser::video::parse(request, control)
}

#[derive(Clone, Default)]
pub struct ParseControl {
    cancelled: std::sync::Arc<std::sync::atomic::AtomicBool>,
    progress: Option<std::sync::Arc<dyn Fn(String) + Send + Sync>>,
}
impl ParseControl {
    pub fn with_progress(progress: impl Fn(String) + Send + Sync + 'static) -> Self {
        Self {
            progress: Some(std::sync::Arc::new(progress)),
            ..Self::default()
        }
    }
    pub fn cancel(&self) {
        self.cancelled
            .store(true, std::sync::atomic::Ordering::Relaxed);
    }
    pub fn check(&self) -> Result<()> {
        if self.cancelled.load(std::sync::atomic::Ordering::Relaxed) {
            Err(Error::Cancelled)
        } else {
            Ok(())
        }
    }
    pub fn report(&self, text: String) -> Result<()> {
        self.check()?;
        if let Some(progress) = &self.progress {
            progress(text);
        }
        Ok(())
    }
}
