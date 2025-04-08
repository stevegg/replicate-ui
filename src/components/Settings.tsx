import { useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";

interface SettingsProps {
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  onClose: () => void;
}

export function Settings({
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  onClose,
}: SettingsProps) {
  const { toast } = useToast();

  useEffect(() => {
    // Load model from localStorage if available
    const savedModel =
      localStorage.getItem("claude-model") || "claude-3-sonnet-20240229";
    onModelChange(savedModel);
  }, [onModelChange]);

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      toast({
        title: "API Key Required",
        description: "Please enter your Claude API key.",
        variant: "destructive",
      });
      return;
    }

    localStorage.setItem("claude-api-key", apiKey);
    toast({
      title: "API Key Saved",
      description: "Your Claude API key has been saved.",
    });
  };

  const handleModelChange = (value: string) => {
    onModelChange(value);
    localStorage.setItem("claude-model", value);
    toast({
      title: "Model Updated",
      description: `Model changed to ${value.split("-")[2]} ${
        value.split("-")[3] || ""
      }`.trim(),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">Settings</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="api-key">Claude API Key</Label>
          <div className="flex gap-2">
            <Input
              id="api-key"
              type="password"
              placeholder="Enter your Claude API key"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
            />
            <Button onClick={handleSaveApiKey}>Save</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your API key is stored locally and never sent to our servers.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="model-select">Claude Model</Label>
          <Select value={model} onValueChange={handleModelChange}>
            <SelectTrigger id="model-select">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude-3-7-sonnet-20250219">
                Claude 3.7 Sonnet (Recommended)
              </SelectItem>
              <SelectItem value="claude-3-opus-20240229">
                Claude 3 Opus (Highest Quality)
              </SelectItem>
              <SelectItem value="claude-3-haiku-20240307">
                Claude 3 Haiku (Fastest)
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Select the Claude model to use for generating HTML. Claude 3 Sonnet
            offers the best balance of quality and speed.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
