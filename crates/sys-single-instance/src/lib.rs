use anyhow::Result;
use image::DynamicImage;

pub fn optimize_for_ai(image_data: &[u8]) -> Result<Vec<u8>> {
    // 1. Load image
    let img = image::load_from_memory(image_data)?;
    
    // 2. Resize if too large (saving tokens/bandwidth)
    let resized = img.resize(1024, 1024, image::imageops::FilterType::Lanczos3);
    
    // 3. Convert back to bytes (e.g., JPEG)
    let mut output = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut output);
    resized.write_to(&mut cursor, image::ImageOutputFormat::Jpeg(80))?;
    
    Ok(output)
}
