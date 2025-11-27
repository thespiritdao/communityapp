'use client';

import type React from 'react';
import { useRef, useEffect, useState, } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Camera, 
  CameraOff, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { QRCodeService } from '../services/QRCodeService';
import type { CheckInProcessingResult, QRScanResult } from '../types/qr-types';
import jsQR from 'jsqr';

interface QRScannerProps {
  eventId: string;
  isOpen: boolean;
  onClose: () => void;
  onCheckInSuccess: (result: CheckInProcessingResult) => void;
  onCheckInError: (error: string) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({
  eventId,
  isOpen,
  onClose,
  onCheckInSuccess,
  onCheckInError
}) => {
  // Debug log when component mounts/updates
  console.log('🔧 QRScanner: Component render with eventId:', eventId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<CheckInProcessingResult | null>(null);

  // Initialize camera when dialog opens
  useEffect(() => {
    if (isOpen) {
      initializeCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const initializeCamera = async () => {
    try {
      setError(null);
      setLastScanResult(null);
      
      // Stop any existing camera stream first
      stopCamera();
      
      // Request camera permission with optimal settings for QR scanning
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera if available
          width: { ideal: 1280, max: 1920 }, // Higher resolution for better QR detection
          height: { ideal: 720, max: 1080 },
          aspectRatio: { ideal: 1.33333 },
          frameRate: { ideal: 30, max: 60 } // Higher frame rate for better capture
        },
        audio: false
      });

      streamRef.current = stream;
      setHasPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Ensure video plays automatically
        videoRef.current.oncanplay = () => {
          videoRef.current?.play().then(() => {
            console.log('📹 Camera started successfully');
            // Wait a bit for the camera to stabilize before starting to scan
            setTimeout(() => {
              startScanning();
            }, 500);
          }).catch(err => {
            console.error('Error playing video:', err);
            setError('Failed to start camera playback');
          });
        };
        
        // Fallback for older browsers
        videoRef.current.onloadedmetadata = () => {
          if (!isScanning) {
            setTimeout(() => {
              startScanning();
            }, 500);
          }
        };
      }
    } catch (err) {
      console.error('Camera initialization error:', err);
      setHasPermission(false);
      setError('Unable to access camera. Please check permissions and try again.');
    }
  };

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsScanning(false);
  };

  const startScanning = () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsScanning(true);
    setError(null);
    console.log('📱 Starting QR code scanning...');

