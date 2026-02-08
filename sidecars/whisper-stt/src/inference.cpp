#include "inference.hpp"
#include "whisper.h"
#include <iostream>
#include <vector>
#include <mutex>
#include <thread>
#include <atomic>
#include <cmath>
#include <chrono>

namespace snapllm {

    struct InferenceEngine::Impl {
        struct whisper_context* ctx = nullptr;
        InferenceParams params;
        
        std::vector<float> audio_buffer;
        std::mutex audio_mutex;
        
        std::atomic<bool> running{false};
        std::atomic<bool> should_stop{false};

        // VAD settings
        float vad_threshold = 0.005f; // Simple energy threshold
        int sample_rate = 16000;
        
        // State for streaming
        int n_samples_processed = 0;
    };

    InferenceEngine::InferenceEngine() : impl(new Impl()) {}

    InferenceEngine::~InferenceEngine() {
        stop();
        if (impl->ctx) {
            whisper_free(impl->ctx);
        }
        delete impl;
    }

    bool InferenceEngine::init(const InferenceParams& params) {
        impl->params = params;
        struct whisper_context_params cparams = whisper_context_default_params();
        impl->ctx = whisper_init_from_file_with_params(params.model_path.c_str(), cparams);

        if (!impl->ctx) {
            std::cerr << "Failed to initialize whisper context from " << params.model_path << std::endl;
            return false;
        }
        return true;
    }

    void InferenceEngine::add_audio(const std::vector<float>& pcm_data) {
        std::lock_guard<std::mutex> lock(impl->audio_mutex);
        impl->audio_buffer.insert(impl->audio_buffer.end(), pcm_data.begin(), pcm_data.end());
    }

    void InferenceEngine::stop() {
        impl->should_stop = true;
    }

    // Simple RMS calculation
    float calculate_rms(const std::vector<float>& data) {
        if (data.empty()) return 0.0f;
        float sum = 0.0f;
        for (float sample : data) {
            sum += sample * sample;
        }
        return std::sqrt(sum / data.size());
    }

    void InferenceEngine::run(TranscriptionCallback callback) {
        impl->running = true;
        impl->should_stop = false;

        const int step_ms = 3000; // Process every 3 seconds of new audio? Or simpler: accumulate until silence?
        // Streaming strategy:
        // We accumulate audio. Every X ms, we run inference on the available buffer.
        // To avoid re-processing everything, we can use whisper state, but for simplicity:
        // Let's implement a sliding window or just simple accumulation for now.

        // Actually, for "Circle to Search" chat, the user likely speaks a sentence then stops.
        // It's not continuous transcription of a meeting.
        // So we can be a bit more aggressive with updates.

        std::vector<float> pcmf32;
        
        while (!impl->should_stop) {
            // Sleep a bit to gather audio
            std::this_thread::sleep_for(std::chrono::milliseconds(200));

            {
                std::lock_guard<std::mutex> lock(impl->audio_mutex);
                if (impl->audio_buffer.empty()) continue;
                
                // Copy new data
                pcmf32 = impl->audio_buffer; 
                // We don't clear buffer yet because whisper needs context.
                // But if buffer gets too large (>30s), we should shift or clear.
                
                if (pcmf32.size() > 30 * 16000) {
                     // Keep last 30s
                     size_t keep = 30 * 16000;
                     size_t remove = pcmf32.size() - keep;
                     impl->audio_buffer.erase(impl->audio_buffer.begin(), impl->audio_buffer.begin() + remove);
                     pcmf32 = impl->audio_buffer;
                }
            }

            // VAD check on the *new* part of the signal?
            // For now, just check if the last chunk has energy.
            // If the user stops speaking, we might want to trigger a "final" callback.
            
            if (pcmf32.size() < 16000) { // Wait for at least 1s of audio
                continue;
            }

            whisper_full_params wparams = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
            wparams.print_progress = false;
            wparams.print_special = false;
            wparams.print_realtime = false;
            wparams.print_timestamps = false;
            wparams.translate = impl->params.translate;
            wparams.language = impl->params.language.c_str();
            wparams.n_threads = impl->params.n_threads;
            
            // Streaming-specific:
            wparams.no_context = true; // Use previous context? No, for now stateless is safer.
            wparams.single_segment = false; 

            if (whisper_full(impl->ctx, wparams, pcmf32.data(), pcmf32.size()) != 0) {
                std::cerr << "failed to process audio" << std::endl;
                continue;
            }

            const int n_segments = whisper_full_n_segments(impl->ctx);
            std::string text = "";
            for (int i = 0; i < n_segments; ++i) {
                text += whisper_full_get_segment_text(impl->ctx, i);
            }

            TranscriptionResult result;
            result.text = text;
            result.is_final = false; // logic for finality?
            // Maybe if VAD says silence for last 1s?
            
            // For now, just stream updates
            callback(result);
        }

        impl->running = false;
    }

}
