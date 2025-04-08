import { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ImageDropzoneProps {
  onImageUpload: (file: File | null) => void;
  imageUrl: string | null;
}

export function ImageDropzone({ onImageUpload, imageUrl }: ImageDropzoneProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(imageUrl);
  const { toast } = useToast();

  useEffect(() => {
    setPreviewUrl(imageUrl);
  }, [imageUrl]);

  const handleFile = useCallback((file: File) => {
    // Validate file size
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }
    
    // Set preview
    setPreviewUrl(URL.createObjectURL(file));
    
    // Pass the file to parent component
    onImageUpload(file);
  }, [onImageUpload, toast]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      handleFile(acceptedFiles[0]);
    }
  }, [handleFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': []
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
              {isDragActive ? 'Drop the image here' : 'Drag & drop an image here'}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              or click to select
            </p>
            <Button variant="outline" size="sm">
              Select Image
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          <img 
            src={previewUrl} 
            alt="Preview" 
            className="w-full rounded-md object-contain max-h-[500px]"
          />
          <Button 
            variant="outline" 
            size="sm" 
            className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewUrl(null);
              // Pass empty string instead of null when clearing
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (files && files.length > 0) {
                  handleFile(files[0]);
                }
              };
              input.click();
            }}
          >
            Change Image
          </Button>
        </div>
      )}
    </div>
  );
}
