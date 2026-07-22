export interface ImageResponse {
  base64: string;
  mimeType: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar_base64: string | null;
  avatar_url?: string | null;
}

export interface AppConstants {
  defaultModel: string;
  defaultTheme: string;
  defaultPrompt: string;
  preferencesFileName: string;
  defaultCaptureType: string;
  defaultOcrLanguage: string;
  defaultActiveAccount: string;
}

export interface PlatformEventMap {
  "provider-stream-token":
    | { type: "token"; token: string }
    | { type: "reset" }
    | { type: "tool_status"; message: string }
    | { type: "tool_start"; id: string; name: string; args: Record<string, unknown>; message: string }
    | { type: "tool_end"; id: string; name: string; status: string; result: Record<string, unknown>; message: string };
}
