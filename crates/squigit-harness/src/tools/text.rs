// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::scope::display_path;
use std::borrow::Cow;
use std::path::Path;

pub(crate) const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;
const SNIFF_BYTES: usize = 8 * 1024;
const BINARY_CONTROL_RATIO: f64 = 0.3;
const MEDIA_SIGNATURES: &[&[u8]] = &[
    b"\x89PNG\r\n\x1a\n",
    b"\xff\xd8\xff",
    b"GIF87a",
    b"GIF89a",
    b"%PDF-",
];

pub(crate) fn decode(path: &Path, bytes: &[u8]) -> Result<String, String> {
    if bytes.starts_with(b"\xff\xfe\x00\x00") || bytes.starts_with(b"\x00\x00\xfe\xff") {
        return Err(format!(
            "{} uses UTF-32 text encoding, which cannot be read.",
            display_path(path)
        ));
    }
    if let Some(rest) = bytes.strip_prefix(b"\xff\xfe") {
        return Ok(decode_utf16(rest, u16::from_le_bytes));
    }
    if let Some(rest) = bytes.strip_prefix(b"\xfe\xff") {
        return Ok(decode_utf16(rest, u16::from_be_bytes));
    }
    let bytes = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    if is_media(bytes) {
        return Err(format!(
            "{} is an image or PDF file and cannot be read as text.",
            display_path(path)
        ));
    }
    if is_binary(bytes) {
        return Err(format!(
            "Cannot display content of binary file: {}",
            display_path(path)
        ));
    }
    Ok(String::from_utf8_lossy(bytes).into_owned())
}

pub(crate) fn is_binary(bytes: &[u8]) -> bool {
    let sample = &bytes[..bytes.len().min(SNIFF_BYTES)];
    if sample.is_empty() {
        return false;
    }
    if sample.contains(&0) {
        return true;
    }
    let controls = sample
        .iter()
        .filter(|&&byte| byte < 9 || (14..32).contains(&byte))
        .count();
    controls as f64 / sample.len() as f64 > BINARY_CONTROL_RATIO
}

pub(crate) fn clip_line(line: &str, max_chars: usize) -> Cow<'_, str> {
    let Some((cut, _)) = line.char_indices().nth(max_chars) else {
        return Cow::Borrowed(line);
    };
    let total = line.chars().count();
    Cow::Owned(format!("{}… [line truncated, {total} chars]", &line[..cut]))
}

fn is_media(bytes: &[u8]) -> bool {
    MEDIA_SIGNATURES
        .iter()
        .any(|signature| bytes.starts_with(signature))
        || (bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP")
}

fn decode_utf16(bytes: &[u8], read: fn([u8; 2]) -> u16) -> String {
    let units = bytes.chunks_exact(2).map(|pair| read([pair[0], pair[1]]));
    char::decode_utf16(units)
        .map(|unit| unit.unwrap_or(char::REPLACEMENT_CHARACTER))
        .collect()
}
