/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, imgbb } from "@/lib";

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

/**
 * Uploads a base64 encoded image to ImgBB and returns the hosted URL.
 * @param base64Image - The base64 string of the image
 * @param apiKey - The ImgBB API key
 * @returns The public URL of the uploaded image
 */
export async function uploadToImgBB(
  base64Image: string,
  apiKey: string,
): Promise<string> {
  const cleanBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, "");

  const formData = new FormData();
  formData.append("key", apiKey);
  formData.append("image", cleanBase64);

  const response = await fetch(imgbb.upload, {
    method: "POST",
    body: formData,
  });

  const result: ImgBBResponse = await response.json();

  if (!result.success || !result.data.url) {
    throw new Error(result.error?.message || "Failed to upload image to ImgBB");
  }

  return result.data.url;
}

/**
 * Generates a Google Lens search URL for the given image URL.
 * @param imageUrl - The public URL of the image
 * @returns The full Google Lens URL
 */
export function generateLensUrl(imageUrl: string): string {
  const params = new URLSearchParams();
  params.append("url", imageUrl);
  params.append("ep", "subb");
  params.append("re", "df");
  params.append("s", "4");
  params.append("hl", "en");
  params.append("gl", "US");

  return `${google.lens}/uploadbyurl?${params.toString()}`;
}
