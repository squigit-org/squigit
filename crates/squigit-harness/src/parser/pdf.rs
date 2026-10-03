// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::parser::{
    source_path, CollageBuilder, Error, ImageOptions, Manifest, OutputDirectory, ParseOutput,
    Result, Selection, Tile, MAX_ITEMS,
};
use hayro::hayro_interpret::InterpreterSettings;
use hayro::hayro_syntax::Pdf;
use hayro::vello_cpu::color::palette::css::WHITE;
use hayro::{RenderCache, RenderSettings};
use image::{DynamicImage, RgbaImage};
use serde::{Deserialize, Serialize};
use std::fs;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PdfRequest {
    pub path: PathBuf,
    pub from: u32,
    pub to: u32,
    pub output_dir: PathBuf,
    #[serde(default)]
    pub images: ImageOptions,
}

pub fn parse(request: PdfRequest, control: &crate::parser::ParseControl) -> Result<ParseOutput> {
    control.check()?;
    request.images.validate()?;
    if request.from == 0 || request.to < request.from {
        return Err(Error::InvalidInput(
            "PDF ranges are inclusive and start at page 1; require from <= to".into(),
        ));
    }
    if u64::from(request.to - request.from) + 1 > MAX_ITEMS {
        return Err(Error::InvalidInput(format!(
            "Select at most {MAX_ITEMS} pages per call"
        )));
    }
    let path = source_path(&request.path)?;
    let format = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mut warnings = Vec::new();
    let bytes = match format.as_str() {
        "pdf" => fs::read(&path)?,
        "docx" | "xlsx" | "pptx" => {
            let converted = catch_unwind(AssertUnwindSafe(|| office2pdf::convert(&path)))
                .map_err(|_| Error::Parse("Office conversion failed inside office2pdf".into()))?
                .map_err(|error| Error::Parse(format!("Office conversion: {error}")))?;
            warnings.extend(converted.warnings.iter().map(ToString::to_string));
            converted.pdf
        }
        _ => {
            return Err(Error::InvalidInput(
                "Document tool supports PDF, DOCX, XLSX, and PPTX".into(),
            ));
        }
    };
    let text_document = match catch_unwind(|| lopdf::Document::load_mem(&bytes)) {
        Ok(Ok(document)) => Some(document),
        Ok(Err(error)) => {
            warnings.push(format!(
                "Text extraction unavailable: {error}; page images are still provided"
            ));
            None
        }
        Err(_) => {
            warnings.push("Text parser failed; page images are still provided".into());
            None
        }
    };
    let pdf =
        Pdf::new(bytes).map_err(|error| Error::Parse(format!("Cannot open PDF: {error:?}")))?;
    let total_pages = u32::try_from(pdf.pages().len())
        .map_err(|_| Error::Parse("Document has too many pages".into()))?;
    if request.to > total_pages {
        return Err(Error::InvalidInput(format!(
            "Requested page {} but this document has {total_pages} pages",
            request.to
        )));
    }
    let directory = OutputDirectory::new(&request.output_dir)?;
    let mut collages = CollageBuilder::new(request.images.clone())?;
    let cache = RenderCache::new();
    let settings = InterpreterSettings::default();
    let mut text = String::new();
    for (index, page) in pdf
        .pages()
        .iter()
        .enumerate()
        .skip(request.from as usize - 1)
        .take((request.to - request.from + 1) as usize)
    {
        let number = index as u32 + 1;
        let first = request.from + (number - request.from) / 6 * 6;
        control.report(format!(
            "Parsing pages {first}-{}",
            request.to.min(first + 5)
        ))?;
        let page_text = extract_page_text(text_document.as_ref(), number, &mut warnings);
        text.push_str(&format!("--- Page {number} ---\n{}\n\n", page_text.trim()));
        let (width, height) = page.render_dimensions();
        if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
            return Err(Error::Parse(format!(
                "Page {number} has invalid dimensions"
            )));
        }
        let scale = request.images.tile_long_edge as f32 / width.max(height);
        let render_settings = RenderSettings {
            x_scale: scale,
            y_scale: scale,
            width: Some((width * scale).round().max(1.0) as u16),
            height: Some((height * scale).round().max(1.0) as u16),
            bg_color: WHITE,
        };
        let pixmap = catch_unwind(AssertUnwindSafe(|| {
            hayro::render(page, &cache, &settings, &render_settings)
        }))
        .map_err(|_| Error::Parse(format!("Page {number} could not be rendered")))?;
        let rgba = RgbaImage::from_raw(
            u32::from(pixmap.width()),
            u32::from(pixmap.height()),
            pixmap.data_as_u8_slice().to_vec(),
        )
        .ok_or_else(|| Error::Parse(format!("Page {number} returned invalid pixels")))?;
        collages.push(
            directory.path(),
            Tile {
                image: DynamicImage::ImageRgba8(rgba).to_rgb8(),
                label: format!("Page {number}"),
                page: Some(number),
                timestamp_ms: None,
            },
        )?;
    }
    fs::write(directory.path().join("text.txt"), text)?;
    let images = collages.finish(directory.path())?;
    directory.finish(Manifest {
        schema: 1,
        source: path,
        source_format: format,
        selection: Selection::Pages {
            from: request.from,
            to: request.to,
            total_pages,
        },
        images,
        text: Some("text.txt".into()),
        audio: None,
        warnings,
    })
}

fn extract_page_text(
    document: Option<&lopdf::Document>,
    page: u32,
    warnings: &mut Vec<String>,
) -> String {
    let Some(document) = document else {
        return String::new();
    };
    let mut text = String::new();
    let result = catch_unwind(AssertUnwindSafe(|| {
        let mut output = pdf_extract::PlainTextOutput::new(&mut text);
        pdf_extract::output_doc_page(document, &mut output, page)
    }));
    match result {
        Ok(Ok(())) if text.trim().is_empty() => warnings.push(format!(
            "Page {page} has no extractable text; use its image (no OCR is performed)"
        )),
        Ok(Err(error)) => warnings.push(format!(
            "Page {page} text is partial or unavailable: {error}"
        )),
        Err(_) => warnings.push(format!("Page {page} text parser failed; use its image")),
        _ => {}
    }
    text.replace('\0', "")
}
