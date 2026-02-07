// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0
use std::f32::consts::PI;
use std::time::Duration;
use rodio::OutputStreamBuilder;

#[tauri::command]
pub fn play_pop_sound() {
    std::thread::spawn(|| {
        if let Ok(stream) = OutputStreamBuilder::open_default_stream() {
            let sample_rate = 44100u32;
            let duration_secs = 0.15f32;
            let num_samples = (sample_rate as f32 * duration_secs) as usize;
            
            let samples: Vec<f32> = (0..num_samples)
                .map(|i| {
                    let t = i as f32 / sample_rate as f32;
                    let progress = t / duration_secs;
                    
                    // Smoother frequency sweep: 900Hz → 120Hz
                    let start_freq = 900.0f32;
                    let end_freq = 120.0f32;
                    let current_freq = start_freq * (end_freq / start_freq).powf(progress);
                    
                    // Enhanced envelope with smoother attack and natural decay
                    let envelope = if t < 0.002 {
                        // Very fast attack with slight curve
                        (t / 0.002).powf(0.8)
                    } else {
                        // Smooth exponential decay
                        let decay_time = t - 0.002;
                        let decay_duration = duration_secs - 0.002;
                        (1.0 - (decay_time / decay_duration)).powf(3.2) 
                            * (-decay_time * 8.0).exp()
                    };
                    
                    // Main sine wave
                    let sine = (2.0 * PI * current_freq * t).sin();
                    
                    // Add subtle harmonic richness
                    let harmonic = (2.0 * PI * current_freq * 2.0 * t).sin() * 0.15;
                    
                    // Blend and apply envelope
                    (sine + harmonic) * envelope * 0.35
                })
                .collect();
            
            let source = rodio::buffer::SamplesBuffer::new(1, sample_rate, samples);
            stream.mixer().add(source);
            
            std::thread::sleep(Duration::from_millis(180));
        }
    });
}