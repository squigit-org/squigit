/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

interface ImgBBResponse {
  success: boolean;
  data: {
    url: string;
    delete_url: string;
  };
  error?: {
    message: string;
  };
}

export async function uploadToImgBB(
  base64Image: string,
  apiKey: string
): Promise<string> {
  const cleanBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, "");

  const formData = new FormData();
  formData.append("key", apiKey);
  formData.append("image", cleanBase64);

  const response = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    body: formData,
  });

  const result: ImgBBResponse = await response.json();

  if (!result.success || !result.data.url) {
    throw new Error(result.error?.message || "Failed to upload image to ImgBB");
  }

  return result.data.url;
}

export function generateLensUrl(imageUrl: string): string {
  const params = new URLSearchParams();
  params.append("url", imageUrl);
  params.append("ep", "subb");
  params.append("re", "df");
  params.append("s", "4");
  params.append("hl", "en");
  params.append("gl", "US");

  return `https://lens.google.com/uploadbyurl?${params.toString()}`;
}
