// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use fast_image_resize::{
    images::{Image as ResizeImage, ImageRef},
    FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer,
};
use image::{imageops, RgbaImage};
use squigit_storage::{ImageRendition, ThreadStorage};

pub const IMAGE_RENDITION_RECIPE: &str = "webp-q80-m2-catmullrom-2560000px-v1";
const RENDITION_PIXEL_BUDGET: f64 = 2_560_000.0;
const RENDITION_MAX_EDGE: f64 = 16_383.0;
const RENDITION_QUALITY: f32 = 80.0;
const RENDITION_METHOD: i32 = 2;
const TONE_THUMBNAIL_EDGE: u32 = 256;
const MAX_CAPTURE_PIXELS: u64 = 256 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredImageObject {
    pub hash: String,
    pub cas_path: String,
    pub tone: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapturedImage {
    pub rendition: StoredImageObject,
    pub original_path: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Channels {
    Rgb,
    Rgba,
}

impl Channels {
    fn count(self) -> usize {
        match self {
            Self::Rgb => 3,
            Self::Rgba => 4,
        }
    }

    fn pixel_type(self) -> PixelType {
        match self {
            Self::Rgb => PixelType::U8x3,
            Self::Rgba => PixelType::U8x4,
        }
    }
}

struct Rendition {
    webp: Vec<u8>,
    tone: String,
}

pub fn store_captured_image(
    width: u32,
    height: u32,
    rgb: &[u8],
    keep_original: bool,
) -> Result<CapturedImage, String> {
    let pixels = u64::from(width) * u64::from(height);
    if width == 0 || height == 0 || pixels > MAX_CAPTURE_PIXELS {
        return Err(format!("Invalid capture size {width}x{height}"));
    }
    if rgb.len() as u64 != pixels * 3 {
        return Err("Capture pixels do not match the capture size".to_string());
    }
    let (original, rendition) = std::thread::scope(|scope| {
        let original = keep_original.then(|| scope.spawn(|| encode_png_rgb(width, height, rgb)));
        let rendition = build_rendition(width, height, rgb, Channels::Rgb);
        let original = original
            .map(|handle| {
                handle
                    .join()
                    .map_err(|_| "Capture encoder stopped unexpectedly".to_string())
                    .and_then(|result| result)
            })
            .transpose();
        (original, rendition)
    });
    let (original, rendition) = (original?, rendition?);
    let storage = ThreadStorage::new().map_err(|error| error.to_string())?;
    let rendition = store_rendition(&storage, rendition)?;
    let original_path = original
        .map(|png| storage.store_image_blob(&png, "png").map(|blob| blob.path))
        .transpose()
        .map_err(|error| error.to_string())?;
    Ok(CapturedImage {
        rendition,
        original_path,
    })
}

pub fn store_image_rendition(bytes: &[u8]) -> Result<StoredImageObject, String> {
    let source_hash = blake3::hash(bytes).to_hex().to_string();
    let storage = ThreadStorage::new().map_err(|error| error.to_string())?;
    if let Some(receipt) = storage
        .load_image_rendition(&source_hash)
        .map_err(|error| error.to_string())?
        .filter(|receipt| receipt.recipe == IMAGE_RENDITION_RECIPE)
    {
        if let Ok(path) = storage.find_object_blob(&receipt.rendition_hash) {
            return Ok(StoredImageObject {
                tone: storage
                    .get_image_tone(&receipt.rendition_hash)
                    .unwrap_or_else(|| "dark".to_string()),
                hash: receipt.rendition_hash,
                cas_path: path.to_string_lossy().to_string(),
            });
        }
    }
    let decoded = match image::load_from_memory(bytes) {
        Ok(image) => image.into_rgba8(),
        Err(image_error) => render_svg(bytes)
            .map_err(|svg_error| format!("Could not decode image: {image_error}; {svg_error}"))?,
    };
    let rendition = build_rendition(
        decoded.width(),
        decoded.height(),
        decoded.as_raw(),
        Channels::Rgba,
    )?;
    let stored = store_rendition(&storage, rendition)?;
    storage
        .save_image_rendition(&ImageRendition {
            source_hash,
            rendition_hash: stored.hash.clone(),
            recipe: IMAGE_RENDITION_RECIPE.to_string(),
        })
        .map_err(|error| error.to_string())?;
    Ok(stored)
}

fn render_svg(bytes: &[u8]) -> Result<RgbaImage, String> {
    let tree = resvg::usvg::Tree::from_data(bytes, &resvg::usvg::Options::default())
        .map_err(|error| format!("Could not parse SVG: {error}"))?;
    let size = tree.size();
    let (width, height) = rendition_size(size.width().ceil() as u32, size.height().ceil() as u32);
    let mut pixmap = resvg::tiny_skia::Pixmap::new(width, height)
        .ok_or_else(|| "SVG dimensions are too large".to_string())?;
    pixmap.fill(resvg::tiny_skia::Color::WHITE);
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::from_scale(
            width as f32 / size.width(),
            height as f32 / size.height(),
        ),
        &mut pixmap.as_mut(),
    );
    RgbaImage::from_raw(width, height, pixmap.take())
        .ok_or_else(|| "Could not read rendered SVG pixels".to_string())
}

fn store_rendition(
    storage: &ThreadStorage,
    rendition: Rendition,
) -> Result<StoredImageObject, String> {
    let stored = storage
        .store_file(&rendition.webp, "webp", Some(rendition.tone.clone()))
        .map_err(|error| error.to_string())?;
    Ok(StoredImageObject {
        hash: stored.hash,
        cas_path: stored.path,
        tone: rendition.tone,
    })
}

fn encode_png_rgb(width: u32, height: u32, rgb: &[u8]) -> Result<Vec<u8>, String> {
    let mut png = Vec::with_capacity(rgb.len() / 8);
    let mut encoder = png::Encoder::new(&mut png, width, height);
    encoder.set_color(png::ColorType::Rgb);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Fast);
    encoder
        .write_header()
        .and_then(|mut writer| writer.write_image_data(rgb))
        .map_err(|error| format!("Could not encode capture PNG: {error}"))?;
    Ok(png)
}

