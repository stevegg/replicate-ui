import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Copy, Smartphone, Tablet, Monitor, Laptop } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ResultDisplayProps {
  htmlContent: string;
}

export function ResultDisplay({ htmlContent }: ResultDisplayProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [viewportSize, setViewportSize] = useState<'mobile-sm' | 'mobile' | 'tablet' | 'laptop' | 'desktop'>('desktop');

  useEffect(() => {
    if (previewRef.current && htmlContent) {
      // Create a style element to ensure custom CSS is applied
      const styleEl = document.createElement('style');
      
      // Extract any <style> tags from the HTML content
      const styleMatch = htmlContent.match(/<style>([\s\S]*?)<\/style>/);
      const styleContent = styleMatch ? styleMatch[1] : '';
      
      // Add font imports if needed
      let fontImports = '';
      if (styleContent.includes('font-family') && !styleContent.includes('@import')) {
        fontImports = `
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');
          @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700&display=swap');
          @import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap');
        `;
      }
      
      // Set the style content with font imports
      styleEl.textContent = fontImports + styleContent;
      
      // Clean the HTML content (remove any <style> tags)
      const cleanHtml = htmlContent.replace(/<style>[\s\S]*?<\/style>/, '');
      
      // Set the HTML content
      previewRef.current.innerHTML = '';
      previewRef.current.innerHTML = cleanHtml;
      
      // Append the style element if there was any style content
      if (styleContent || fontImports) {
        previewRef.current.appendChild(styleEl);
      }
    }
  }, [htmlContent]);

  const copyToClipboard = () => {
    if (htmlContent) {
      navigator.clipboard.writeText(htmlContent);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "HTML code copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Device presets with common screen sizes
  const devicePresets = {
    'mobile-sm': { width: '320px', name: 'Small Mobile (320px)' },
    'mobile': { width: '375px', name: 'Mobile (375px)' },
    'tablet': { width: '768px', name: 'Tablet (768px)' },
    'laptop': { width: '1024px', name: 'Laptop (1024px)' },
    'desktop': { width: 'full', name: 'Desktop (Full Width)' }
  };

  // Get the appropriate width based on viewport size
  const getPreviewWidth = () => {
    if (viewportSize === 'desktop') {
      return 'w-full';
    }
    return `w-[${devicePresets[viewportSize].width}]`;
  };

  return (
    <Card className="h-full">
      <Tabs defaultValue="preview" className="h-full flex flex-col">
        <div className="px-4 pt-4 flex justify-between items-center">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="code">HTML Code</TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-2">
            {htmlContent && (
              <>
                <div className="flex border rounded-md overflow-hidden">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant={viewportSize === 'mobile-sm' ? 'default' : 'ghost'} 
                          size="sm"
                          onClick={() => setViewportSize('mobile-sm')}
                          className="px-2 h-8"
                        >
                          <Smartphone className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Small Mobile (320px)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant={viewportSize === 'mobile' ? 'default' : 'ghost'} 
                          size="sm"
                          onClick={() => setViewportSize('mobile')}
                          className="px-2 h-8"
                        >
                          <Smartphone className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Mobile (375px)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant={viewportSize === 'tablet' ? 'default' : 'ghost'} 
                          size="sm"
                          onClick={() => setViewportSize('tablet')}
                          className="px-2 h-8"
                        >
                          <Tablet className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Tablet (768px)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant={viewportSize === 'laptop' ? 'default' : 'ghost'} 
                          size="sm"
                          onClick={() => setViewportSize('laptop')}
                          className="px-2 h-8"
                        >
                          <Laptop className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Laptop (1024px)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant={viewportSize === 'desktop' ? 'default' : 'ghost'} 
                          size="sm"
                          onClick={() => setViewportSize('desktop')}
                          className="px-2 h-8"
                        >
                          <Monitor className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Desktop (Full Width)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={copyToClipboard}
                  className="flex items-center gap-1 h-8"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </>
            )}
          </div>
        </div>
        
        <CardContent className="flex-1 overflow-auto pt-2">
          <TabsContent value="preview" className="h-full mt-0">
            {htmlContent ? (
              <div className="flex justify-center border rounded-md p-4 min-h-[200px] bg-white overflow-auto">
                <div 
                  ref={previewRef} 
                  className={`${getPreviewWidth()} h-full transition-all duration-300 ease-in-out`}
                  style={{
                    boxShadow: viewportSize !== 'desktop' ? '0 0 10px rgba(0, 0, 0, 0.1)' : 'none',
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Generate HTML to see a preview
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="code" className="h-full mt-0">
            {htmlContent ? (
              <pre className="border rounded-md p-4 overflow-auto h-full text-sm bg-gray-50">
                <code>{htmlContent}</code>
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Generate HTML to see the code
              </div>
            )}
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
