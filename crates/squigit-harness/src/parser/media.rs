// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::parser::video::{ffmpeg, probe_media, run};
use crate::parser::{
    self, Error, ImageOptions, ParseControl, ParseOutput, PdfRequest, Result, Selection,
    VideoRequest,
};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use squigit_storage::{AttachmentFileType, ThreadStorage};
use std::collections::BTreeSet;
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};

const RECIPE: &str = "collages-v1-hayro071-office080";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaIndex {
    pub source_hash: String,
    pub file_type: AttachmentFileType,
    pub pages: Option<u32>,
    pub duration_ms: Option<u64>,
    pub selections: Vec<ParseOutput>,
    pub audio: Option<PathBuf>,
    pub poster: Option<PathBuf>,
}

fn storage() -> Result<ThreadStorage> {
    ThreadStorage::new().map_err(|error| Error::Parse(error.to_string()))
}
fn cache_dir(hash: &str) -> Result<PathBuf> {
    storage()?
        .media_cache_dir(hash)
        .map_err(|error| Error::Parse(error.to_string()))
}
fn lock(dir: &Path, control: &ParseControl) -> Result<File> {
    fs::create_dir_all(dir)?;
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(dir.join(".lock"))?;
    loop {
        control.check()?;
        match file.try_lock_exclusive() {
            Ok(()) => return Ok(file),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(40))
            }
            Err(error) => return Err(error.into()),
        }
    }
}
fn atomic_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| Error::InvalidInput("Missing cache directory".into()))?;
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    use std::io::Write;
    file.write_all(&serde_json::to_vec_pretty(value)?)?;
    file.as_file().sync_all()?;
    file.persist(path).map_err(|error| Error::Io(error.error))?;
    Ok(())
}
pub fn load_index(hash: &str) -> Result<Option<MediaIndex>> {
    let path = cache_dir(hash)?.join(RECIPE).join("index.json");
    if !path.try_exists()? {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&fs::read(path)?)?))
}
pub fn brief_path(image: &Path) -> PathBuf {
    image.with_extension("brief.json")
}
pub fn load_brief(image: &Path) -> Result<Option<String>> {
    let path = brief_path(image);
    if !path.try_exists()? {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&fs::read(path)?)?))
}
pub fn save_brief(image: &Path, brief: &str) -> Result<()> {
    atomic_json(&brief_path(image), &brief)
}
pub fn collage_paths(index: &MediaIndex) -> Vec<PathBuf> {
    index
        .selections
        .iter()
        .flat_map(|output| {
            output
                .manifest
                .images
                .iter()
                .map(|image| output.output_dir.join(&image.file))
        })
        .collect()
}
pub fn document_path(hash: &str) -> Result<PathBuf> {
    let storage = storage()?;
    let path = storage
        .find_object_blob(hash)
        .map_err(|e| Error::Parse(e.to_string()))?;
    let extension = path.extension().and_then(|v| v.to_str()).unwrap_or("");
    if extension == "pdf" {
        return Ok(path);
    }
    let bytes = fs::read(&path)?;
    if let Some(prepared) =
        crate::find_prepared_office_document(hash, extension).map_err(Error::Parse)?
    {
        return Ok(prepared.cas_path.into());
    }
    let document = crate::prepare_document(crate::PrepareDocumentInput {
        bytes: bytes.clone(),
        extension: extension.into(),
    })
    .map_err(Error::Parse)?;
    let pdf = storage
        .store_file(&document.pdf_bytes, "pdf", None)
        .map_err(|e| Error::Parse(e.to_string()))?;
    crate::remember_prepared_office_document(hash, extension, &pdf.hash).map_err(Error::Parse)?;
    Ok(pdf.path.into())
}
fn cached_pdf(
    hash: &str,
    path: PathBuf,
    from: u32,
    to: u32,
    control: &ParseControl,
) -> Result<ParseOutput> {
    let dir = cache_dir(hash)?
        .join(RECIPE)
        .join(format!("pages-{from}-{to}"));
    if dir.join("manifest.json").try_exists()? {
        return Ok(ParseOutput {
            manifest: serde_json::from_slice(&fs::read(dir.join("manifest.json"))?)?,
            output_dir: dir,
        });
    }
    parser::parse_pdf(
        PdfRequest {
            path,
            from,
            to,
            output_dir: dir,
            images: ImageOptions::default(),
        },
        control,
    )
}
fn cached_video(
    hash: &str,
    from: u64,
    to: u64,
    jump: u64,
    control: &ParseControl,
) -> Result<ParseOutput> {
    let path = storage()?
        .find_object_blob(hash)
        .map_err(|e| Error::Parse(e.to_string()))?;
    let dir = cache_dir(hash)?
        .join(RECIPE)
        .join(format!("time-{from}-{to}-{jump}"));
    if dir.join("manifest.json").try_exists()? {
        return Ok(ParseOutput {
            manifest: serde_json::from_slice(&fs::read(dir.join("manifest.json"))?)?,
            output_dir: dir,
        });
    }
    parser::parse_video(
        VideoRequest {
            path,
            from,
            to,
            jump,
            output_dir: dir,
            images: ImageOptions::default(),
        },
        control,
    )
}
fn document_index(hash: &str, path: &Path) -> Result<MediaIndex> {
    let mut index = match load_index(hash)? {
        Some(index) => index,
        None => {
            let pdf = hayro::hayro_syntax::Pdf::new(fs::read(path)?)
                .map_err(|e| Error::Parse(format!("Cannot open PDF: {e:?}")))?;
            let pages = u32::try_from(pdf.pages().len())
                .map_err(|_| Error::Parse("Too many pages".into()))?;
            if pages == 0 {
                return Err(Error::InvalidInput("Document has no pages".into()));
            }
            MediaIndex {
                source_hash: hash.into(),
                file_type: AttachmentFileType::Document,
                pages: Some(pages),
                duration_ms: None,
                selections: Vec::new(),
                audio: None,
                poster: None,
            }
        }
    };
    let root = cache_dir(hash)?.join(RECIPE);
    for entry in fs::read_dir(&root)? {
        let dir = entry?.path();
        let manifest_path = dir.join("manifest.json");
        if !dir.is_dir()
            || !manifest_path.try_exists()?
            || index
                .selections
                .iter()
                .any(|output| output.output_dir == dir)
        {
            continue;
        }
        let manifest: parser::Manifest = serde_json::from_slice(&fs::read(manifest_path)?)?;
        if manifest.schema == 1
            && manifest.source == path
            && matches!(manifest.selection, Selection::Pages { .. })
        {
            index.selections.push(ParseOutput {
                output_dir: dir,
                manifest,
            });
        }
    }
    index
        .selections
        .sort_by_key(|output| match output.manifest.selection {
            Selection::Pages { from, .. } => from,
            _ => 0,
        });
    atomic_json(&root.join("index.json"), &index)?;
    Ok(index)
}
fn ensure_pages(
    index: &mut MediaIndex,
    path: &Path,
    from: u32,
    to: u32,
    control: &ParseControl,
) -> Result<()> {
    let pages = index
        .pages
        .ok_or_else(|| Error::InvalidInput("Expected a document".into()))?;
    if from == 0 || from > to || to > pages {
        return Err(Error::InvalidInput(format!(
            "Select pages 1-{pages} with from <= to"
        )));
    }
    let cached = index
        .selections
        .iter()
        .flat_map(|output| &output.manifest.images)
        .flat_map(|image| &image.tiles)
        .filter_map(|tile| tile.page)
        .collect::<BTreeSet<_>>();
    let mut page = from;
    while page <= to {
        control.check()?;
        if cached.contains(&page) {
            page += 1;
            continue;
        }
        let first = page;
        while page < to
            && page - first + 1 < parser::MAX_ITEMS as u32
            && !cached.contains(&(page + 1))
        {
            page += 1;
        }
        let output = cached_pdf(&index.source_hash, path.to_path_buf(), first, page, control)?;
        control.check()?;
        index.selections.push(output);
        atomic_json(
            &cache_dir(&index.source_hash)?
                .join(RECIPE)
                .join("index.json"),
            index,
        )?;
        page += 1;
    }
    Ok(())
}
pub fn parse_pdf(
    hash: &str,
    from: u32,
    to: u32,
    control: &ParseControl,
) -> Result<Vec<ParseOutput>> {
    if from == 0 || from > to || u64::from(to - from) + 1 > parser::MAX_ITEMS {
        return Err(Error::InvalidInput(format!(
            "Select at most {} pages, starting at page 1",
            parser::MAX_ITEMS
        )));
    }
    let root = cache_dir(hash)?.join(RECIPE);
    let _lock = lock(&root, control)?;
    let path = document_path(hash)?;
    let mut index = document_index(hash, &path)?;
    ensure_pages(&mut index, &path, from, to, control)?;
    let mut outputs = Vec::new();
    let mut supplied = BTreeSet::new();
    for output in index.selections {
        let mut selected = output.clone();
        selected.manifest.images.retain(|image| {
            let pages = image
                .tiles
                .iter()
                .filter_map(|tile| tile.page)
                .filter(|page| *page >= from && *page <= to)
                .collect::<Vec<_>>();
            if pages.iter().all(|page| supplied.contains(page)) {
                return false;
            }
            supplied.extend(pages);
            true
        });
        if !selected.manifest.images.is_empty() {
            selected.manifest.selection = Selection::Pages {
                from,
                to,
                total_pages: index.pages.unwrap_or(0),
            };
            outputs.push(selected);
        }
    }
    outputs.sort_by_key(|output| {
        output
            .manifest
            .images
            .first()
            .and_then(|image| image.tiles.first())
            .and_then(|tile| tile.page)
    });
    Ok(outputs)
}
pub fn parse_video(
    hash: &str,
    from: u64,
    to: u64,
    jump: u64,
    control: &ParseControl,
) -> Result<ParseOutput> {
    let root = cache_dir(hash)?.join(RECIPE);
    let _lock = lock(&root, control)?;
    let output = cached_video(hash, from, to, jump, control)?;
    control.check()?;
    let duration_ms = match output.manifest.selection {
        Selection::Time { duration_ms, .. } => duration_ms,
        _ => 0,
    };
    let mut index = load_index(hash)?.unwrap_or(MediaIndex {
        source_hash: hash.into(),
        file_type: AttachmentFileType::Video,
        pages: None,
        duration_ms: Some(duration_ms),
        selections: Vec::new(),
        audio: None,
        poster: None,
    });
    if !index
        .selections
        .iter()
        .any(|cached| cached.output_dir == output.output_dir)
    {
        index.selections.push(output.clone());
        atomic_json(&root.join("index.json"), &index)?;
    }
    Ok(output)
}
fn prepare_video(
    index: &mut MediaIndex,
    hash: &str,
    path: &Path,
    root: &Path,
    control: &ParseControl,
) -> Result<()> {
    let (duration, video, _) = probe_media(path, control)?;
    if !video {
        return Err(Error::InvalidInput("Input has no video track".into()));
    }
    index.duration_ms = Some(duration);
    let output = cached_video(hash, 0, duration, duration.div_ceil(36).max(1), control)?;
    index.audio = output
        .manifest
        .audio
        .as_ref()
        .map(|file| output.output_dir.join(file));
    if let Some(first) = output.manifest.images.first() {
        if let Some(tile) = first.tiles.first() {
            let image = image::open(output.output_dir.join(&first.file))?
                .crop_imm(tile.x, tile.y, tile.width, tile.height)
                .to_rgb8();
            let encoded =
                webp::Encoder::from_rgb(image.as_raw(), image.width(), image.height()).encode(75.0);
            let poster = root.join("poster.webp");
            fs::write(&poster, &*encoded)?;
            index.poster = Some(poster);
        }
    }
    if !index
        .selections
        .iter()
        .any(|cached| cached.output_dir == output.output_dir)
    {
        index.selections.push(output);
    }
    Ok(())
}
pub fn prepare(hash: &str, control: &ParseControl) -> Result<MediaIndex> {
    let root = cache_dir(hash)?.join(RECIPE);
    let _lock = lock(&root, control)?;
    if let Some(mut index) = load_index(hash)? {
        if index.file_type == AttachmentFileType::Document {
            let path = document_path(hash)?;
            index = document_index(hash, &path)?;
            let pages = index
                .pages
                .ok_or_else(|| Error::InvalidInput("Document has no pages".into()))?;
            ensure_pages(&mut index, &path, 1, pages, control)?;
        } else if index.file_type == AttachmentFileType::Video && index.poster.is_none() {
            let path = storage()?
                .find_object_blob(hash)
                .map_err(|e| Error::Parse(e.to_string()))?;
            prepare_video(&mut index, hash, &path, &root, control)?;
            atomic_json(&root.join("index.json"), &index)?;
        }
        return Ok(index);
    }
    let storage = storage()?;
    let file_type = storage
        .load_object_manifest(hash)
        .map_err(|e| Error::Parse(e.to_string()))?
        .file_context
        .file_type;
    let path = storage
        .find_object_blob(hash)
        .map_err(|e| Error::Parse(e.to_string()))?;
    let mut index = MediaIndex {
        source_hash: hash.into(),
        file_type: file_type.clone(),
        pages: None,
        duration_ms: None,
        selections: Vec::new(),
        audio: None,
        poster: None,
    };
    match file_type {
        AttachmentFileType::Document => {
            control.report("Converting document".into())?;
            let pdf_path = document_path(hash)?;
            index = document_index(hash, &pdf_path)?;
            let pages = index
                .pages
                .ok_or_else(|| Error::InvalidInput("Document has no pages".into()))?;
            ensure_pages(&mut index, &pdf_path, 1, pages, control)?;
        }
        AttachmentFileType::Video => {
            prepare_video(&mut index, hash, &path, &root, control)?;
        }
        AttachmentFileType::Audio => {
            let (duration, _, audio) = probe_media(&path, control)?;
            if !audio {
                return Err(Error::InvalidInput("Input has no audio track".into()));
            }
            index.duration_ms = Some(duration);
            let destination = root.join("audio.mp3");
            control.report("Extracting audio".into())?;
            extract_audio(&path, 0, duration, &destination, control)?;
            index.audio = Some(destination);
        }
        AttachmentFileType::Image => {}
    }
    control.check()?;
    atomic_json(&root.join("index.json"), &index)?;
    Ok(index)
}
pub fn extract_audio(
    path: &Path,
    from: u64,
    to: u64,
    output: &Path,
    control: &ParseControl,
) -> Result<()> {
    if from >= to {
        return Err(Error::InvalidInput("Audio range requires from < to".into()));
    }
    let mut command = ffmpeg(path, from, to - from);
    command
        .args([
            "-vn",
            "-ac",
            "1",
            "-ar",
            "22050",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "64k",
            "-threads",
            "1",
        ])
        .arg(output);
    run(command, control)?;
    Ok(())
}
pub fn playback(hash: &str, control: &ParseControl) -> Result<PathBuf> {
    let storage = storage()?;
    let kind = storage
        .load_object_manifest(hash)
        .map_err(|e| Error::Parse(e.to_string()))?
        .file_context
        .file_type;
    let input = storage
        .find_object_blob(hash)
        .map_err(|e| Error::Parse(e.to_string()))?;
    let root = cache_dir(hash)?.join("playback-v1");
    let _lock = lock(&root, control)?;
    let extension = match kind {
        AttachmentFileType::Video => "mp4",
        AttachmentFileType::Audio => "mp3",
        _ => return Err(Error::InvalidInput("Expected video or audio".into())),
    };
    let destination = root.join(format!("playback.{extension}"));
    if destination.try_exists()? {
        return Ok(destination);
    }
    let temporary = root.join(format!(".playback.{extension}"));
    let mut command = std::process::Command::new("ffmpeg");
    command
        .args(["-v", "error", "-nostdin", "-y", "-i"])
        .arg(input);
    if extension == "mp4" {
        command.args([
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
        ]);
    } else {
        command.args(["-vn", "-c:a", "libmp3lame", "-b:a", "128k"]);
    }
    command.args(["-threads", "2"]).arg(&temporary);
    if let Err(error) = run(command, control) {
        let _ = fs::remove_file(temporary);
        return Err(error);
    }
    fs::rename(temporary, &destination)?;
    Ok(destination)
}
