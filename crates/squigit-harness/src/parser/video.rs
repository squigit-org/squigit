// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::parser::ParseControl;
use crate::parser::{
    source_path, CollageBuilder, Error, ImageOptions, Manifest, OutputDirectory, ParseOutput,
    Result, Selection, Tile, MAX_ITEMS,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VideoRequest {
    pub path: PathBuf,
    pub from: u64,
    pub to: u64,
    pub jump: u64,
    pub output_dir: PathBuf,
    #[serde(default)]
    pub images: ImageOptions,
}

#[derive(Deserialize)]
struct Probe {
    streams: Vec<Stream>,
    format: Format,
}

#[derive(Deserialize)]
struct Stream {
    index: u32,
    codec_type: Option<String>,
    duration: Option<String>,
    #[serde(default)]
    disposition: Disposition,
}

#[derive(Default, Deserialize)]
struct Disposition {
    #[serde(default)]
    attached_pic: u32,
}

#[derive(Deserialize)]
struct Format {
    duration: Option<String>,
}

pub fn parse(mut request: VideoRequest, control: &ParseControl) -> Result<ParseOutput> {
    control.check()?;
    request.images.validate()?;
    if request.from >= request.to || request.jump == 0 {
        return Err(Error::InvalidInput(
            "Video times are milliseconds; require from < to and jump > 0".into(),
        ));
    }
    let count = (request.to - request.from).div_ceil(request.jump);
    if count > MAX_ITEMS {
        return Err(Error::InvalidInput(format!(
            "Selection produces {count} frames; increase jump or select a shorter clip (maximum {MAX_ITEMS})"
        )));
    }
    let path = source_path(&request.path)?;
    let mut command = Command::new("ffprobe");
    command
        .args([
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
        ])
        .arg(&path);
    let probe: Probe = serde_json::from_slice(&run(command, control)?.stdout)?;
    let video = probe
        .streams
        .iter()
        .find(|stream| {
            stream.codec_type.as_deref() == Some("video") && stream.disposition.attached_pic == 0
        })
        .ok_or_else(|| Error::InvalidInput("Input has no video stream".into()))?;
    let duration = video
        .duration
        .as_deref()
        .and_then(duration_ms)
        .or_else(|| probe.format.duration.as_deref().and_then(duration_ms))
        .ok_or_else(|| Error::Parse("Video duration could not be determined".into()))?;
    let container_duration = probe
        .format
        .duration
        .as_deref()
        .and_then(duration_ms)
        .unwrap_or(duration);
    if request.to > duration && request.to <= container_duration {
        request.to = duration;
    }
    if request.from >= request.to || request.to > duration {
        return Err(Error::InvalidInput(format!(
            "Requested time {} ms but video duration is {duration} ms",
            request.to
        )));
    }
    let count = (request.to - request.from).div_ceil(request.jump);
    let directory = OutputDirectory::new(&request.output_dir)?;
    let mut collages = CollageBuilder::new(request.images.clone())?;
    for index in 0..count {
        let timestamp = request.from + index * request.jump;
        control.report(format!("Sampling frame {} of {count}", index + 1))?;
        let mut command = ffmpeg(&path, timestamp, request.to - timestamp);
        command.args([
            "-map",
            &format!("0:{}", video.index),
            "-frames:v",
            "1",
            "-an",
            "-vf",
            &format!(
                "scale={0}:{0}:force_original_aspect_ratio=decrease,setsar=1",
                request.images.tile_long_edge
            ),
            "-threads",
            "1",
            "-f",
            "image2pipe",
            "-c:v",
            "png",
            "pipe:1",
        ]);
        let frame = run(command, control)?.stdout;
        if frame.is_empty() {
            return Err(Error::Parse(format!(
                "No video frame is available at {timestamp} ms"
            )));
        }
        let image = image::load_from_memory_with_format(&frame, image::ImageFormat::Png)?.to_rgb8();
        collages.push(
            directory.path(),
            Tile {
                image,
                label: timestamp_label(timestamp),
                page: None,
                timestamp_ms: Some(timestamp),
            },
        )?;
    }
    let mut warnings = Vec::new();
    let audio = if let Some(audio) = probe
        .streams
        .iter()
        .find(|stream| stream.codec_type.as_deref() == Some("audio"))
    {
        let mut command = ffmpeg(&path, request.from, request.to - request.from);
        command
            .args([
                "-map",
                &format!("0:{}", audio.index),
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
            .arg(directory.path().join("audio.mp3"));
        run(command, control)?;
        Some("audio.mp3".into())
    } else {
        warnings.push("Video has no audio track; no MP3 was generated".into());
        None
    };
    let images = collages.finish(directory.path())?;
    directory.finish(Manifest {
        schema: 1,
        source_format: path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_ascii_lowercase(),
        source: path,
        selection: Selection::Time {
            from: request.from,
            to: request.to,
            jump: request.jump,
            duration_ms: duration,
        },
        images,
        text: None,
        audio,
        warnings,
    })
}

pub(crate) fn ffmpeg(path: &Path, from: u64, duration: u64) -> Command {
    let mut command = Command::new("ffmpeg");
    command
        .args(["-v", "error", "-nostdin", "-y", "-ss", &seconds(from)])
        .arg("-i")
        .arg(path)
        .args(["-t", &seconds(duration)]);
    command
}

pub(crate) fn run(mut command: Command, control: &ParseControl) -> Result<Output> {
    use std::io::Read;
    use std::process::Stdio;
    control.check()?;
    let program = command.get_program().to_string_lossy().to_string();
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|error| Error::Process {
        program: program.clone(),
        message: format!("Could not start the local executable: {error}"),
    })?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| Error::Parse("Missing process output".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| Error::Parse("Missing process diagnostics".into()))?;
    let read = |mut pipe: Box<dyn Read + Send>| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            pipe.read_to_end(&mut bytes).map(|_| bytes)
        })
    };
    let stdout = read(Box::new(stdout));
    let stderr = read(Box::new(stderr));
    let result = loop {
        if let Err(error) = control.check() {
            let _ = child.kill();
            let _ = child.wait();
            break Err(error);
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(40)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(Error::Io(error));
            }
        }
    };
    let stdout = stdout
        .join()
        .map_err(|_| Error::Parse("Process reader failed".into()))??;
    let stderr = stderr
        .join()
        .map_err(|_| Error::Parse("Process reader failed".into()))??;
    let status = result?;
    if !status.success() {
        return Err(Error::Process {
            program,
            message: format!(
                "{status}: {}",
                String::from_utf8_lossy(&stderr)
                    .trim()
                    .chars()
                    .take(2000)
                    .collect::<String>()
            ),
        });
    }
    Ok(Output {
        status,
        stdout,
        stderr,
    })
}

