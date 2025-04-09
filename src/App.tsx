import { useState, useEffect, useRef } from 'react';
import { MediaDropzone } from './components/ImageDropzone';
import { Button } from '@/components/ui/button';
import { Settings } from './components/Settings';
import { ResultDisplay } from './components/ResultDisplay';
import { ResizableSplitView } from './components/ResizableSplitView';
import { Loader2, Download, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

function App() {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [model, setModel] = useState<string>('claude-3-sonnet-20240229');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [zipDownloadUrl, setZipDownloadUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [iterationCount, setIterationCount] = useState<number>(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
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
      
      if (data.iterationCount) {
        setIterationCount(data.iterationCount);
      }
      
      if (data.status === 'completed' && data.result) {
        setHtmlContent(data.result.html);
        setZipDownloadUrl(`http://localhost:3000${data.result.zipPath}`);
        setIsLoading(false);
        setIsAnalyzing(false);
        setTaskId(null);
        setProgress(100);
        setRetryCount(0);
        setIsRetrying(false);
        
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
        const errorMessage = data.message || 'An unknown error occurred';
        setError(errorMessage);
        setIsLoading(false);
        setIsAnalyzing(false);
        setTaskId(null);
        
        if (statusCheckInterval.current) {
          clearInterval(statusCheckInterval.current);
          statusCheckInterval.current = null;
        }
        
        // Check if the error is retryable
        const isOverloadedError = errorMessage.includes('overloaded') || 
                                 errorMessage.includes('529');
        const isRateLimitError = errorMessage.includes('rate limit') || 
                                errorMessage.includes('429');
        const isServerError = errorMessage.includes('server error') || 
                             errorMessage.includes('500');
        
        if ((isOverloadedError || isRateLimitError || isServerError) && retryCount < 3) {
          // Show retry option
          toast({
            title: "Error - Claude API Issue",
            description: `${errorMessage}. You can try again with a different model or retry.`,
            variant: "destructive",
            action: (
              <Button 
                onClick={() => handleRetry()} 
                variant="outline" 
                className="bg-white text-red-600 border-red-600 hover:bg-red-50"
              >
                Retry
              </Button>
            ),
          });
        } else {
          toast({
            title: "Error",
            description: errorMessage,
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Error checking task status:', error);
    }
  };

  const handleRetry = () => {
    setError(null);
    setIsRetrying(true);
    setRetryCount(prev => prev + 1);
    
    // Suggest a different model based on retry count
    if (retryCount === 0 && model === 'claude-3-opus-20240229') {
      toast({
        title: "Switching to Claude 3 Sonnet",
        description: "Trying with Claude 3 Sonnet which may have better availability",
      });
      setModel('claude-3-sonnet-20240229');
      setTimeout(() => generateHtml(), 1000);
    } else if (retryCount === 0 && model === 'claude-3-sonnet-20240229') {
      toast({
        title: "Switching to Claude 3 Haiku",
        description: "Trying with Claude 3 Haiku which may have better availability",
      });
      setModel('claude-3-haiku-20240307');
      setTimeout(() => generateHtml(), 1000);
    } else {
      // Just retry with the same model
      setTimeout(() => generateHtml(), 1000);
    }
  };

  const handleMediaUpload = (file: File | null) => {
    if (file) {
      // Determine if it's an image or video
      const isVideo = file.type.startsWith('video/');
      setMediaType(isVideo ? 'video' : 'image');
      
      // Create object URL for preview
      const objectUrl = URL.createObjectURL(file);
      setMediaUrl(objectUrl);
      
      // Reset any previous generation
      setHtmlContent('');
      setZipDownloadUrl('');
      setError(null);
    } else {
      setMediaUrl(null);
      setMediaType(null);
    }
  };

  const generateHtml = async () => {
    if (!mediaUrl) {
      toast({
        title: "No media selected",
        description: "Please upload an image or video first",
        variant: "destructive",
      });
      return;
    }

    if (!apiKey) {
      toast({
        title: "API Key Required",
        description: "Please enter your Claude API key in settings",
        variant: "destructive",
      });
      setShowSettings(true);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setProgress(0);
      setStatusMessage('Preparing to analyze media...');

      // Create a FormData object to send the file
      const formData = new FormData();
      
      // Fetch the file from the URL
      const response = await fetch(mediaUrl);
      const blob = await response.blob();
      
      // Add the file to the FormData
      formData.append('media', blob);
      
      // Add the model to the FormData
      formData.append('model', model);

      // Send the request to the server
      const serverResponse = await fetch('http://localhost:3000/generate-html', {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
        },
        body: formData,
      });

      if (!serverResponse.ok) {
        const errorData = await serverResponse.json();
        throw new Error(errorData.error || 'Failed to generate HTML');
      }

      const data = await serverResponse.json();
      setTaskId(data.taskId);
      setStatusMessage(data.message);
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

  const analyzeAndRefineUI = async () => {
    if (!mediaUrl || !htmlContent) {
      toast({
        title: "Missing content",
        description: "Both media and generated HTML are required for analysis",
        variant: "destructive",
      });
      return;
    }

    if (!apiKey) {
      toast({
        title: "API Key Required",
        description: "Please enter your Claude API key in settings",
        variant: "destructive",
      });
      setShowSettings(true);
      return;
    }

    try {
      setIsAnalyzing(true);
      setProgress(0);
      setStatusMessage('Preparing for analysis...');
      
      // Convert data URL to Blob
      const blob = await fetch(mediaUrl).then(r => r.blob());
      
      // Create FormData
      const formData = new FormData();
      formData.append('media', blob, mediaType === 'video' ? 'media.mp4' : 'media.png');
      formData.append('htmlContent', htmlContent);
      formData.append('model', model);

      // Send the request to the server
      const result = await fetch('http://localhost:3000/analyze-refine', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
        },
        body: formData,
      });

      if (!result.ok) {
        const errorData = await result.json();
        throw new Error(errorData.error || 'Failed to analyze and refine UI');
      }

      const data = await result.json();
      setTaskId(data.taskId);
      setStatusMessage(data.message);
      
      // Start checking task status
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
      }
      
      const intervalId = window.setInterval(checkTaskStatus, 2000);
      statusCheckInterval.current = intervalId;
      
      // Initial check
      await checkTaskStatus();
      
    } catch (error) {
      setIsAnalyzing(false);
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
      // Extract just the ID and filename from the zipDownloadUrl
      const pathMatch = zipDownloadUrl.match(/\/download\/([^\/]+)\/([^\/]+)$/);
      if (pathMatch && pathMatch.length >= 3) {
        const [, id, filename] = pathMatch;
        window.open(`http://localhost:3000/temp/${id}/${filename}`, '_blank');
      }
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
                <h2 className="text-lg font-semibold mb-2">Upload Media</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Upload an image or video of a UI that you want to replicate as HTML.
                </p>
              </div>
              
              <div className="flex-1">
                <MediaDropzone 
                  onMediaUpload={handleMediaUpload} 
                  mediaUrl={mediaUrl}
                  mediaType={mediaType}
                />
              </div>
              
              <div className="mt-4">
                <Button 
                  onClick={generateHtml} 
                  disabled={!mediaUrl || isLoading}
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
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-red-600">
                        <p className="font-medium">Error</p>
                        <p>{error}</p>
                      </div>
                    </div>
                    
                    {(error.includes('overloaded') || error.includes('rate limit') || error.includes('server error')) && (
                      <div className="mt-2 flex justify-end">
                        <Button 
                          onClick={handleRetry} 
                          disabled={isRetrying}
                          size="sm"
                          variant="outline"
                          className="text-sm"
                        >
                          {isRetrying ? (
                            <>
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              Retrying...
                            </>
                          ) : (
                            'Retry with Different Model'
                          )}
                        </Button>
                      </div>
                    )}
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
                            href={(() => {
                              const pathMatch = zipDownloadUrl.match(/\/download\/([^\/]+)\/([^\/]+)$/);
                              if (pathMatch && pathMatch.length >= 3) {
                                const [, id, filename] = pathMatch;
                                return `http://localhost:3000/temp/${id}/${filename}`;
                              }
                              return '#';
                            })()}
                            download
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
                          >
                            Download ZIP
                          </a>
                        )}
                        {mediaUrl && htmlContent && (
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
