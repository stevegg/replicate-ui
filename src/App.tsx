import { useState, useEffect, useRef } from 'react';
import { ImageDropzone } from './components/ImageDropzone';
import { Button } from '@/components/ui/button';
import { Settings } from './components/Settings';
import { ResultDisplay } from './components/ResultDisplay';
import { ResizableSplitView } from './components/ResizableSplitView';
import { Loader2, Download, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [model, setModel] = useState<string>('claude-3-sonnet-20240229');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [zipDownloadUrl, setZipDownloadUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [iterationCount, setIterationCount] = useState<number>(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const statusCheckInterval = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const savedApiKey = localStorage.getItem('claude-api-key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
    
    const savedModel = localStorage.getItem('claude-model');
    if (savedModel) {
      setModel(savedModel);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (taskId && isLoading) {
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
      }

      const intervalId = window.setInterval(checkTaskStatus, 2000);
      statusCheckInterval.current = intervalId;

      checkTaskStatus();

      return () => {
        clearInterval(intervalId);
        statusCheckInterval.current = null;
      };
    }
  }, [taskId, isLoading]);

  const checkTaskStatus = async () => {
    if (!taskId) return;

    try {
      const response = await fetch(`http://localhost:3000/task-status/${taskId}`);
      
      if (!response.ok) {
        throw new Error('Failed to check task status');
      }
      
      const data = await response.json();
      
      setProgress(data.progress);
      setStatusMessage(data.message);
      
      if (data.estimatedRemainingSeconds) {
        setEstimatedTimeRemaining(data.estimatedRemainingSeconds);
      }
      
      if (data.status === 'completed' && data.result) {
        setHtmlContent(data.result.html);
        setZipDownloadUrl(`http://localhost:3000${data.result.zipPath}`);
        setIsLoading(false);
        setTaskId(null);
        setProgress(100);
        
        if (statusCheckInterval.current) {
          clearInterval(statusCheckInterval.current);
          statusCheckInterval.current = null;
        }
        
        toast({
          title: "Success",
          description: "HTML generated successfully",
        });
      }
      
      if (data.status === 'error') {
        setError(data.message);
        setIsLoading(false);
        setTaskId(null);
        
        if (statusCheckInterval.current) {
          clearInterval(statusCheckInterval.current);
          statusCheckInterval.current = null;
        }
        
        toast({
          title: "Error",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error checking task status:', error);
    }
  };

  const handleImageUpload = (file: File | null) => {
    if (!file) {
      setImageUrl(null);
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const generateHtml = async () => {
    if (!imageUrl) {
      toast({
        title: "Error",
        description: "Please upload an image first",
        variant: "destructive",
      });
      return;
    }

    if (!apiKey) {
      toast({
        title: "Error",
        description: "Please enter your Claude API key in settings",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    setHtmlContent('');
    setZipDownloadUrl('');
    setProgress(0);
    setStatusMessage('Starting image analysis...');
    setEstimatedTimeRemaining(null);

    try {
      const formData = new FormData();
      
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], "image.jpg", { type: blob.type });
      
      formData.append('image', file);
      formData.append('model', model);

      const result = await fetch('http://localhost:3000/generate-html', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
        },
        body: formData,
      });

      if (!result.ok) {
        const errorData = await result.json();
        throw new Error(errorData.error || 'Failed to generate HTML');
      }

      const data = await result.json();
      setTaskId(data.taskId);
    } catch (error) {
      setIsLoading(false);
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: "destructive",
      });
    }
  };

  const handleDownloadZip = () => {
    if (zipDownloadUrl) {
      window.open(zipDownloadUrl, '_blank');
    }
  };

  const formatTimeRemaining = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds} seconds`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes} minute${minutes > 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
    }
  };

  const analyzeAndRefineUI = async () => {
    if (!imageUrl || !htmlContent) {
      toast({
        title: "Error",
        description: "Both image and generated HTML are required for analysis.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);
    setStatusMessage('Starting analysis...');

    try {
      // Convert data URL to Blob
      const blob = await fetch(imageUrl).then(r => r.blob());
      
      // Create FormData
      const formData = new FormData();
      formData.append('image', blob, 'image.png');
      formData.append('htmlContent', htmlContent);
      formData.append('model', model);

      // Send request to server
      const response = await fetch('http://localhost:3001/analyze-and-refine', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
        },
        body: formData,
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setTaskId(data.taskId);
      setTaskStatus('processing');
      
      // Poll for task status
      const intervalId = setInterval(async () => {
        const statusResponse = await fetch(`http://localhost:3001/task-status/${data.taskId}`);
        const statusData = await statusResponse.json();
        
        setTaskStatus(statusData.status);
        setProgress(statusData.progress);
        setStatusMessage(statusData.message);
        
        if (statusData.status === 'completed') {
          clearInterval(intervalId);
          setHtmlContent(statusData.result.html);
          setZipDownloadUrl(statusData.result.zipPath);
          setIsAnalyzing(false);
          setIterationCount(statusData.result.iterationCount);
          
          toast({
            title: "Analysis Complete",
            description: `UI refined after ${statusData.result.iterationCount} iterations.`,
          });
        } else if (statusData.status === 'error') {
          clearInterval(intervalId);
          setIsAnalyzing(false);
          
          toast({
            title: "Error",
            description: statusData.message,
            variant: "destructive",
          });
        }
      }, 1000);
    } catch (error) {
      setIsAnalyzing(false);
      
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred during analysis",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-white border-b px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold">UI Replicator</h1>
        <div className="flex items-center gap-2">
          {htmlContent && zipDownloadUrl && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleDownloadZip}
              className="flex items-center gap-1"
            >
              <Download className="h-4 w-4" />
              Download as ZIP
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowSettings(!showSettings)}
          >
            Settings
          </Button>
        </div>
      </header>

      {showSettings && (
        <div className="p-4 bg-white border-b">
          <Settings 
            apiKey={apiKey} 
            onApiKeyChange={(key) => {
              setApiKey(key);
              localStorage.setItem('claude-api-key', key);
            }}
            model={model}
            onModelChange={(model) => {
              setModel(model);
              localStorage.setItem('claude-model', model);
            }}
            onClose={() => setShowSettings(false)}
          />
        </div>
      )}

      <main className="flex-1 p-4">
        <ResizableSplitView
          leftPane={
            <div className="h-full flex flex-col">
              <div className="mb-4">
                <h2 className="text-lg font-semibold mb-2">Upload UI Image</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Upload an image of a UI that you want to replicate as HTML.
                </p>
              </div>
              
              <div className="flex-1">
                <ImageDropzone 
                  onImageUpload={handleImageUpload} 
                  imageUrl={imageUrl}
                />
              </div>
              
              <div className="mt-4">
                <Button 
                  onClick={generateHtml} 
                  disabled={isLoading || !imageUrl || !apiKey}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate HTML'
                  )}
                </Button>
                
                {isLoading && (
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>{statusMessage}</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    {estimatedTimeRemaining !== null && (
                      <p className="text-xs text-gray-500 text-center">
                        Estimated time remaining: {formatTimeRemaining(estimatedTimeRemaining)}
                      </p>
                    )}
                  </div>
                )}
                
                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-red-600">
                      <p className="font-medium">Error</p>
                      <p>{error}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          }
          rightPane={
            <div className="h-full flex flex-col">
              <div className="mb-4">
                <h2 className="text-lg font-semibold mb-2">Generated Result</h2>
                <p className="text-sm text-gray-500 mb-4">
                  The generated HTML will appear here.
                </p>
              </div>
              
              <div className="flex-1">
                <ResultDisplay htmlContent={htmlContent} />
              </div>
              <div className="flex flex-col gap-4 items-center justify-center w-full">
                {htmlContent && (
                  <div className="flex flex-col gap-4 w-full">
                    <div className="flex flex-row gap-2 justify-between items-center">
                      <h2 className="text-2xl font-bold">Generated HTML</h2>
                      <div className="flex gap-2">
                        {zipDownloadUrl && (
                          <a
                            href={`http://localhost:3001${zipDownloadUrl}`}
                            download
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
                          >
                            Download ZIP
                          </a>
                        )}
                        {imageUrl && htmlContent && (
                          <Button
                            onClick={analyzeAndRefineUI}
                            disabled={isAnalyzing}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {isAnalyzing ? 'Analyzing...' : 'Analyze & Refine UI'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          }
        />
      </main>
      {(isLoading || isAnalyzing) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">
              {isAnalyzing ? 'Analyzing and Refining UI' : 'Generating HTML'}
            </h3>
            <div className="mb-4">
              <Progress value={progress} className="h-2" />
            </div>
            <p className="text-sm text-gray-600">{statusMessage}</p>
            {isAnalyzing && iterationCount > 0 && (
              <p className="text-sm text-gray-600 mt-2">Iterations completed: {iterationCount}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
