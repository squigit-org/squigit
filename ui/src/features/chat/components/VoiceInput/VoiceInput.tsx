import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Mic, Square } from "lucide-react";
import styles from "./VoiceInput.module.css";
import { Tooltip } from "@/primitives/tooltip";

interface VoiceInputProps {
  onTranscript: (text: string, isFinal: boolean) => void;
  disabled?: boolean;
}

interface SttEvent {
  type: "transcription" | "status" | "error";
  text?: string;
  is_final?: boolean;
  status?: string;
  message?: string;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({
  onTranscript,
  disabled,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const onTranscriptRef = useRef(onTranscript);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const micButtonRef = useRef<HTMLButtonElement>(null);
  const [showMicButtonTooltip, setShowMicButtonTooltip] = useState(false);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // Setup event listener once
  useEffect(() => {
    let unlistenFn: UnlistenFn | undefined;
    let isMounted = true;

    const setupListener = async () => {
      try {
        const unlisten = await listen<SttEvent>("stt_event", (event) => {
          const payload = event.payload;

          if (payload.type === "transcription" && payload.text) {
            // Always use the latest callback
            onTranscriptRef.current(payload.text, payload.is_final || false);
          } else if (payload.type === "status") {
            console.log("[STT] Status:", payload.status);
            if (payload.status === "ready") setIsReady(true);
          } else if (payload.type === "error") {
            console.error("[STT] Error:", payload.message);
            setIsRecording(false);
          }
        });

        if (isMounted) {
          unlistenRef.current = unlisten;
          unlistenFn = unlisten;
        } else {
          unlisten(); // Cleanup immediately if unmounted during await
        }
      } catch (err) {
        console.error("Failed to setup STT listener:", err);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []); // Run once

  const toggleRecording = useCallback(async () => {
    if (disabled) return;

    if (isRecording) {
      // Stop
      try {
        await invoke("stop_stt");
      } catch (err) {
        console.error("Failed to stop STT:", err);
      } finally {
        setIsRecording(false);
      }
    } else {
      // Start
      try {
        setIsRecording(true);
        await invoke("start_stt", {
          model: "ggml-tiny.en.bin",
          language: "en",
        });
      } catch (err) {
        console.error("Failed to start STT:", err);
        setIsRecording(false);
      }
    }
  }, [disabled, isRecording]);

  return (
    <div className={styles.container}>
      <button
        className={`${styles.micButton} ${isRecording ? styles.recording : ""}`}
        onClick={toggleRecording}
        disabled={disabled}
        type="button"
        ref={micButtonRef}
        onMouseEnter={() => setShowMicButtonTooltip(true)}
        onMouseLeave={() => setShowMicButtonTooltip(false)}
      >
        {isRecording ? (
          <Square className={styles.icon} fill="currentColor" />
        ) : (
          <Mic className={styles.icon} />
        )}
      </button>
      <Tooltip
        text={isRecording ? "Stop recording" : "Start recording"}
        parentRef={micButtonRef}
        show={showMicButtonTooltip}
        above
      />
    </div>
  );
};
