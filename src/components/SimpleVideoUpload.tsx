import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface SimpleVideoUploadProps {
  onVideoSelected: (file: File) => void;
}

export function SimpleVideoUpload({ onVideoSelected }: SimpleVideoUploadProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      console.log('Video dropped:', file.name, file.type, file.size);
      
      if (file.type.startsWith('video/')) {
        setVideoUrl(URL.createObjectURL(file));
        onVideoSelected(file);
      } else {
        console.error('Not a video file:', file.type);
        alert('Please upload a video file');
      }
    }
  }, [onVideoSelected]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': []
    },
    maxFiles: 1
  });

  return (
    <div className="w-full p-4">
      <h2 className="text-xl font-bold mb-4">Video Upload</h2>
      
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed p-6 rounded-lg cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
        }`}
      >
        <input {...getInputProps()} />
        
        {isDragActive ? (
          <p className="text-center text-blue-500">Drop the video here...</p>
        ) : (
          <div className="text-center">
            <p className="mb-2">Drag and drop a video here, or click to select</p>
            <p className="text-sm text-gray-500">Supported formats: MP4, WebM, MOV (max 50MB)</p>
          </div>
        )}
      </div>
      
      {videoUrl && (
        <div className="mt-4">
          <h3 className="font-medium mb-2">Preview:</h3>
          <video 
            src={videoUrl} 
            controls 
            className="w-full rounded-lg max-h-[300px] object-contain"
          />
        </div>
      )}
    </div>
  );
}
