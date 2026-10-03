// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::parser::{CollageInfo, Error, Result, TileInfo};
use font8x8::{UnicodeFonts, BASIC_FONTS};
use image::{imageops, Rgb, RgbImage};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ImageOptions {
    pub tile_long_edge: u32,
    pub quality: f32,
    pub max_bytes: usize,
}

impl Default for ImageOptions {
    fn default() -> Self {
        Self {
            tile_long_edge: 1024,
            quality: 75.0,
            max_bytes: 512 * 1024,
        }
    }
}

impl ImageOptions {
    pub fn validate(&self) -> Result<()> {
        if !(256..=2048).contains(&self.tile_long_edge) {
            return Err(Error::InvalidInput(
                "tile_long_edge must be between 256 and 2048".into(),
            ));
        }
        if !self.quality.is_finite() || !(35.0..=100.0).contains(&self.quality) {
            return Err(Error::InvalidInput(
                "quality must be between 35 and 100".into(),
            ));
        }
        if !(32 * 1024..=4 * 1024 * 1024).contains(&self.max_bytes) {
            return Err(Error::InvalidInput(
                "max_bytes must be between 32 KiB and 4 MiB".into(),
            ));
        }
        Ok(())
    }
}

pub struct Tile {
    pub image: RgbImage,
    pub label: String,
    pub page: Option<u32>,
    pub timestamp_ms: Option<u64>,
}

pub struct CollageBuilder {
    options: ImageOptions,
    pending: Vec<Tile>,
    images: Vec<CollageInfo>,
}

impl CollageBuilder {
    pub fn new(options: ImageOptions) -> Result<Self> {
        options.validate()?;
        Ok(Self {
            options,
            pending: Vec::new(),
            images: Vec::new(),
        })
    }

    pub fn push(&mut self, directory: &Path, mut tile: Tile) -> Result<()> {
        if tile.image.width() == 0 || tile.image.height() == 0 {
            return Err(Error::Parse(
                "Cannot create a collage from an empty image".into(),
            ));
        }
        let edge = tile.image.width().max(tile.image.height());
        if edge > self.options.tile_long_edge {
            let ratio = self.options.tile_long_edge as f64 / edge as f64;
            tile.image = imageops::resize(
                &tile.image,
                (tile.image.width() as f64 * ratio).round().max(1.0) as u32,
                (tile.image.height() as f64 * ratio).round().max(1.0) as u32,
                imageops::FilterType::Lanczos3,
            );
        }
        self.pending.push(tile);
        if self.pending.len() == 6 {
            self.flush(directory)?;
        }
        Ok(())
    }

    pub fn finish(mut self, directory: &Path) -> Result<Vec<CollageInfo>> {
        self.flush(directory)?;
        Ok(self.images)
    }

    fn flush(&mut self, directory: &Path) -> Result<()> {
        if self.pending.is_empty() {
            return Ok(());
        }
        let columns = self.pending.len().min(3) as u32;
        let rows = (self.pending.len() as u32).div_ceil(columns);
        let cell_width = self
            .pending
            .iter()
            .map(|tile| tile.image.width())
            .max()
            .unwrap();
        let cell_height = self
            .pending
            .iter()
            .map(|tile| tile.image.height())
            .max()
            .unwrap();
        let gap = 12;
        let caption = 28;
        let width = columns * cell_width + (columns + 1) * gap;
        let height = rows * (cell_height + caption) + (rows + 1) * gap;
        let mut canvas = RgbImage::from_pixel(width, height, Rgb([241, 243, 246]));
        let mut tiles = Vec::new();
        for (index, tile) in self.pending.drain(..).enumerate() {
            let cell_x = gap + index as u32 % columns * (cell_width + gap);
            let cell_y = gap + index as u32 / columns * (cell_height + caption + gap);
            draw_label(&mut canvas, &tile.label, cell_x + 4, cell_y + 5);
            let x = cell_x + (cell_width - tile.image.width()) / 2;
            let y = cell_y + caption + (cell_height - tile.image.height()) / 2;
            imageops::replace(&mut canvas, &tile.image, i64::from(x), i64::from(y));
            tiles.push(TileInfo {
                label: tile.label,
                page: tile.page,
                timestamp_ms: tile.timestamp_ms,
                x,
                y,
                width: tile.image.width(),
                height: tile.image.height(),
            });
        }
        let mut quality = self.options.quality;
        let encoded = loop {
            let bytes = webp::Encoder::from_rgb(canvas.as_raw(), canvas.width(), canvas.height())
                .encode(quality)
                .to_vec();
            if bytes.len() <= self.options.max_bytes {
                break bytes;
            }
            if quality > 35.0 {
                quality = (quality - 10.0).max(35.0);
                continue;
            }
            if canvas.width().max(canvas.height()) <= 768 {
                return Err(Error::InvalidInput(
                    "Image byte budget is too small; increase max_bytes".into(),
                ));
            }
            let (old_width, old_height) = canvas.dimensions();
            let new_width = (old_width as f64 * 0.85).round() as u32;
            let new_height = (old_height as f64 * 0.85).round() as u32;
            canvas = imageops::resize(
                &canvas,
                new_width,
                new_height,
                imageops::FilterType::Lanczos3,
            );
            for tile in &mut tiles {
                let scale_x = new_width as f64 / old_width as f64;
                let scale_y = new_height as f64 / old_height as f64;
                tile.x = (tile.x as f64 * scale_x).round() as u32;
                tile.y = (tile.y as f64 * scale_y).round() as u32;
                tile.width = (tile.width as f64 * scale_x).round().max(1.0) as u32;
                tile.height = (tile.height as f64 * scale_y).round().max(1.0) as u32;
            }
        };
        let file = format!("collage-{:03}.webp", self.images.len() + 1);
        fs::write(directory.join(&file), &encoded)?;
        self.images.push(CollageInfo {
            file: file.into(),
            width: canvas.width(),
            height: canvas.height(),
            bytes: encoded.len() as u64,
            quality,
            tiles,
        });
        Ok(())
    }
}

fn draw_label(image: &mut RgbImage, label: &str, x: u32, y: u32) {
    for (index, character) in label.chars().enumerate() {
        let Some(glyph) = BASIC_FONTS.get(character) else {
            continue;
        };
        for (row, bits) in glyph.iter().enumerate() {
            for column in 0..8 {
                if bits & (1 << column) == 0 {
                    continue;
                }
                for dy in 0..2 {
                    for dx in 0..2 {
                        let px = x + index as u32 * 16 + column * 2 + dx;
                        let py = y + row as u32 * 2 + dy;
                        if px < image.width() && py < image.height() {
                            image.put_pixel(px, py, Rgb([38, 43, 51]));
                        }
                    }
                }
            }
        }
    }
}
