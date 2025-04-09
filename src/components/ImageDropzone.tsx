import { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Video, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MediaDropzoneProps {
  onMediaUpload: (file: File | null) => void;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
}

export function MediaDropzone({ onMediaUpload, mediaUrl, mediaType }: MediaDropzoneProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(mediaUrl);
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video' | null>(mediaType);
  const { toast } = useToast();

  useEffect(() => {
    setPreviewUrl(mediaUrl);
    setSelectedMediaType(mediaType);
  }, [mediaUrl, mediaType]);

  const handleFile = useCallback((file: File) => {
    // Determine file type
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    
    if (!isVideo && !isImage) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image or video file",
        variant: "destructive",
      });
      return;
    }
    
    // Validate file size (50MB for videos, 5MB for images)
    const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: `Please upload a ${isVideo ? 'video' : 'image'} smaller than ${isVideo ? '50MB' : '5MB'}`,
        variant: "destructive",
      });
      return;
    }
    
    // Set preview
    setPreviewUrl(URL.createObjectURL(file));
    setSelectedMediaType(isVideo ? 'video' : 'image');
    
    // Pass the file to parent component
    onMediaUpload(file);
  }, [onMediaUpload, toast]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      handleFile(acceptedFiles[0]);
    }
  }, [handleFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': [],
      'video/*': []
    },
    maxFiles: 1
  });

  return (
    <div className="w-full">
      {!previewUrl ? (
        <Card 
          {...getRootProps()} 
          className={`border-dashed cursor-pointer ${isDragActive ? 'border-primary' : 'border-border'} hover:border-primary transition-colors`}
        >
          <CardContent className="flex flex-col items-center justify-center py-12">
            <input {...getInputProps()} />
            <div className="mb-4 p-3 rounded-full bg-muted">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {isDragActive ? 'Drop the file here' : 'Drag & drop an image or video here'}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              or click to select
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                Select File
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Supports images (up to 5MB) and videos (up to 50MB)
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {selectedMediaType === 'image' ? (
            <img 
              src={previewUrl} 
              alt="Preview" 
              className="w-full rounded-md object-contain max-h-[500px]"
            />
          ) : (
            <video 
              src={previewUrl} 
              controls
              className="w-full rounded-md object-contain max-h-[500px]"
            />
          )}
          <div className="absolute top-2 right-2 flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-background/80 backdrop-blur-sm"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewUrl(null);
                setSelectedMediaType(null);
                onMediaUpload(null);
              }}
            >
              Clear
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-background/80 backdrop-blur-sm"
              onClick={(e) => {
                e.stopPropagation();
                // Create file input
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*,video/*';
                input.onchange = (e) => {
                  const files = (e.target as HTMLInputElement).files;
                  if (files && files.length > 0) {
                    handleFile(files[0]);
                  }
                };
                input.click();
              }}
            >
              Change File
            </Button>
          </div>
          <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md flex items-center gap-1">
            {selectedMediaType === 'image' ? (
              <>
                <ImageIcon className="h-4 w-4" />
                <span className="text-xs">Image</span>
              </>
            ) : (
              <>
                <Video className="h-4 w-4" />
                <span className="text-xs">Video</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// For backward compatibility
export { MediaDropzone as ImageDropzone };
