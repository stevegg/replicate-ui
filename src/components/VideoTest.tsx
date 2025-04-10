import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';

export function VideoTest() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      console.log('Video dropped:', file.name, file.type, file.size);
      
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
    }
  }, []);

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop,
    accept: { 'video/*': [] },
    maxFiles: 1,
    noClick: false,
  });

  return (
    <div className="p-4 border rounded-md">
      <h2 className="text-xl font-bold mb-4">Video Upload Test</h2>
      
      <div 
        {...getRootProps()} 
        className="border-2 border-dashed border-gray-300 p-6 rounded-md cursor-pointer hover:border-blue-500 mb-4"
      >
        <input {...getInputProps()} />
        <p className="text-center">Drag and drop a video here, or click to select</p>
        <div className="flex justify-center mt-2">
          <Button onClick={(e) => {
            e.stopPropagation();
            open();
          }}>
            Select Video
          </Button>
        </div>
      </div>
      
      {videoUrl && (
        <div className="mt-4">
          <h3 className="font-semibold mb-2">Video Preview:</h3>
          <video 
            src={videoUrl} 
            controls 
            className="w-full max-h-[300px] rounded-md"
          />
          <p className="mt-2">
            <strong>Name:</strong> {videoFile?.name}<br />
            <strong>Type:</strong> {videoFile?.type}<br />
            <strong>Size:</strong> {videoFile?.size} bytes
          </p>
        </div>
      )}
    </div>
  );
}
