/**
 * Webcam Module
 * 
 * Handles the webcam feed setup, permissions, video processing, and camera selection
 */

export class WebcamHandler {
    constructor(videoElement) {
        this.videoElement = videoElement;
        this.stream = null;
        this.isActive = false;
        this.availableCameras = [];
        this.selectedCameraId = null;
        this.constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        };
        
        // Canvas for preprocessing
        this.processingCanvas = document.createElement('canvas');
        this.processingContext = this.processingCanvas.getContext('2d');
    }
    
    /**
     * Initialize webcam and request permissions
     */
    async setup() {
        // Check for browser compatibility first
        if (!this.checkBrowserCompatibility()) {
            throw new Error('Your browser does not support webcam access. Please use a modern browser like Chrome, Firefox, or Edge.');
        }
        
        try {
            // Get available cameras first
            await this.enumerateDevices();
            
            // Use selected camera if available, otherwise use default constraints
            if (this.selectedCameraId) {
                this.constraints.video.deviceId = { exact: this.selectedCameraId };
            }
            
            this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
            this.videoElement.srcObject = this.stream;
            
            // Wait for video to be ready
            await new Promise(resolve => {
                this.videoElement.onloadedmetadata = () => {
                    // Set processing canvas to match video dimensions
                    this.processingCanvas.width = this.videoElement.videoWidth;
                    this.processingCanvas.height = this.videoElement.videoHeight;
                    resolve();
                };
            });
            
            this.isActive = true;
            return true;
        } catch (error) {
            this.handleError(error);
            return false;
        }
    }
    
    /**
     * Check if the browser supports getUserMedia API
     */
    checkBrowserCompatibility() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }
    
    /**
     * Handle webcam errors with user-friendly messages
     */
    handleError(error) {
        console.error('Webcam error:', error);
        
        let message = 'An unknown error occurred with the webcam.';
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            message = 'Camera access was denied. Please grant permission to use your camera.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            message = 'No camera was found on your device.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            message = 'Your camera is already in use by another application.';
        } else if (error.name === 'OverconstrainedError') {
            message = 'The requested camera settings are not supported by your device.';
        } else if (error.name === 'TypeError' || error.name === 'TypeError') {
            message = 'No camera was specified.';
        }
        
        throw new Error(message);
    }
    
    /**
     * Get a list of available video input devices
     */
    async enumerateDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras = devices.filter(device => device.kind === 'videoinput');
            
            // If we have cameras but none selected, select the first one
            if (this.availableCameras.length > 0 && !this.selectedCameraId) {
                this.selectedCameraId = this.availableCameras[0].deviceId;
            }
            
            return this.availableCameras;
        } catch (error) {
            console.error('Error enumerating devices:', error);
            return [];
        }
    }
    
    /**
     * Switch to a different camera
     */
    async switchCamera(deviceId) {
        if (this.isActive) {
            this.stop();
        }
        
        this.selectedCameraId = deviceId;
        return await this.setup();
    }
    
    /**
     * Process video frame for AI model input
     * Returns a tensor or processed image data that can be used by the AI model
     */
    processVideoFrame() {
        if (!this.isActive || !this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
            return null;
        }
        
        // Draw the current video frame to the processing canvas
        this.processingContext.drawImage(
            this.videoElement,
            0, 0,
            this.processingCanvas.width,
            this.processingCanvas.height
        );
        
        // Get the image data - this can be further processed based on AI model requirements
        const imageData = this.processingContext.getImageData(
            0, 0,
            this.processingCanvas.width,
            this.processingCanvas.height
        );
        
        // Perform basic preprocessing
        // Note: Specific preprocessing steps would depend on the requirements of the hand tracking model
        
        return imageData;
    }
    
    /**
     * Get the current video element dimensions
     */
    getDimensions() {
        return {
            width: this.videoElement.videoWidth,
            height: this.videoElement.videoHeight
        };
    }
    
    /**
     * Stop the webcam stream
     */
    stop() {
        if (this.stream) {
            const tracks = this.stream.getTracks();
            tracks.forEach(track => track.stop());
            this.videoElement.srcObject = null;
            this.isActive = false;
        }
    }
} 