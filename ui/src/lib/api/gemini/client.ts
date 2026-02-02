import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

let currentAbortController: AbortController | null = null;
let currentChatHistory: Content[] = [];

// Types matching Backend structs
interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

export type Content = GeminiContent;

let storedApiKey: string | null = null;

export const initializeGemini = (apiKey: string) => {
  storedApiKey = apiKey;
};

// No longer needs direct frontend initialization for Chat object,
// but we keep history in memory for session continuity if needed.

export const startNewChat = async (
  modelId: string,
  imageBase64: string,
  mimeType: string,
  systemPrompt: string,
): Promise<string> => {
  // Single-shot chat not utilizing stream - can reuse stream logic or implement separate command.
  // For consistency with user request (everything streamed), we can use the stream function but collect text.
  // Check if user actually uses this function - seems mostly unused or for single-turn.
  // We'll implement it via the streaming command for simplicity as backend only has streaming now.

  let fullText = "";
  await startNewChatStream(
    modelId,
    imageBase64,
    mimeType,
    systemPrompt,
    (token) => (fullText += token),
  );
  return fullText;
};

const cleanBase64 = (data: string) => {
  return data.replace(/^data:image\/[a-z]+;base64,/, "");
};

interface GeminiEvent {
  token: string;
}

export const startNewChatStream = async (
  modelId: string,
  imageBase64: string,
  mimeType: string,
  systemPrompt: string,
  onToken: (token: string) => void,
): Promise<string> => {
  if (!storedApiKey) throw new Error("Gemini API Key not set");

  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();

  const channelId = `gemini-stream-${Date.now()}`;
  const unlisten = await listen<GeminiEvent>(channelId, (event) => {
    onToken(event.payload.token);
  });

  // Construct initial contents
  // User strategy: Image first + System Prompt + Prompt
  // But wait! This function signature takes 'systemPrompt' which usually contains the user's initial instructions + context.

  // Note: Gemini API treats 'system_instruction' separately in newer APIs,
  // but 'streamGenerateContent' REST API takes 'contents' and 'systemInstruction' (optional).
  // Our backend command currently takes 'contents' vector.
  // We will pack system prompt into the first user message or as a separate 'system' role if supported?
  // 'system' role is supported in 'contents' for some models, or via 'systemInstruction' field.
  // To keep it simple and matching previous logic which combined them:
  // Previous logic: parts = [{inlineData}, {text: systemPrompt}]

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64(imageBase64),
          },
        },
        {
          text: systemPrompt, // This contains sys prompt + user prompt combined by useChat
        },
      ],
    },
  ];

  // Update local history
  currentChatHistory = [...contents];

  try {
    await invoke("stream_gemini_chat", {
      apiKey: storedApiKey,
      model: modelId,
      contents: contents,
      channelId: channelId,
    });

    // Cleanup
    unlisten();
    currentAbortController = null;
    return "Stream completed"; // Full text is collected by caller via onToken usually
  } catch (error) {
    unlisten();
    currentAbortController = null;
    console.error("Backend stream error:", error);
    throw error;
  }
};

export const sendMessage = async (text: string): Promise<string> => {
  // Used for subsequent turns.
  // We need the history + new prompt.
  // Since 'startNewChatStream' resets history, we must rely on 'restoreSession' or manual history tracking.
  // The 'useChat' hook manages 'messages' state, but 'client.ts' also had 'chatSession' state from SDK.
  // We need to mirror that state here since we lost the SDK object.

  if (!storedApiKey) throw new Error("Gemini API Key not set");

  // Append user message to history
  currentChatHistory.push({
    role: "user",
    parts: [{ text: text }],
  });

  const channelId = `gemini-stream-${Date.now()}`;
  let fullResponse = "";

  const unlisten = await listen<GeminiEvent>(channelId, (event) => {
    fullResponse += event.payload.token;
  });

  try {
    await invoke("stream_gemini_chat", {
      apiKey: storedApiKey,
      model: currentModelId || "gemini-flash-lite-latest",
      contents: currentChatHistory,
      channelId: channelId,
    });

    unlisten();

    // Append model response to history
    currentChatHistory.push({
      role: "model",
      parts: [{ text: fullResponse }],
    });

    return fullResponse;
  } catch (error) {
    unlisten();
    console.error("SendMessage error:", error);
    throw error;
  }
};

let currentModelId = "gemini-flash-lite-latest";

export const restoreSession = (
  modelId: string,
  history: Content[], // This comes from useChat logic (optimized or full)
  systemPrompt: string,
) => {
  currentModelId = modelId;
  currentChatHistory = history;
  // We don't need to do anything else, the next 'sendMessage' will use this history.
  // However, if the intent is to immediately start a chat *with* this history,
  // usually 'restoreSession' just sets state.
  // But 'useChat.ts' calls 'apiRestoreSession(..., history, ...)'
  // and then expects to be ready for 'handleSend' which calls 'sendMessage'.
  // So setting state is correct.
};