    // Scan for QR codes every 200ms for better responsiveness
    scanIntervalRef.current = setInterval(() => {
      scanForQRCode();
    }, 200);
  };

  const scanForQRCode = async () => {
    if (!videoRef.current || !canvasRef.current || processing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Ensure we have valid dimensions
    if (canvas.width === 0 || canvas.height === 0) return;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data for QR code detection
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    try {
      // Use jsQR library for QR code detection
      const qrResult = await detectQRCode(imageData);
      
      if (qrResult.success && qrResult.data) {
        console.log('📋 Processing detected QR code...');
        await handleQRCodeDetected(JSON.stringify(qrResult.data));
      }
    } catch (error) {
      // Silent error - scanning continues
      console.warn('QR scan error:', error);
    }
  };

  // Enhanced QR code detection with better settings for screen scanning
  const detectQRCode = async (imageData: ImageData): Promise<QRScanResult> => {
    try {
      // Try multiple inversion attempts for better screen detection
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth", // Try both inverted and normal
      });

      if (code) {
        console.log('🔍 QR Code raw data detected:', code.data.substring(0, 100) + '...');
        
        try {
          // Parse the QR code data as JSON
          const qrData = JSON.parse(code.data);
          console.log('🔍 Parsed QR Code data:', {
            eventId: qrData.eventId,
            walletAddress: qrData.walletAddress,
            version: qrData.version
          });
          
          // Validate that it's an event QR code
          if (qrData.eventId && qrData.walletAddress && qrData.version) {
            return { 
              success: true, 
              data: qrData 
            };
          } else {
            console.warn('QR code does not contain valid event data structure');
            return { success: false };
          }
        } catch (parseError) {
          console.log('Failed to parse QR code data as JSON, trying as plain text');
          // Maybe it's a URL or plain text QR code
          console.log('QR code contains plain text:', code.data);
          return { success: false };
        }
      }
      
      return { success: false };
    } catch (error) {
      // Silent error for scanning - this happens constantly during scanning
      return { success: false };
    }
  };

  const handleQRCodeDetected = async (qrData: string) => {
    if (processing) return;

    try {
      // Safe logging to prevent errors
      console.log('📞 QR Scanner: handleQRCodeDetected called');
      console.log('📞 Scanner Event ID:', eventId || 'undefined');
      console.log('📞 QR Data length:', qrData?.length || 0);
      
      if (!qrData || !eventId) {
        throw new Error('Missing QR data or event ID');
      }
      
      // Parse QR data safely
      let parsedQRData: any;
      try {
        parsedQRData = JSON.parse(qrData);
        console.log('🔍 QR Scanner Event ID Comparison:', {
          scannerEventId: eventId,
          qrCodeEventId: parsedQRData?.eventId,
          match: eventId === parsedQRData?.eventId
        });
      } catch (parseError) {
        throw new Error('Invalid QR code format');
      }
      
      setProcessing(true);
      setError(null);

      // Stop scanning while processing
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }

      console.log('🔄 QR Scanner: Calling QRCodeService.processCheckIn...');
      const result = await QRCodeService.processCheckIn(qrData, eventId);
      console.log('📋 QR Scanner: processCheckIn result received');
      
      setLastScanResult(result);

      if (result.success) {
        console.log('✅ QR Scanner: Check-in successful');
        onCheckInSuccess(result);
        // Show success for 2 seconds, then resume scanning
        setTimeout(() => {
          setLastScanResult(null);
          startScanning();
        }, 2000);
      } else {
        console.log('❌ QR Scanner: Check-in failed:', result.message);
        onCheckInError(result.message);
        setError(result.message);
        // Resume scanning after error
        setTimeout(() => {
          setError(null);
          startScanning();
        }, 3000);
      }
    } catch (error) {
      console.log('❌ QR Scanner: Exception in handleQRCodeDetected:', error instanceof Error ? error.message : 'Unknown error');
      const errorMessage = error instanceof Error ? error.message : 'Failed to process QR code';
      setError(errorMessage);
      
      // Safely call error handler
      try {
        onCheckInError(errorMessage);
      } catch (callbackError) {
        console.log('Error in onCheckInError callback:', callbackError instanceof Error ? callbackError.message : 'Callback error');
      }
      
      // Resume scanning after error
      setTimeout(() => {
        setError(null);
        startScanning();
      }, 3000);
    } finally {
      setProcessing(false);
    }
  };

  const handleManualInput = () => {
    // Use the actual event ID from props for testing
    const testQRData = {
      eventId: eventId, // Use the actual event ID passed to this component
      walletAddress: "0x12a0cf22d632c859b793f852af03b9d515580244",
      userId: null, // Will be filled by proper profile lookup
      registrationId: "90a8e308-e96d-42ac-a10c-9d6ae292f0e0",
      timestamp: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      version: "2.0",
      signature: "ZTViZjgzOWMtMmVm"
    };
    
    const qrInput = prompt(
      'Enter QR code data manually (or leave empty for test data):\n\nTest data using current event ID:\n' + 
      JSON.stringify(testQRData, null, 2)
    );
    
    if (qrInput !== null) {
      const dataToUse = qrInput.trim() || JSON.stringify(testQRData);
      console.log('🧪 Testing with manual input for event:', eventId);
      handleQRCodeDetected(dataToUse);
    }
  };

  const resetScanner = () => {
    setError(null);
    setLastScanResult(null);
    setProcessing(false);
    
    // Stop current scanning
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    // Reinitialize camera if needed
    if (hasPermission && videoRef.current) {
      // Wait a bit then restart scanning
      setTimeout(() => {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          startScanning();
        } else {
          // If video isn't ready, reinitialize camera
          initializeCamera();
        }
      }, 200);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            <span>Confirm Access</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera Permission Status */}
          {hasPermission === false && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Camera access denied. Please enable camera permissions and refresh.
              </AlertDescription>
            </Alert>
          )}

          {/* Camera View */}
          {hasPermission && (
            <div className="relative">
              <div className="relative aspect-square bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline={true}
                  muted={true}
                />
                
                {/* Scanning Overlay */}
                <div className="absolute inset-0 border-2 rounded-lg" style={{ borderColor: '#2F5D50' }}>
                  <div className="absolute inset-4 border-2 border-white border-dashed rounded-lg opacity-50" />

                  {/* Scanning indicator */}
                  {isScanning && !processing && (
                    <div className="absolute top-2 right-2 text-white px-2 py-1 rounded text-xs flex items-center" style={{ backgroundColor: '#3F7A5A' }}>
                      <div className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse" />
                      Scanning
                    </div>
                  )}
                  
                  {/* Processing indicator */}
                  {processing && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                      <div className="bg-white p-4 rounded-lg flex items-center">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                        Processing...
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Hidden canvas for image processing */}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}

          {/* Success/Error Messages */}
          {lastScanResult && (
            <Alert style={{ borderColor: lastScanResult.success ? '#3F7A5A' : '#8B3A3A' }}>
              {lastScanResult.success ? (
                <CheckCircle2 className="h-4 w-4" style={{ color: '#3F7A5A' }} />
              ) : (
                <XCircle className="h-4 w-4" style={{ color: '#8B3A3A' }} />
              )}
              <AlertDescription style={{ color: lastScanResult.success ? '#1F453A' : '#5C1F1F' }}>
                {lastScanResult.message}
                {lastScanResult.success && lastScanResult.userProfile && (
                  <div className="mt-1 text-sm">
                    {lastScanResult.userProfile.first_name} {lastScanResult.userProfile.last_name}
                    {lastScanResult.userProfile.email && ` (${lastScanResult.userProfile.email})`}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert style={{ borderColor: '#8B3A3A' }}>
              <XCircle className="h-4 w-4" style={{ color: '#8B3A3A' }} />
              <AlertDescription style={{ color: '#5C1F1F' }}>
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Instructions */}
          <div className="text-center text-sm text-gray-600">
            <p>Point your camera at the QR Code</p>
            <p className="text-xs mt-1">💡 For screen QR codes: Ensure good lighting, avoid reflections</p>
            <p className="text-xs mt-1">📱 Try adjusting distance and angle if not detecting</p>
            <p className="text-xs mt-1" style={{ color: '#3F7A5A' }}>✓ Enhanced QR detection active</p>
          </div>

          {/* Controls */}
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              onClick={resetScanner}
              disabled={processing}
              className="flex-1"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleManualInput}
              disabled={processing}
              className="flex-1"
            >
              Manual Input
            </Button>
            
            <Button 
              variant="outline" 
              onClick={onClose}
              disabled={processing}
              className="flex-1"
            >
              Close
            </Button>
          </div>

          {/* Scanner Status */}
          <div className="flex justify-center items-center space-x-4 text-xs text-gray-500">
            <div className="flex items-center">
              {isScanning ? (
                <Camera className="w-3 h-3 mr-1" style={{ color: '#3F7A5A' }} />
              ) : (
                <CameraOff className="w-3 h-3 mr-1" style={{ color: '#8B3A3A' }} />
              )}
              {isScanning ? 'Camera Active' : 'Camera Inactive'}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};