/**
 * 上传图片到 Cloudinary
 * @param file - 要上传的图片文件
 * @returns
 */
async function uploadImgToCloud(file: File) {
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('Please use a JPG, PNG, GIF, WebP, or AVIF image under 10 MB');
  }
  // 获取签名
  const signResponse = await fetch('/api/cloudinary/cloudinary-sign', { method: 'POST' });
  const signed = await signResponse.json();
  if (!signResponse.ok) throw new Error(signed.error || 'Image upload is unavailable');
  const { signature, timestamp, public_id, overwrite, allowed_formats, cloudName, apiKey } = signed;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('timestamp', timestamp);
  formData.append('signature', signature);
  formData.append('api_key', apiKey);
  formData.append('public_id', public_id);
  formData.append('overwrite', String(overwrite));
  formData.append('allowed_formats', allowed_formats);

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (response.ok && result.secure_url) {
      return Promise.resolve(result); // 返回包含图片信息的对象
    } else {
      throw new Error('Image upload failed');
    }
  } catch (error) {
    throw error;
  }
}

/**
 * 删除coludinary上的图片
 */
async function deleteImgFromCloud(publicId: string): Promise<boolean> {
  try {
    // 获取签名
    const signResponse = await fetch(
      '/api/cloudinary/cloudinary-sign-destroy',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId }),
      }
    );
    const signed = await signResponse.json();
    if (!signResponse.ok) throw new Error(signed.error || 'Image deletion is unavailable');
    const { signature, timestamp, cloudName, apiKey } = signed;

    // 调用 Destroy API - 使用 form-urlencoded 格式
    const formData = new URLSearchParams();
    formData.append('invalidate', 'true');
    formData.append('public_id', publicId);
    formData.append('timestamp', timestamp.toString());
    formData.append('api_key', apiKey);
    formData.append('signature', signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const data: {
      result?: string;
      error?: string;
    } = await response.json();
    
    if (response.ok && data.result === 'ok') {
      return true;
    } else {
      throw new Error(data.error || `删除失败: ${data.result || 'unknown error'}`);
    }
  } catch (error) {
    return false;
  }
}

export { uploadImgToCloud, deleteImgFromCloud };