pub fn probe_media(path: &Path, control: &ParseControl) -> Result<(u64, bool, bool)> {
    let mut command = Command::new("ffprobe");
    command
        .args([
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
        ])
        .arg(path);
    let probe: Probe = serde_json::from_slice(&run(command, control)?.stdout)?;
    let duration = probe
        .streams
        .iter()
        .find(|stream| {
            stream.codec_type.as_deref() == Some("video") && stream.disposition.attached_pic == 0
        })
        .and_then(|stream| stream.duration.as_deref().and_then(duration_ms))
        .or_else(|| probe.format.duration.as_deref().and_then(duration_ms))
        .or_else(|| {
            probe
                .streams
                .iter()
                .find_map(|stream| stream.duration.as_deref().and_then(duration_ms))
        })
        .ok_or_else(|| Error::Parse("Media duration could not be determined".into()))?;
    Ok((
        duration,
        probe
            .streams
            .iter()
            .any(|s| s.codec_type.as_deref() == Some("video") && s.disposition.attached_pic == 0),
        probe
            .streams
            .iter()
            .any(|s| s.codec_type.as_deref() == Some("audio")),
    ))
}

pub(crate) fn seconds(milliseconds: u64) -> String {
    format!("{}.{:03}", milliseconds / 1000, milliseconds % 1000)
}

fn duration_ms(value: &str) -> Option<u64> {
    let seconds = value.parse::<f64>().ok()?;
    (seconds.is_finite() && seconds > 0.0 && seconds < u64::MAX as f64 / 1000.0)
        .then(|| (seconds * 1000.0).ceil() as u64)
}

fn timestamp_label(milliseconds: u64) -> String {
    format!(
        "{:02}:{:02}:{:02}.{:03}",
        milliseconds / 3_600_000,
        milliseconds / 60_000 % 60,
        milliseconds / 1000 % 60,
        milliseconds % 1000
    )
}
