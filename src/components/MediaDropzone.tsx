import { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Image, Video, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MediaDropzoneProps {
  onMediaUpload: (file: File | null, type: 'image' | 'video') => void;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
}

export function MediaDropzone({ onMediaUpload, mediaUrl, mediaType }: MediaDropzoneProps) {
  const [activeTab, setActiveTab] = useState<'image' | 'video'>(mediaType || 'image');
  const { toast } = useToast();

  // Update active tab when mediaType changes
  useEffect(() => {
    if (mediaType) {
      setActiveTab(mediaType);
    }
  }, [mediaType]);

  const handleFile = useCallback((file: File) => {
    // Validate file size
    const maxSize = activeTab === 'image' ? 5 * 1024 * 1024 : 50 * 1024 * 1024; // 5MB for images, 50MB for videos
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: `Please upload a ${activeTab} smaller than ${maxSize / (1024 * 1024)}MB`,
        variant: "destructive",
      });
      return;
    }
    
    // Check file type
    const isImageFile = file.type.startsWith('image/');
    const isVideoFile = file.type.startsWith('video/');
    
    console.log('File details:', {
      name: file.name,
      type: file.type,
      size: file.size,
      isImageFile,
      isVideoFile,
      activeTab
    });
    
    if ((activeTab === 'image' && !isImageFile) || (activeTab === 'video' && !isVideoFile)) {
      toast({
        title: "Invalid file type",
        description: `Please upload a ${activeTab} file when in ${activeTab} mode`,
        variant: "destructive",
      });
      return;
    }
    
    // Pass the file to parent component
    onMediaUpload(file, activeTab);
  }, [activeTab, onMediaUpload, toast]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      handleFile(acceptedFiles[0]);
    }
  }, [handleFile]);

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop,
    accept: activeTab === 'image' 
      ? { 'image/*': [] }
      : { 'video/*': [] },
    maxFiles: 1,
    noClick: true, // Disable click behavior, we'll handle it manually
  });

  const handleTabChange = (value: string) => {
    setActiveTab(value as 'image' | 'video');
    // Clear preview when switching tabs
    onMediaUpload(null, value as 'image' | 'video');
  };

  const handleClearMedia = () => {
    onMediaUpload(null, activeTab);
  };

  return (
    <div className="w-full">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-4">
        <TabsList className="grid grid-cols-2">
          <TabsTrigger value="image" className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            Image
          </TabsTrigger>
          <TabsTrigger value="video" className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            Video
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {!mediaUrl ? (
        <Card 
          {...getRootProps()} 
          className="border-dashed cursor-pointer hover:border-primary transition-colors"
        >
          <CardContent className="flex flex-col items-center justify-center py-12">
            <input {...getInputProps()} />
            <div className="mb-4 p-3 rounded-full bg-muted">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Drag & drop a{activeTab === 'image' ? 'n' : ''} {activeTab} here
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              or
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={open}
            >
              Select {activeTab === 'image' ? 'Image' : 'Video'}
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              {activeTab === 'image' 
                ? 'Supported formats: JPG, PNG, GIF (max 5MB)'
                : 'Supported formats: MP4, WebM, MOV (max 50MB)'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {mediaType === 'image' ? (
            <img 
              src={mediaUrl} 
              alt="Preview" 
              className="w-full rounded-md object-contain max-h-[500px]"
            />
          ) : (
            <video 
              src={mediaUrl} 
              controls
              className="w-full rounded-md object-contain max-h-[500px]"
            />
          )}
          <div className="absolute top-2 right-2 flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-background/80 backdrop-blur-sm"
              onClick={handleClearMedia}
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-background/80 backdrop-blur-sm"
              onClick={open}
            >
              Change {activeTab === 'image' ? 'Image' : 'Video'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
