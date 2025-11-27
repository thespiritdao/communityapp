'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchAllExistingHatImages, EXISTING_HATS } from '../utils/hatImageFetcher';

export const HatImageViewer: React.FC = () => {
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchImages = async () => {
    setLoading(true);
    setError(null);
    try {
      const hatImages = await fetchAllExistingHatImages();
      setImages(hatImages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch HAT images');
      console.error('Error fetching HAT images:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>🎩 HAT Image Viewer</CardTitle>
        <p className="text-sm text-gray-600">
          Fetch real image URIs from your deployed HATS for use in createPodProposal
        </p>
      </CardHeader>

      <CardContent>
        <div className="mb-4">
          <Button onClick={fetchImages} disabled={loading}>
            {loading ? 'Fetching Images...' : 'Refresh HAT Images'}
          </Button>
        </div>

        {error && (
          <div className="border p-4 rounded-lg mb-4" style={{ backgroundColor: '#F5E6E6', borderColor: '#D9B3B3' }}>
            <p style={{ color: '#5C1F1F' }}>Error: {error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-600">Fetching HAT images from Base...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(EXISTING_HATS).map(([name, hatId]) => {
              const imageUri = images[hatId];
              const displayName = name.replace(/_/g, ' ').toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

              return (
                <div key={hatId} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium">{displayName}</h3>
                      <p className="text-xs text-gray-500 font-mono">
                        {hatId.slice(0, 10)}...{hatId.slice(-6)}
                      </p>
                    </div>
                    
                    {imageUri && (
                      <img
                        src={imageUri}
                        alt={displayName}
                        className="w-16 h-16 rounded-lg border object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                  </div>

                  {imageUri ? (
                    <div className="space-y-2">
                      <div className="bg-gray-50 p-2 rounded text-xs font-mono break-all">
                        {imageUri}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(imageUri)}
                        >
                          Copy URI
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(imageUri, '_blank')}
                        >
                          Open Image
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      {loading ? 'Loading...' : 'No image found'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: '#E8F1EE' }}>
          <h4 className="font-medium mb-2" style={{ color: '#1F453A' }}>💡 Usage for createPodProposal</h4>
          <div className="text-sm space-y-2" style={{ color: '#2F5D50' }}>
            <p>1. Copy the Executive Pod image URI from above</p>
            <p>2. Use it as the <code>imageURI</code> parameter in Remix:</p>
            <div className="bg-white p-2 rounded font-mono text-xs mt-2 border">
              createPodProposal(<br />
              &nbsp;&nbsp;"executive-pod",<br />
              &nbsp;&nbsp;"Executive Pod", <br />
              &nbsp;&nbsp;"Main governance pod",<br />
              &nbsp;&nbsp;"[PASTE_IMAGE_URI_HERE]", // ← Use copied URI<br />
              &nbsp;&nbsp;["0x12a0cf22d632c859b793f852af03b9d515580244"],<br />
              &nbsp;&nbsp;0x0000008800000000000000000000000000000000000000000000000000000000<br />
              )
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};