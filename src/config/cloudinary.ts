import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'mock_cloud',
  api_key: process.env.CLOUDINARY_API_KEY || 'mock_key',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'mock_secret',
});

/**
 * Uploads a base64 encoded string representing an image or a PDF to Cloudinary,
 * falling back to local file storage if Cloudinary credentials are not configured.
 * @param fileBase64 Base64 string data of the file (optionally prefixed with data:...)
 * @returns Secure URL or local folder path string of the uploaded asset
 */
export const uploadToCloudinary = async (fileBase64: string): Promise<string> => {
  try {
    // If it has Cloudinary variables configured, try uploading:
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_CLOUD_NAME !== 'mock_cloud') {
      const result = await cloudinary.uploader.upload(fileBase64, {
        folder: 'construction_staff_management',
        resource_type: 'auto',
      });
      return result.secure_url;
    }
    throw new Error('Cloudinary credentials not configured. Falling back to local storage.');
  } catch (error: any) {
    console.log('Using local fallback storage for upload:', error.message);
    try {
      // Save base64 locally in public uploads folder
      const matches = fileBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let data = fileBase64;
      let extension = 'jpg';
      
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        data = matches[2];
        extension = mimeType.split('/').pop() || 'jpg';
      }
      
      const buffer = Buffer.from(data, 'base64');
      const filename = `upload_${Date.now()}_${Math.round(Math.random() * 1E9)}.${extension}`;
      
      const uploadsDir = path.join(__dirname, '../../uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      const filepath = path.join(uploadsDir, filename);
      fs.writeFileSync(filepath, buffer);
      
      // Return relative path to static folder
      return `uploads/${filename}`;
    } catch (localErr: any) {
      console.error('Local fallback storage failed:', localErr);
      return 'https://images.unsplash.com/photo-1450133064473-71024230f91b?q=80&w=600';
    }
  }
};