fn rendition_size(width: u32, height: u32) -> (u32, u32) {
    let (width_f, height_f) = (f64::from(width), f64::from(height));
    let scale = (RENDITION_PIXEL_BUDGET / (width_f * height_f))
        .sqrt()
        .min(RENDITION_MAX_EDGE / width_f.max(height_f))
        .min(1.0);
    (
        ((width_f * scale).round() as u32).max(1),
        ((height_f * scale).round() as u32).max(1),
    )
}

fn build_rendition(
    width: u32,
    height: u32,
    pixels: &[u8],
    channels: Channels,
) -> Result<Rendition, String> {
    let (target_width, target_height) = rendition_size(width, height);
    let resized;
    let target_pixels = if (target_width, target_height) == (width, height) {
        pixels
    } else {
        let source = ImageRef::new(width, height, pixels, channels.pixel_type())
            .map_err(|error| format!("Could not read image pixels: {error}"))?;
        let mut target = ResizeImage::new(target_width, target_height, channels.pixel_type());
        Resizer::new()
            .resize(
                &source,
                &mut target,
                &ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::CatmullRom)),
            )
            .map_err(|error| format!("Could not resize image: {error}"))?;
        resized = target.into_vec();
        resized.as_slice()
    };
    let tone = detect_tone(target_width, target_height, target_pixels, channels);
    let encoder = match channels {
        Channels::Rgb => webp::Encoder::from_rgb(target_pixels, target_width, target_height),
        Channels::Rgba => webp::Encoder::from_rgba(target_pixels, target_width, target_height),
    };
    let mut config =
        webp::WebPConfig::new().map_err(|_| "Could not configure WebP encoding".to_string())?;
    config.quality = RENDITION_QUALITY;
    config.method = RENDITION_METHOD;
    let webp = encoder
        .encode_advanced(&config)
        .map_err(|error| format!("Could not encode WebP rendition: {error:?}"))?
        .to_vec();
    Ok(Rendition { webp, tone })
}

struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0
    }

    fn range(&mut self, lo: u32, hi: u32) -> u32 {
        if hi <= lo + 1 {
            return lo;
        }
        lo + (self.next() as u32 % (hi - lo))
    }
}

fn detect_tone(width: u32, height: u32, pixels: &[u8], channels: Channels) -> String {
    let rgba = match channels {
        Channels::Rgba => RgbaImage::from_raw(width, height, pixels.to_vec()),
        Channels::Rgb => RgbaImage::from_raw(
            width,
            height,
            pixels
                .chunks_exact(channels.count())
                .flat_map(|pixel| [pixel[0], pixel[1], pixel[2], u8::MAX])
                .collect(),
        ),
    };
    let Some(rgba) = rgba else {
        return "dark".to_string();
    };
    let thumbnail = imageops::thumbnail(&rgba, TONE_THUMBNAIL_EDGE, TONE_THUMBNAIL_EDGE);
    let blurred = imageops::blur(&thumbnail, 1.5);
    let (w, h) = blurred.dimensions();
    if w == 0 || h == 0 {
        return "dark".to_string();
    }

    let srgb_to_linear = |c: u8| -> f32 {
        let f = c as f32 / 255.0;
        if f <= 0.04045 {
            f / 12.92
        } else {
            ((f + 0.055) / 1.055).powf(2.4)
        }
    };
    let get_luminance = |r: u8, g: u8, b: u8| -> f32 {
        0.2126 * srgb_to_linear(r) + 0.7152 * srgb_to_linear(g) + 0.0722 * srgb_to_linear(b)
    };

    let mut sum_lum = 0.0;
    let mut count = 0;
    for pixel in blurred.pixels() {
        if pixel[3] > 128 {
            sum_lum += get_luminance(pixel[0], pixel[1], pixel[2]);
            count += 1;
        }
    }
    if count == 0 {
        return "light".to_string();
    }
    let global_mean = sum_lum / count as f32;
    if global_mean <= 0.05 {
        return "dark".to_string();
    }
    if global_mean >= 0.75 {
        return "light".to_string();
    }

    let mut rng = Lcg(0xDEAD_BEEF_CAFE_1337);
    let grid_size = 12;
    let samples_per_cell = 8;
    let threshold = 0.179;
    let mut dark_score = 0.0;
    let mut light_score = 0.0;
    for gy in 0..grid_size {
        for gx in 0..grid_size {
            let cx0 = gx * w / grid_size;
            let cx1 = ((gx + 1) * w / grid_size).max(cx0 + 1);
            let cy0 = gy * h / grid_size;
            let cy1 = ((gy + 1) * h / grid_size).max(cy0 + 1);
            for _ in 0..samples_per_cell {
                let x = rng.range(cx0, cx1).min(w.saturating_sub(1));
                let y = rng.range(cy0, cy1).min(h.saturating_sub(1));
                if blurred.get_pixel(x, y)[3] < 128 {
                    continue;
                }
                let mut local_dark = 0;
                let mut local_light = 0;
                let mut valid_neighbors = 0;
                for dy in -1..=1 {
                    for dx in -1..=1 {
                        let nx = (x as i32 + dx) as u32;
                        let ny = (y as i32 + dy) as u32;
                        if nx < w && ny < h {
                            let px = blurred.get_pixel(nx, ny);
                            if px[3] > 128 {
                                if get_luminance(px[0], px[1], px[2]) < threshold {
                                    local_dark += 1;
                                } else {
                                    local_light += 1;
                                }
                                valid_neighbors += 1;
                            }
                        }
                    }
                }
                if valid_neighbors > 0 {
                    let confidence =
                        (local_dark as f32 - local_light as f32).abs() / valid_neighbors as f32;
                    if local_dark >= local_light {
                        dark_score += 1.0 + confidence;
                    } else {
                        light_score += 1.0 + confidence;
                    }
                }
            }
        }
    }
    if dark_score >= light_score {
        "dark".to_string()
    } else {
        "light".to_string()
    }
}
