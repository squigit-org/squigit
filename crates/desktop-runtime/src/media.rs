// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Everything pixel/image/clipboard — tone detection, clipboard R/W, image processing, imgbb upload.

use squigit_memory::{ChatStorage, StoredImage};
use squigit_auth::ProfileStore;

// =============================================================================
// Tone Detection
// =============================================================================

use image::{imageops, GenericImageView};

struct Lcg(u64);
impl Lcg {
    #[inline]
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0
    }
    #[inline]
    fn range(&mut self, lo: u32, hi: u32) -> u32 {
        if hi <= lo + 1 {
            return lo;
        }
        lo + (self.next() as u32 % (hi - lo))
    }
}

pub fn detect_image_tone_from_bytes(bytes: &[u8]) -> Option<String> {
    let img = image::load_from_memory(bytes).ok()?;
    let (width, height) = img.dimensions();

    if width == 0 || height == 0 {
        return Some("d".to_string());
    }

    let max_dim = 256;
    let thumb = img.thumbnail(max_dim, max_dim);
    let blurred = imageops::blur(&thumb, 1.5);

    let (w, h) = blurred.dimensions();
    if w == 0 || h == 0 {
        return Some("d".to_string());
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
        return Some("l".to_string());
    }

    let global_mean = sum_lum / count as f32;
    if global_mean <= 0.05 {
        return Some("d".to_string());
    }
    if global_mean >= 0.75 {
        return Some("l".to_string());
    }

    let mut rng = Lcg(0xDEAD_BEEF_CAFE_1337);
    let grid_size = 12;
    let spc = 8;

    let thresh = 0.179;
    let mut dark_score = 0.0;
    let mut light_score = 0.0;

    for gy in 0..grid_size {
        for gx in 0..grid_size {
            let cx0 = gx * w / grid_size;
            let cx1 = ((gx + 1) * w / grid_size).max(cx0 + 1);
            let cy0 = gy * h / grid_size;
            let cy1 = ((gy + 1) * h / grid_size).max(cy0 + 1);

            for _ in 0..spc {
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
                                let l = get_luminance(px[0], px[1], px[2]);
                                if l < thresh {
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
                    let is_node_dark = local_dark >= local_light;

                    if is_node_dark {
                        dark_score += 1.0 + confidence;
                    } else {
                        light_score += 1.0 + confidence;
                    }
                }
            }
        }
    }

    if dark_score >= light_score {
        Some("d".to_string())
    } else {
        Some("l".to_string())
    }
}

// =============================================================================
// Image Processing
// =============================================================================

pub fn process_and_store_image(path: String) -> Result<StoredImage, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    process_bytes_internal(bytes)
}

pub fn process_bytes_internal(buffer: Vec<u8>) -> Result<StoredImage, String> {
    if buffer.is_empty() {
        return Err("Empty image buffer".to_string());
    }

    let explicit_tone = detect_image_tone_from_bytes(&buffer);
    let stored = squigit_brain::context::media::process_bytes_internal(buffer, explicit_tone)?;

    Ok(stored)
}

pub async fn upload_image_to_imgbb(image_path: &str, api_key: &str) -> Result<String, String> {
    squigit_brain::context::media::upload_image_to_imgbb(image_path, api_key).await
}

// =============================================================================
// Clipboard
// =============================================================================

pub fn read_and_store_clipboard_image() -> Result<StoredImage, String> {
    use arboard::Clipboard;
    use image::ImageEncoder;

    let mut clipboard =
        Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;

    let image_data = clipboard
        .get_image()
        .map_err(|e| format!("Failed to get image from clipboard: {}", e))?;

    let img = image::ImageBuffer::<image::Rgba<u8>, _>::from_raw(
        image_data.width as u32,
        image_data.height as u32,
        image_data.bytes.into_owned(),
    )
    .ok_or("Failed to create image buffer")?;

    let mut buffer = Vec::new();
    let cursor = std::io::Cursor::new(&mut buffer);

    image::codecs::png::PngEncoder::new(cursor)
        .write_image(
            &img,
            image_data.width as u32,
            image_data.height as u32,
            image::ColorType::Rgba8.into(),
        )
        .map_err(|e| format!("Failed to encode image: {}", e))?;

    let profile_store = ProfileStore::new().map_err(|e| e.to_string())?;
    let active_id = profile_store
        .get_active_profile_id()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No active profile. Please log in first.".to_string())?;

    let chats_dir = profile_store.get_chats_dir(&active_id);
    let storage = ChatStorage::with_base_dir(chats_dir).map_err(|e| e.to_string())?;
    let stored = storage
        .store_image(&buffer, None)
        .map_err(|e| e.to_string())?;

    Ok(stored)
}

pub fn read_clipboard_text() -> Result<String, String> {
    use arboard::Clipboard;

    let mut clipboard =
        Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;

    clipboard
        .get_text()
        .map_err(|e| format!("Failed to get text from clipboard: {}", e))
}

pub fn copy_image_to_clipboard(image_base64: String) -> Result<(), String> {
    use arboard::{Clipboard, ImageData};
    use base64::Engine;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(image_base64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let img =
        image::load_from_memory(&bytes).map_err(|e| format!("Failed to decode image: {}", e))?;

    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();

    let img_data = ImageData {
        width: width as usize,
        height: height as usize,
        bytes: std::borrow::Cow::Owned(rgba.into_raw()),
    };

    let mut clipboard =
        Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;

    clipboard
        .set_image(img_data)
        .map_err(|e| format!("Failed to copy image: {}", e))?;

    Ok(())
}

pub fn copy_image_from_path_to_clipboard(path: String) -> Result<(), String> {
    use arboard::{Clipboard, ImageData};

    let img = image::open(&path).map_err(|e| format!("Failed to open image at {}: {}", path, e))?;

    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();

    let img_data = ImageData {
        width: width as usize,
        height: height as usize,
        bytes: std::borrow::Cow::Owned(rgba.into_raw()),
    };

    let mut clipboard =
        Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;

    clipboard
        .set_image(img_data)
        .map_err(|e| format!("Failed to copy image: {}", e))?;

    Ok(())
}
