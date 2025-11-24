import { GoogleGenAI, Chat, Part } from "@google/genai";

let ai: GoogleGenAI | null = null;
let chatSession: Chat | null = null;

export const initializeGemini = (apiKey: string) => {
  ai = new GoogleGenAI({ apiKey });
};

export const startNewChat = async (
  modelId: string,
  imageBase64: string,
  mimeType: string,
  systemPrompt: string
): Promise<string> => {
  if (!ai) throw new Error("Gemini AI not initialized");

  chatSession = ai.chats.create({
    model: modelId,
    config: {
      systemInstruction:
        "You are a helpful AI assistant specialized in analyzing images.",
    },
  });

  const parts: Part[] = [
    {
      inlineData: {
        mimeType,
        data: imageBase64,
      },
    },
    {
      text: systemPrompt,
    },
  ];

  try {
    const response = await chatSession.sendMessage({
      message: parts,
    });

    return response.text || "No response text generated.";
  } catch (error) {
    console.error("Error starting chat:", error);
    throw error;
  }
};

export const startNewChatStream = async (
  modelId: string,
  imageBase64: string,
  mimeType: string,
  systemPrompt: string,
  onToken: (token: string) => void
): Promise<string> => {
  if (!ai) throw new Error("Gemini AI not initialized");

  chatSession = ai.chats.create({
    model: modelId,
    config: {
      systemInstruction:
        "You are a helpful AI assistant specialized in analyzing images.",
    },
  });

  const parts: Part[] = [
    {
      inlineData: {
        mimeType,
        data: imageBase64,
      },
    },
    {
      text: systemPrompt,
    },
  ];

  try {
    let fullText = "";

    const stream = await chatSession.sendMessageStream({
      message: parts,
    });

    for await (const chunk of stream) {
      const token = chunk.text || "";
      if (token) {
        fullText += token;
        await new Promise((resolve) => setTimeout(resolve, 50));
        onToken(token);
      }
    }

    return fullText || "No response text generated.";
  } catch (error) {
    console.error("Streaming error, falling back:", error);
    try {
      const response = await chatSession.sendMessage({
        message: parts,
      });
      const text = response.text || "No response text generated.";
      const words = text.split(" ");
      for (const word of words) {
        onToken(word + " ");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return text;
    } catch (fallbackError) {
      console.error("Error starting chat:", fallbackError);
      throw fallbackError;
    }
  }
};

export const sendMessage = async (text: string): Promise<string> => {
  if (!chatSession) throw new Error("Chat session not started");

  try {
    const response = await chatSession.sendMessage({
      message: text,
    });

    return response.text || "No response text generated.";
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};
