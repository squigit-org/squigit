pub struct GeminiClient {
    api_key: String,
}

impl GeminiClient {
    pub fn new(api_key: String) -> Self {
        Self { api_key }
    }

    pub async fn analyze_image(&self, image_data: &[u8]) -> Result<String, anyhow::Error> {
        // TODO: Implement actual HTTP call to Google here
        // This keeps the API key safe in Rust memory, never sending it to the WebView.
        Ok("This is a placeholder for the AI response.".to_string())
    }
}
