/**
 * Webcam Module
 * 
 * Handles the webcam feed setup, permissions, and video processing
 */

export class WebcamHandler {
    constructor(videoElement) {
        this.videoElement = videoElement;
        this.stream = null;
        this.isActive = false;
    }
    
    /**
     * Initialize webcam and request permissions
     */
    async setup() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                }
            };
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.stream;
            this.isActive = true;
            
            return true;
        } catch (error) {
            console.error('Error setting up webcam:', error);
            throw new Error(`Webcam access denied: ${error.message}`);
        }
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