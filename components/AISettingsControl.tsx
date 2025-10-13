import React, { useState, useEffect } from 'react';
import { AISettings, AIProvider, AIModelInfo } from '../types';
import { fetchAvailableModels } from '../services/aiService';

interface AISettingsControlProps {
  aiSettings: AISettings;
  setAiSettings: (settings: AISettings) => void;
}

export const AISettingsControl: React.FC<AISettingsControlProps> = ({
  aiSettings,
  setAiSettings,
}) => {
  // Local state for UI controls
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [loadingModels, setLoadingModels] = useState<AIProvider | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [customModelInput, setCustomModelInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const activeConfig = aiSettings.providers[aiSettings.activeProvider];

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('aiSettings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        setAiSettings(parsed);
      }
    } catch (error) {
      console.error('Error loading AI settings from localStorage:', error);
    }
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('aiSettings', JSON.stringify(aiSettings));
    } catch (error) {
      console.error('Error saving AI settings to localStorage:', error);
    }
  }, [aiSettings]);

  // Automatically fetch models when API key is entered
  const handleApiKeyChange = async (provider: AIProvider, apiKey: string) => {
    // Update the API key in settings
    setAiSettings({
      ...aiSettings,
      providers: {
        ...aiSettings.providers,
        [provider]: {
          ...aiSettings.providers[provider],
          apiKey,
        },
      },
    });

    // Clear previous errors
    setModelError(null);
    setValidationErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[`${provider}_apiKey`];
      return newErrors;
    });

    // Fetch models if API key is valid
    if (apiKey.trim().length > 0) {
      setLoadingModels(provider);
      try {
        const models = await fetchAvailableModels(provider, apiKey);
        setAiSettings({
          ...aiSettings,
          providers: {
            ...aiSettings.providers,
            [provider]: {
              ...aiSettings.providers[provider],
              apiKey,
              availableModels: models,
              // Auto-select first model if none selected
              selectedModel: aiSettings.providers[provider].selectedModel || models[0]?.id || '',
            },
          },
        });
      } catch (error) {
        console.error(`Error fetching ${provider} models:`, error);
        setModelError(`Failed to fetch models for ${provider}. Please check your API key.`);
      } finally {
        setLoadingModels(null);
      }
    }
  };

  // Handle provider selection
  const handleProviderChange = (provider: AIProvider) => {
    setAiSettings({
      ...aiSettings,
      activeProvider: provider,
    });
    setShowCustomInput(false);
    setCustomModelInput('');
    setValidationErrors({});
  };

  // Handle model selection
  const handleModelChange = (modelId: string) => {
    if (modelId === '__custom__') {
      setShowCustomInput(true);
      return;
    }

    setShowCustomInput(false);
    setCustomModelInput('');
    setAiSettings({
      ...aiSettings,
      providers: {
        ...aiSettings.providers,
        [aiSettings.activeProvider]: {
          ...activeConfig,
          selectedModel: modelId,
        },
      },
    });

    setValidationErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors.model;
      return newErrors;
    });
  };

  // Handle custom model entry
  const handleCustomModelSubmit = () => {
    if (!customModelInput.trim()) {
      setValidationErrors((prev) => ({ ...prev, customModel: 'Model ID is required' }));
      return;
    }

    const customModel: AIModelInfo = {
      id: customModelInput.trim(),
      name: `Custom: ${customModelInput.trim()}`,
      provider: aiSettings.activeProvider,
      isCustom: true,
    };

    setAiSettings({
      ...aiSettings,
      providers: {
        ...aiSettings.providers,
        [aiSettings.activeProvider]: {
          ...activeConfig,
          selectedModel: customModel.id,
          availableModels: [...activeConfig.availableModels, customModel],
        },
      },
    });

    setShowCustomInput(false);
    setCustomModelInput('');
    setValidationErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors.customModel;
      return newErrors;
    });
  };

  // Validate settings
  const validateSettings = (): boolean => {
    const errors: Record<string, string> = {};

    if (!activeConfig.apiKey) {
      errors[`${aiSettings.activeProvider}_apiKey`] = 'API key is required';
    }

    if (!activeConfig.selectedModel && !showCustomInput) {
      errors.model = 'Model selection is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border">
      <h3 className="text-xl font-semibold mb-4">AI Settings</h3>
      <div className="space-y-6">
        {/* API Key Management Section */}
        <div className="border-b pb-4">
          <h4 className="text-lg font-medium mb-3 text-gray-800">API Keys</h4>
          
          {/* Gemini API Key */}
          <div className="mb-4">
            <label htmlFor="gemini-api-key" className="block text-sm font-medium text-gray-700 mb-1">
              Gemini API Key
            </label>
            <div className="relative">
              <input
                id="gemini-api-key"
                type={showGeminiKey ? 'text' : 'password'}
                value={aiSettings.providers[AIProvider.GEMINI].apiKey}
                onChange={(e) => handleApiKeyChange(AIProvider.GEMINI, e.target.value)}
                placeholder="Enter your Gemini API key"
                className={`w-full px-3 py-2 text-sm border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 pr-10 ${
                  validationErrors[`${AIProvider.GEMINI}_apiKey`] ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 text-xs"
              >
                {showGeminiKey ? '🙈 Hide' : '👁️ Show'}
              </button>
            </div>
            {validationErrors[`${AIProvider.GEMINI}_apiKey`] && (
              <p className="text-red-500 text-xs mt-1">{validationErrors[`${AIProvider.GEMINI}_apiKey`]}</p>
            )}
            {loadingModels === AIProvider.GEMINI && (
              <p className="text-blue-500 text-xs mt-1">Fetching Gemini models...</p>
            )}
          </div>

          {/* Anthropic API Key */}
          <div>
            <label htmlFor="anthropic-api-key" className="block text-sm font-medium text-gray-700 mb-1">
              Anthropic API Key
            </label>
            <div className="relative">
              <input
                id="anthropic-api-key"
                type={showAnthropicKey ? 'text' : 'password'}
                value={aiSettings.providers[AIProvider.ANTHROPIC].apiKey}
                onChange={(e) => handleApiKeyChange(AIProvider.ANTHROPIC, e.target.value)}
                placeholder="Enter your Anthropic API key"
                className={`w-full px-3 py-2 text-sm border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 pr-10 ${
                  validationErrors[`${AIProvider.ANTHROPIC}_apiKey`] ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 text-xs"
              >
                {showAnthropicKey ? '🙈 Hide' : '👁️ Show'}
              </button>
            </div>
            {validationErrors[`${AIProvider.ANTHROPIC}_apiKey`] && (
              <p className="text-red-500 text-xs mt-1">{validationErrors[`${AIProvider.ANTHROPIC}_apiKey`]}</p>
            )}
            {loadingModels === AIProvider.ANTHROPIC && (
              <p className="text-blue-500 text-xs mt-1">Fetching Anthropic models...</p>
            )}
          </div>

          {modelError && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
              {modelError}
            </div>
          )}
        </div>

        {/* Provider Selection */}
        <div className="border-b pb-4">
          <h4 className="text-lg font-medium mb-3 text-gray-800">Active Provider</h4>
          <div className="flex gap-3">
            <button
              onClick={() => handleProviderChange(AIProvider.GEMINI)}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                aiSettings.activeProvider === AIProvider.GEMINI
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              <div className="text-sm">Google Gemini</div>
              {aiSettings.activeProvider === AIProvider.GEMINI && (
                <div className="text-xs mt-1 text-blue-600">✓ Active</div>
              )}
            </button>
            <button
              onClick={() => handleProviderChange(AIProvider.ANTHROPIC)}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                aiSettings.activeProvider === AIProvider.ANTHROPIC
                  ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              <div className="text-sm">Anthropic Claude</div>
              {aiSettings.activeProvider === AIProvider.ANTHROPIC && (
                <div className="text-xs mt-1 text-purple-600">✓ Active</div>
              )}
            </button>
          </div>
        </div>

        {/* Model Selection */}
        <div className="border-b pb-4">
          <h4 className="text-lg font-medium mb-3 text-gray-800">Model Selection</h4>
          
          <div className="mb-3">
            <label htmlFor="model-select" className="block text-sm font-medium text-gray-700 mb-1">
              {aiSettings.activeProvider === AIProvider.GEMINI ? 'Gemini' : 'Anthropic'} Model
            </label>
            <select
              id="model-select"
              value={showCustomInput ? '__custom__' : activeConfig.selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={!activeConfig.apiKey || loadingModels === aiSettings.activeProvider}
              className={`w-full px-3 py-2 text-sm border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                validationErrors.model ? 'border-red-500' : 'border-gray-300'
              } ${!activeConfig.apiKey ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            >
              <option value="">
                {!activeConfig.apiKey
                  ? 'Enter API key first'
                  : activeConfig.availableModels.length === 0
                  ? 'No models available'
                  : 'Select a model'}
              </option>
              {activeConfig.availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} {model.isCustom ? '(Custom)' : ''}
                </option>
              ))}
              <option value="__custom__">➕ Custom/Manual Entry</option>
            </select>
            {validationErrors.model && (
              <p className="text-red-500 text-xs mt-1">{validationErrors.model}</p>
            )}
            {!activeConfig.apiKey && (
              <p className="text-gray-500 text-xs mt-1">Enter an API key to load available models</p>
            )}
          </div>

          {/* Custom Model Input */}
          {showCustomInput && (
            <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
              <label htmlFor="custom-model" className="block text-sm font-medium text-gray-700 mb-1">
                Custom Model ID
              </label>
              <div className="flex gap-2">
                <input
                  id="custom-model"
                  type="text"
                  value={customModelInput}
                  onChange={(e) => setCustomModelInput(e.target.value)}
                  placeholder="e.g., gemini-2.0-pro-exp"
                  className={`flex-1 px-3 py-2 text-sm border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                    validationErrors.customModel ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <button
                  onClick={handleCustomModelSubmit}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowCustomInput(false);
                    setCustomModelInput('');
                    setValidationErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors.customModel;
                      return newErrors;
                    });
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {validationErrors.customModel && (
                <p className="text-red-500 text-xs mt-1">{validationErrors.customModel}</p>
              )}
              <p className="text-gray-600 text-xs mt-2">
                Enter the exact model ID as specified by the provider's API documentation.
              </p>
            </div>
          )}

          {/* Current Selection Display */}
          {activeConfig.selectedModel && !showCustomInput && (
            <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded">
              <p className="text-green-800 text-xs">
                <span className="font-semibold">Currently selected:</span>{' '}
                {activeConfig.availableModels.find((m) => m.id === activeConfig.selectedModel)?.name ||
                  activeConfig.selectedModel}
              </p>
            </div>
          )}
        </div>

        {/* Existing Settings */}
        <div>
          <h4 className="text-lg font-medium mb-3 text-gray-800">Request Settings</h4>
          
          <div className="mb-4">
            <label htmlFor="api-delay" className="block text-sm font-medium text-gray-700 mb-1">
              API Call Delay (seconds)
            </label>
            <input
              id="api-delay"
              type="number"
              min="1"
              value={aiSettings.apiCallDelay}
              onChange={(e) =>
                setAiSettings({
                  ...aiSettings,
                  apiCallDelay: Math.max(1, parseInt(e.target.value, 10) || 1),
                })
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">Delay between consecutive API calls to avoid rate limits</p>
          </div>

          <div>
            <label htmlFor="max-retries" className="block text-sm font-medium text-gray-700 mb-1">
              Max Retries on Failure
            </label>
            <input
              id="max-retries"
              type="number"
              min="0"
              value={aiSettings.maxRetries}
              onChange={(e) =>
                setAiSettings({
                  ...aiSettings,
                  maxRetries: Math.max(0, parseInt(e.target.value, 10) || 0),
                })
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">Number of retry attempts for failed requests (0 for unlimited)</p>
          </div>
        </div>

        {/* Validation Summary */}
        {Object.keys(validationErrors).length > 0 && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-yellow-800 text-sm font-semibold mb-1">Configuration Issues:</p>
            <ul className="list-disc list-inside text-yellow-700 text-xs space-y-1">
              {Object.values(validationErrors).map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
