#include <iostream>
#include <string>
#include <thread>
#include <atomic>
#include <vector>

#include <nlohmann/json.hpp>
#include "audio.hpp"
#include "inference.hpp"

using json = nlohmann::json;

// Global state
std::unique_ptr<snapllm::AudioCapture> audio_capture;
std::unique_ptr<snapllm::InferenceEngine> inference_engine;
std::thread inference_thread;
std::atomic<bool> is_processing{false};

void send_json(const json& j) {
    std::cout << j.dump() << std::endl;
}

void on_transcription(const snapllm::TranscriptionResult& result) {
    json j;
    j["type"] = "transcription";
    j["text"] = result.text;
    j["is_final"] = result.is_final;
    send_json(j);
}

void start_engine(const std::string& model_path, const std::string& language, int device_index) {
    if (is_processing) {
        json j; j["type"] = "error"; j["message"] = "Already running";
        send_json(j);
        return;
    }

    audio_capture = std::make_unique<snapllm::AudioCapture>();
    inference_engine = std::make_unique<snapllm::InferenceEngine>();

    snapllm::InferenceParams params;
    params.model_path = model_path;
    params.language = language;

    if (!inference_engine->init(params)) {
        json j; j["type"] = "error"; j["message"] = "Failed to init model";
        send_json(j);
        return;
    }

    // Start Audio
    bool started = audio_capture->start([&](const std::vector<float>& pcm) {
        if (inference_engine) {
            inference_engine->add_audio(pcm);
        }
    });

    if (!started) {
        json j; j["type"] = "error"; j["message"] = "Failed to start audio";
        send_json(j);
        return;
    }

    is_processing = true;
    
    // Start Inference Loop
    inference_thread = std::thread([&]() {
        inference_engine->run(on_transcription);
    });

    json j; j["type"] = "status"; j["status"] = "started";
    send_json(j);
}

void stop_engine() {
    if (!is_processing) return;

    if (audio_capture) audio_capture->stop();
    if (inference_engine) inference_engine->stop();

    if (inference_thread.joinable()) {
        inference_thread.join();
    }

    is_processing = false;
    audio_capture.reset();
    inference_engine.reset();

    json j; j["type"] = "status"; j["status"] = "stopped";
    send_json(j);
}

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        try {
            auto j = json::parse(line);
            std::string command = j["command"];

            if (command == "start") {
                std::string model = j.value("model", "models/ggml-base.en.bin");
                std::string lang = j.value("language", "en");
                int device = j.value("device_index", -1);
                start_engine(model, lang, device);
            } 
            else if (command == "stop") {
                stop_engine();
            }
            else if (command == "quit") {
                stop_engine();
                break;
            }
        } catch (const std::exception& e) {
            json err;
            err["type"] = "error";
            err["message"] = e.what();
            send_json(err);
        }
    }
    return 0;
}
