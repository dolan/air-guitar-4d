/**
 * Hand Tracking Module
 * 
 * Uses TensorFlow.js/MediaPipe to detect and track hand positions
 */

// We're now loading libraries via script tags, no need for imports
// The libraries will be available in the global scope

// Hand landmark indices for finger tips and bases
const FINGER_LANDMARKS = {
    THUMB: { TIP: 4, BASE: 2 },
    INDEX: { TIP: 8, BASE: 5 },
    MIDDLE: { TIP: 12, BASE: 9 },
    RING: { TIP: 16, BASE: 13 },
    PINKY: { TIP: 20, BASE: 17 },
    WRIST: 0
};

export class HandTracking {
    constructor(videoElement, canvasElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.ctx = this.canvasElement.getContext('2d');
        this.detector = null;
        this.model = null;
        this.isRunning = false;
        this.hands = { left: null, right: null };
        this.lastFrameHands = { left: null, right: null };
        this.calibrated = false;
        
        // Track last detected chord and strum for visual feedback
        this.lastDetectedChord = null;
        this.lastStrumDirection = null;
        this.strumDisplayTimeout = null; // For temporarily showing strum direction
        
        // Configuration options
        this.modelConfig = {
            runtime: 'mediapipe', // Use mediapipe runtime which works better in browser
            modelType: 'full', // 'lite' for better performance but less accuracy
            maxHands: 2,
            solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915', // Specify exact version
            scoreThreshold: 0.5
        };
        
        // Frame processing options - Always mirror for natural interaction
        this.processingOptions = {
            flipHorizontal: true  // View is always mirrored for more intuitive interaction
        };
        
        // Guitar plane angle adjustment (in degrees)
        this.guitarPlaneAngle = 45; // Default to a natural guitar inclination
        
        // Initialize TensorFlow.js when constructed
        this.tfReady = false;
        this._initTensorFlow();
    }
    
    /**
     * Set the guitar plane angle
     * @param {number} angle - Angle in degrees to adjust the guitar plane (35-90)
     */
    setGuitarPlaneAngle(angle) {
        // Ensure angle is within valid range
        const clampedAngle = Math.max(35, Math.min(90, angle));
        
        // If angle changed, start animation
        if (clampedAngle !== this.guitarPlaneAngle) {
            this.previousGuitarPlaneAngle = this.guitarPlaneAngle;
            this.guitarPlaneAngle = clampedAngle;
            this.animateAngleChange();
            
            // Update guitar plane points
            this.calculateGuitarPlanePoints();
            
            // console.debug(`Guitar plane angle set to ${this.guitarPlaneAngle}°`);
        }
        
        return this.guitarPlaneAngle;
    }
    
    /**
     * Animate the transition between guitar plane angles
     */
    animateAngleChange() {
        // If we already have an animation in progress, cancel it
        if (this.angleAnimationId) {
            cancelAnimationFrame(this.angleAnimationId);
        }
        
        const startTime = performance.now();
        const startAngle = this.previousGuitarPlaneAngle || 0;
        const targetAngle = this.guitarPlaneAngle;
        const animationDuration = 300; // ms
        
        // Only animate if there's a significant change
        if (Math.abs(targetAngle - startAngle) < 0.1) {
            return;
        }
        
        // Store the actual angle separately from the displayed animated angle
        this.displayedAngle = startAngle;
        
        const animateFrame = (timestamp) => {
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);
            
            // Use an ease-out function for smooth animation
            const easeOutProgress = 1 - Math.pow(1 - progress, 2);
            
            // Update the displayed angle
            this.displayedAngle = startAngle + (targetAngle - startAngle) * easeOutProgress;
            
            // Continue animation if not complete
            if (progress < 1) {
                this.angleAnimationId = requestAnimationFrame(animateFrame);
            } else {
                this.displayedAngle = targetAngle;
                this.angleAnimationId = null;
            }
        };
        
        // Start the animation
        this.angleAnimationId = requestAnimationFrame(animateFrame);
    }
    
    /**
     * Convert angle from degrees to radians
     * @param {number} degrees - Angle in degrees
     * @returns {number} Angle in radians
     */
    degreesToRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    
    /**
     * Initialize TensorFlow.js
     */
    async _initTensorFlow() {
        try {
            // console.debug('Initializing TensorFlow.js...');
            
            // Wait for TensorFlow.js to be ready
            await window.tf.ready();
            
            // console.debug('TensorFlow.js initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize TensorFlow.js:', error);
            return false;
        }
    }
    
    /**
     * Initialize the hand tracking model
     */
    async setup() {
        if (!this.videoElement || !this.videoElement.srcObject) {
            console.error('Video element not ready or no stream attached');
            return false;
        }
        
        try {
            // Ensure TensorFlow.js is ready
            if (!window.tf) {
                console.error('TensorFlow.js not available');
                return false;
            }
            
            // console.debug('Waiting for TensorFlow.js to be ready...');
            await window.tf.ready();
            // console.debug('TensorFlow.js now ready');
            
            // Check if we already have a detector
            if (this.detector) {
                // console.debug('Detector already exists, reusing existing detector');
                this.isRunning = true;
                return true;
            }
            
            // Set WebGL as preferred backend
            try {
                window.tf.setBackend('webgl');
                // console.debug('Set TensorFlow backend to WebGL');
            } catch (backendError) {
                console.warn('Failed to set WebGL backend:', backendError);
            }
            
            // Log library availability for debugging
            // console.debug('Library availability check:');
            // console.debug('- TensorFlow:', typeof window.tf !== 'undefined');
            // console.debug('- tf.ready function:', typeof window.tf?.ready === 'function');
            // console.debug('- tf.getBackend:', typeof window.tf?.getBackend === 'function');
            
            // console.debug('- Current backend:', window.tf.getBackend());
            
            // console.debug('- handPoseDetection:', typeof window.handPoseDetection !== 'undefined');
            
            // Verify that the handPoseDetection library is available
            if (typeof window.handPoseDetection === 'undefined') {
                console.error('MediaPipe Hands library (handPoseDetection) not loaded');
                return false;
            }
            
            // console.debug('Hand pose detection library is available');
            // console.debug('- MediaPipe Hands model:', typeof window.handPoseDetection.SupportedModels?.MediaPipeHands);
            // console.debug('- createDetector function:', typeof window.handPoseDetection.createDetector);
            
            // Create the hand pose detector
            try {
                // Get specified model or default to MediaPipeHands
                const model = window.handPoseDetection.SupportedModels.MediaPipeHands;
                
                // Create configuration with performance tradeoffs for real-time use
                // Note: Adjust parameters based on performance testing
                const config = {
                    runtime: 'mediapipe',
                    modelType: 'lite',
                    maxHands: 2,
                    solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
                };
                
                // Update config with processing options
                const updatedConfig = { ...config, ...this.processingOptions };
                // console.debug('Using updated model configuration:', updatedConfig);
                
                // Create attempts counter for retry logic
                let attempts = 0;
                // console.debug('Creating hand pose detector...');

                // Create a promise with timeout
                const createDetectorWithTimeout = async (timeout = 10000) => {
                    return Promise.race([
                        window.handPoseDetection.createDetector(
                            model,
                            updatedConfig
                        ),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Detector creation timed out')), timeout)
                        )
                    ]);
                };

                // Try up to 3 times to create the detector
                let detectorCreated = false;

                while (attempts < 3 && !detectorCreated) {
                    attempts++;
                    try {
                        // console.debug(`Detector creation attempt ${attempts}...`);
                        this.detector = await createDetectorWithTimeout();
                        if (this.detector) {
                            detectorCreated = true;
                            // console.debug('Detector created successfully:', !!this.detector);
                        } else {
                            // console.warn('Detector creation returned null or undefined');
                            // Add a slight delay before next attempt
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    } catch (detectorError) {
                        console.error(`Error creating detector (attempt ${attempts}/3):`, detectorError);
                        
                        if (attempts >= 3) {
                            throw new Error(`Failed to create hand pose detector after 3 attempts: ${detectorError.message}`);
                        }
                        
                        // Wait before retrying
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                if (!this.detector) {
                    console.error('Detector creation failed after multiple attempts');
                    
                    // Try one more time with an even simpler configuration
                    console.debug('Trying with absolute minimum configuration...');
                    this.detector = await window.handPoseDetection.createDetector(
                        model,
                        { runtime: 'mediapipe', maxHands: 2 }
                    );
                    
                    if (!this.detector) {
                        throw new Error('Hand pose detector was not created properly');
                    } else {
                        console.debug('Last-ditch attempt created a detector successfully');
                    }
                }

                // Initialize with a test detection to ensure everything works
                console.debug('Testing detector with a dummy detection...');

                if (this.videoElement.readyState >= 2) { // Have current data or enough data to play
                    try {
                        const testDetection = await this.detector.estimateHands(
                            this.videoElement,
                            this.processingOptions
                        );
                        console.debug('Test detection succeeded:', testDetection);
                    } catch (testError) {
                        console.warn('Test detection failed, but continuing:', testError);
                        // Continue anyway, as the video might not be ready yet
                    }
                } else {
                    console.debug('Video not ready for test detection, will try during regular processing');
                }
                
                console.log('Hand tracking model loaded successfully');
                
                // Resize canvas to match video dimensions
                this.resizeCanvas();
                console.debug('Canvas resized to:', {
                    width: this.canvasElement.width,
                    height: this.canvasElement.height
                });
                
                // Start automatically
                this.isRunning = true;
                console.debug('Setting isRunning to true automatically');
                
                return true;
            } catch (error) {
                console.error('Error setting up hand tracking:', error);
                console.error('Stack trace:', error.stack);
                
                // Try to recover with a fallback configuration if possible
                try {
                    console.debug('Trying fallback configuration...');
                    const fallbackConfig = {
                        runtime: 'tfjs',
                        modelType: 'lite',
                        maxHands: 2
                    };
                    console.debug('Using fallback configuration:', fallbackConfig);
                    this.detector = await window.handPoseDetection.createDetector(
                        model,
                        fallbackConfig
                    );
                    
                    if (this.detector) {
                        console.debug('Fallback detector created successfully');
                        this.isRunning = true;
                        return true;
                    }
                } catch (fallbackError) {
                    console.error('Fallback configuration also failed:', fallbackError);
                }
                
                throw new Error(`Hand tracking setup failed: ${error.message}`);
            }
        } catch (error) {
            console.error('Error setting up hand tracking:', error);
            console.error('Stack trace:', error.stack);
            
            // Try to recover with a fallback configuration if possible
            try {
                console.debug('Trying fallback configuration...');
                const fallbackConfig = {
                    runtime: 'tfjs',
                    modelType: 'lite',
                    maxHands: 2
                };
                console.debug('Using fallback configuration:', fallbackConfig);
                this.detector = await window.handPoseDetection.createDetector(
                    model,
                    fallbackConfig
                );
                
                if (this.detector) {
                    console.debug('Fallback detector created successfully');
                    this.isRunning = true;
                    return true;
                }
            } catch (fallbackError) {
                console.error('Fallback configuration also failed:', fallbackError);
            }
            
            throw new Error(`Hand tracking setup failed: ${error.message}`);
        }
    }
    
    /**
     * Resize canvas to match video dimensions
     */
    resizeCanvas() {
        if (this.videoElement.videoWidth) {
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;
        } else {
            // Default dimensions if video isn't loaded yet
            this.canvasElement.width = this.videoElement.offsetWidth;
            this.canvasElement.height = this.videoElement.offsetHeight;
        }
    }
    
    /**
     * Start the hand tracking process
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        console.log('Hand tracking started');
    }
    
    /**
     * Stop the hand tracking process
     */
    stop() {
        this.isRunning = false;
        console.log('Hand tracking stopped');
    }
    
    /**
     * Set the mirrored state for drawing and calculations
     * Note: This method is kept for compatibility but will always force mirrored mode
     * @param {boolean} isMirrored - This parameter is now ignored, view is always mirrored
     */
    setMirrored(isMirrored) {
        // Always use mirrored mode regardless of the parameter
        this.processingOptions.flipHorizontal = true;
        console.debug('Hand tracking always uses mirror mode');
    }
    
    /**
     * Process a single video frame to detect and track hands
     * @returns {Object} Detected hand data
     */
    async processFrame() {
        // Skip processing if not running or missing components
        if (!this.isRunning || !this.detector || !this.videoElement || !this.canvasElement) {
            // console.debug('Skipping frame processing:', {
            //     isRunning: this.isRunning,
            //     detector: !!this.detector,
            //     videoElement: !!this.videoElement,
            //     canvasElement: !!this.canvasElement
            // });
            return null;
        }
        
        // Debug output
        // console.debug('Processing frame - detailed debug:');
        // console.debug('- Canvas dimensions:', this.canvasElement.width, 'x', this.canvasElement.height);
        // console.debug('- Video dimensions:', this.videoElement.videoWidth, 'x', this.videoElement.videoHeight);
        // console.debug('- Mirror setting:', this.processingOptions.flipHorizontal);
        // console.debug('- Processing options:', JSON.stringify(this.processingOptions));
        
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        try {
            // console.debug('===== FRAME PROCESSING START =====');
            // console.debug('Video element ready state:', this.videoElement.readyState);
            // console.debug('Video dimensions:', this.videoElement.videoWidth, 'x', this.videoElement.videoHeight);
            
            // Check if video is ready for processing
            if (this.videoElement.readyState < 2) { // HAVE_CURRENT_DATA
                // console.debug('Video not ready yet, skipping hand detection');
                return null;
            }
            
            // Process the frame with the detector
            // console.debug('Calling hand pose detector...');
            
            // Detect hands in the current frame
            const detectedHands = await this.detector.estimateHands(this.videoElement, this.processingOptions);
            
            // Analyze the detected hands
            // console.debug(`Detected ${detectedHands.length} hands:`, detectedHands);
            
            // Process each hand
            const handData = {
                leftHand: null,
                rightHand: null,
                bothHands: detectedHands.length === 2,
                allHands: detectedHands,
                lastFrameTimestamp: Date.now()
            };
            
            for (const hand of detectedHands) {
                // Correct the handedness for mirroring
                const modelHandedness = hand.handedness;
                const correctedHandedness = this.processingOptions.flipHorizontal ? 
                    (modelHandedness === 'Left' ? 'Right' : 'Left') : modelHandedness;
                
                // console.debug(`Detected ${modelHandedness} hand (displayed as ${correctedHandedness}) with score: ${hand.score}`);
                // console.debug(`Hand has ${hand.keypoints.length} keypoints`);
                
                // Store processed hand data
                if (correctedHandedness === 'Left') {
                    handData.leftHand = hand;
                } else if (correctedHandedness === 'Right') {
                    handData.rightHand = hand;
                }
                
                // console.debug('Wrist position:', hand.keypoints[0]);
                // console.debug('Index fingertip:', hand.keypoints[8]);
            }
            
            // Draw the hand landmarks on the canvas
            if (detectedHands.length > 0) {
                // console.debug('Drawing hand landmarks on canvas');
                this.drawHandLandmarks(detectedHands);
            } else {
                // console.debug('No hands to draw');
            }
            
            // console.debug('===== FRAME PROCESSING END =====');
            
            // Return the processed hand data
            return handData;
        } catch (error) {
            console.error('Error processing video frame:', error);
            return null;
        }
    }
    
    /**
     * Draw debug information on the canvas
     */
    drawDebugInfo() {
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // Helper function to adjust X coordinate based on mirror setting
        const adjustX = (x) => {
            return this.processingOptions.flipHorizontal ? this.canvasElement.width - x : x;
        };
        
        // Draw a border to show the canvas is active
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // Draw crosshairs in the center
        const centerX = this.canvasElement.width / 2;
        const centerY = this.canvasElement.height / 2;
        
        // Draw guitar layout indicators
        this.drawGuitarLayoutIndicators();
        
        // Add text showing tracking is active
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.font = '18px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            'Hand Tracking Active - Processing Frame',
            centerX,
            30
        );
        
        // Draw timestamp to show updates are happening
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
        this.ctx.font = '14px Arial';
        this.ctx.fillText(
            `Frame: ${Date.now()}`,
            centerX,
            60
        );
        
        // Draw a pulsing circle to show the system is active
        const pulseRadius = 20 + 10 * Math.sin(Date.now() / 300);
        this.ctx.beginPath();
        this.ctx.arc(50, 50, pulseRadius, 0, 2 * Math.PI);
        this.ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
        this.ctx.fill();
        
        // Debug information for hand states
        if (this.hands.left || this.hands.right) {
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
            this.ctx.font = '16px Arial';
            
            let textY = 100;
            
            if (this.hands.left) {
                this.ctx.fillText(`Left hand detected: ${Math.round(this.hands.left.score * 100)}% confidence`, centerX, textY);
                textY += 20;
            }
            
            if (this.hands.right) {
                this.ctx.fillText(`Right hand detected: ${Math.round(this.hands.right.score * 100)}% confidence`, centerX, textY);
            }
        }
    }
    
    /**
     * Draw clear visual indicators for the guitar neck and belly areas
     */
    drawGuitarLayoutIndicators() {
        const width = this.canvasElement.width;
        const height = this.canvasElement.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const timestamp = Date.now();
        
        // Since view is mirrored, the right side of screen is for left hand (neck)
        // and left side of screen is for right hand (strumming area)
        
        // Create gradient for the guitar neck (right side in mirrored view)
        const neckGradient = this.ctx.createLinearGradient(centerX, 0, width, 0);
        neckGradient.addColorStop(0, 'rgba(139, 69, 19, 0.1)'); // Brown
        neckGradient.addColorStop(1, 'rgba(139, 69, 19, 0.3)');
        
        // Create gradient for the guitar body (left side in mirrored view)
        const bodyGradient = this.ctx.createLinearGradient(0, 0, centerX, 0);
        bodyGradient.addColorStop(0, 'rgba(160, 82, 45, 0.3)'); // Sienna
        bodyGradient.addColorStop(1, 'rgba(160, 82, 45, 0.1)');
        
        // Draw neck area (right side)
        this.ctx.fillStyle = neckGradient;
        this.ctx.fillRect(centerX, 100, width - centerX, height - 200);
        
        // Draw body/strumming area (left side)
        this.ctx.fillStyle = bodyGradient; 
        this.ctx.fillRect(0, 100, centerX, height - 200);
        
        // Draw guitar neck outline (right side) with pulsing effect when left hand detected
        const leftHandPulse = this.hands.right ? 2 + Math.sin(timestamp / 200) * 2 : 4;
        this.ctx.strokeStyle = this.hands.right ? 'rgba(0, 255, 0, 0.7)' : 'rgba(139, 69, 19, 0.7)';
        this.ctx.lineWidth = leftHandPulse;
        this.ctx.strokeRect(centerX, 100, width - centerX, height - 200);
        
        // Draw guitar body outline (left side) with pulsing effect when right hand detected
        const rightHandPulse = this.hands.left ? 2 + Math.sin(timestamp / 200) * 2 : 4;
        this.ctx.strokeStyle = this.hands.left ? 'rgba(0, 150, 255, 0.7)' : 'rgba(160, 82, 45, 0.7)';
        this.ctx.lineWidth = rightHandPulse;
        this.ctx.strokeRect(0, 100, centerX, height - 200);
        
        // Draw frets on the neck
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 2;
        const fretCount = 6;
        const fretWidth = (width - centerX) / fretCount;
        
        for (let i = 1; i < fretCount; i++) {
            const x = centerX + i * fretWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 100);
            this.ctx.lineTo(x, height - 100);
            this.ctx.stroke();
        }
        
        // Draw strings on the neck with animation when left hand is forming chord
        this.ctx.lineWidth = 1;
        const stringCount = 6;
        const stringSpacing = (height - 200) / (stringCount - 1);
        
        for (let i = 0; i < stringCount; i++) {
            const y = 100 + i * stringSpacing;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, y);
            this.ctx.lineTo(width, y);
            
            // Make strings more visible when left hand is detected (forming chords)
            if (this.hands.right) {
                const vibration = Math.sin(timestamp / 100 + i * 5) * 2;
                const animatedY = y + vibration;
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                this.ctx.lineWidth = 1.5;
                
                this.ctx.beginPath();
                this.ctx.moveTo(centerX, animatedY);
                this.ctx.lineTo(width, animatedY);
            } else {
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                this.ctx.lineWidth = 1;
            }
            
            this.ctx.stroke();
        }
        
        // Draw animated strumming area with motion when right hand is strumming
        this.ctx.strokeStyle = this.hands.left ? 'rgba(0, 200, 255, 0.7)' : 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = this.hands.left ? 4 : 3;
        
        // Animate the sound hole when right hand is present
        if (this.hands.left) {
            // Multiple animated circles for strumming effect
            for (let i = 0; i < 3; i++) {
                const radius = Math.min(centerX, centerY) * (0.2 + (i * 0.1)) + Math.sin(timestamp / 300 + i) * 5;
                this.ctx.beginPath();
                this.ctx.arc(centerX * 0.5, centerY, radius, 0, Math.PI * 2);
                this.ctx.stroke();
            }
            
            // Add a strum line indicator
            const strumY = centerY + Math.sin(timestamp / 150) * 50;
            this.ctx.strokeStyle = 'rgba(0, 200, 255, 0.7)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX * 0.2, strumY);
            this.ctx.lineTo(centerX * 0.8, strumY);
            this.ctx.stroke();
        } else {
            // Just one static circle when no hand detected
            this.ctx.beginPath();
            this.ctx.arc(centerX * 0.5, centerY, Math.min(centerX, centerY) * 0.3, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        
        // Add text labels for clarity
        this.ctx.font = 'bold 20px Arial';
        this.ctx.textAlign = 'center';
        
        // Guitar neck label (right side)
        this.ctx.fillStyle = this.hands.right ? 'rgba(0, 255, 0, 0.9)' : 'rgba(255, 255, 255, 0.8)';
        this.ctx.fillText('Guitar Neck (Left Hand)', centerX + (width - centerX) / 2, 80);
        this.ctx.font = '16px Arial';
        this.ctx.fillText('Form chord shapes here', centerX + (width - centerX) / 2, height - 80);
        
        // Guitar body label (left side)
        this.ctx.font = 'bold 20px Arial';
        this.ctx.fillStyle = this.hands.left ? 'rgba(0, 200, 255, 0.9)' : 'rgba(255, 255, 255, 0.8)';
        this.ctx.fillText('Guitar Body (Right Hand)', centerX / 2, 80);
        this.ctx.font = '16px Arial';
        this.ctx.fillText('Strum here', centerX / 2, height - 80);
        
        // If a chord is detected, show it
        if (this.lastDetectedChord && this.lastDetectedChord.name !== 'Unknown') {
            this.ctx.font = 'bold 22px Arial';
            this.ctx.fillStyle = 'rgba(255, 220, 120, 0.9)';
            this.ctx.fillText(`Chord: ${this.lastDetectedChord.name}`, centerX + (width - centerX) / 2, height - 40);
        }
        
        // If a strum is detected, show it
        if (this.lastStrumDirection) {
            this.ctx.font = 'bold 22px Arial';
            this.ctx.fillStyle = 'rgba(0, 200, 255, 0.9)';
            this.ctx.fillText(`Strum: ${this.lastStrumDirection}`, centerX / 2, height - 40);
        }
        
        // Draw distance indicator line between hands when both are visible
        if (this.hands.left && this.hands.right) {
            const strumWrist = this.hands.left.keypoints[0];
            const fretWrist = this.hands.right.keypoints[0];
            
            // Draw line connecting the two hands
            this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]); // Create dashed line
            this.ctx.beginPath();
            this.ctx.moveTo(strumWrist.x, strumWrist.y);
            this.ctx.lineTo(fretWrist.x, fretWrist.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]); // Reset to solid line
            
            // Calculate distance
            const distance = Math.sqrt(
                Math.pow(strumWrist.x - fretWrist.x, 2) + 
                Math.pow(strumWrist.y - fretWrist.y, 2)
            );
            
            // Draw a helpful text indicator about pitch/fret relationship
            this.ctx.font = '14px Arial';
            this.ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
            const midX = (strumWrist.x + fretWrist.x) / 2;
            const midY = (strumWrist.y + fretWrist.y) / 2 - 20;
            
            // Get pitch information - closer hands = higher pitch
            // Calculate approximate fret based on hand distance
            const canvas = this.canvasElement;
            const maxDistance = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
            const normalizedDistance = Math.min(1, distance / (maxDistance * 0.7));
            const approxFret = Math.min(12, Math.max(0, Math.round((1 - normalizedDistance) * 12)));
            
            this.ctx.fillText(`Distance: ${Math.round(distance)}px`, midX, midY);
            this.ctx.fillText(`Fret: ~${approxFret}`, midX, midY + 20);
            this.ctx.fillText(`(Closer = Higher Pitch)`, midX, midY + 40);
        }
    }
    
    /**
     * Draw the detected hand landmarks on the canvas
     */
    drawHandLandmarks(hands) {
        if (!this.ctx) {
            console.error('Cannot draw hand landmarks: Canvas context is not initialized');
            return;
        }
        
        const canvas = this.ctx.canvas;
        
        // Log detailed debug info about canvas and context
        console.debug('==== CANVAS DEBUG ====');
        console.debug('Canvas element:', this.canvasElement);
        console.debug('Canvas context:', this.ctx);
        console.debug(`Canvas dimensions: ${canvas.width}x${canvas.height}`);
        console.debug('Canvas style:', this.canvasElement.style.cssText);
        console.debug('Canvas visibility:', getComputedStyle(this.canvasElement).visibility);
        console.debug('Canvas opacity:', getComputedStyle(this.canvasElement).opacity);
        console.debug('Canvas display:', getComputedStyle(this.canvasElement).display);
        console.debug('Canvas position:', getComputedStyle(this.canvasElement).position);
        console.debug('Canvas z-index:', getComputedStyle(this.canvasElement).zIndex);
        
        // Create a bright, unmissable indicator to check if drawing is working
        const timestamp = Date.now(); // Use to create a pulsing effect
        
        // Clear the canvas for new drawing (but keep the timestamp in debug text)
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw timestamp to track updates
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`TS: ${timestamp}`, 10, 30);
        
        // Draw a very bold border
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        this.ctx.lineWidth = 10;
        this.ctx.strokeRect(0, 0, canvas.width, canvas.height);
        
        // Draw a flashing indicator in the corner
        const flashingSize = 40 + 20 * Math.sin(timestamp / 200);
        this.ctx.fillStyle = `rgba(255, 0, 255, ${0.5 + 0.5 * Math.sin(timestamp / 300)})`;
        this.ctx.beginPath();
        this.ctx.arc(canvas.width - 50, 50, flashingSize, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Draw a line representing the guitar plane angle
        this.drawGuitarPlaneIndicator(canvas);
        
        // Helper function to adjust X coordinate based on mirror setting
        const adjustX = (x) => {
            return this.processingOptions.flipHorizontal ? canvas.width - x : x;
        };
        
        // Now draw the hands
        // Process both hands
        for (const handType of ['left', 'right']) {
            const hand = hands[handType];
            if (!hand || !hand.keypoints || hand.keypoints.length === 0) {
                console.debug(`No ${handType} hand detected for drawing`);
                continue;
            }
            
            console.debug(`Drawing ${handType} hand with ${hand.keypoints.length} keypoints`);
            
            // Set colors based on hand type (using even brighter colors for debugging)
            const handColor = handType === 'left' ? 'rgba(0, 255, 0, 1.0)' : 'rgba(0, 0, 255, 1.0)';
            const connectionColor = handType === 'left' ? 'rgba(0, 255, 0, 1.0)' : 'rgba(0, 0, 255, 1.0)';
            
            // First keypoint - extra large for visibility
            if (hand.keypoints[0]) {
                const wrist = hand.keypoints[0];
                this.ctx.fillStyle = 'white';
                this.ctx.beginPath();
                
                // Apply mirroring on X-coordinate if needed
                const x = adjustX(wrist.x);
                const y = wrist.y;
                
                this.ctx.arc(x, y, 15, 0, 2 * Math.PI);
                this.ctx.fill();
                
                // Draw keypoint label
                this.ctx.fillStyle = 'black';
                this.ctx.font = 'bold 14px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(handType, x, y);
            }
            
            // Draw keypoints
            hand.keypoints.forEach((keypoint, index) => {
                const { x, y } = keypoint;
                
                // Skip if coordinates are invalid
                if (isNaN(x) || isNaN(y)) {
                    console.warn(`Invalid coordinates for keypoint ${index}: (${x}, ${y})`);
                    return;
                }
                
                // Apply mirroring on X-coordinate if needed
                const adjustedX = adjustX(x);
                
                // Draw dot
                this.ctx.fillStyle = handColor;
                this.ctx.beginPath();
                this.ctx.arc(adjustedX, y, 8, 0, 2 * Math.PI);
                this.ctx.fill();
                
                // Draw keypoint index for debugging
                this.ctx.fillStyle = 'white';
                this.ctx.font = '12px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(index.toString(), adjustedX, y + 5);
            });
            
            // Draw connections between keypoints (simplified hand skeleton)
            if (hand.keypoints.length >= 21) {
                this.ctx.strokeStyle = connectionColor;
                this.ctx.lineWidth = 5; // Thicker line for visibility
                
                // Define connections for hand skeleton
                const connections = [
                    // Thumb
                    [0, 1], [1, 2], [2, 3], [3, 4],
                    // Index finger
                    [0, 5], [5, 6], [6, 7], [7, 8],
                    // Middle finger
                    [0, 9], [9, 10], [10, 11], [11, 12],
                    // Ring finger
                    [0, 13], [13, 14], [14, 15], [15, 16],
                    // Pinky
                    [0, 17], [17, 18], [18, 19], [19, 20],
                    // Palm
                    [0, 5], [5, 9], [9, 13], [13, 17]
                ];
                
                // Draw the connections
                connections.forEach(([start, end]) => {
                    const startPoint = hand.keypoints[start];
                    const endPoint = hand.keypoints[end];
                    
                    if (startPoint && endPoint && 
                        !isNaN(startPoint.x) && !isNaN(startPoint.y) && 
                        !isNaN(endPoint.x) && !isNaN(endPoint.y)) {
                        
                        // Apply mirroring on X-coordinates if needed
                        const startX = adjustX(startPoint.x);
                        const endX = adjustX(endPoint.x);
                        
                        this.ctx.beginPath();
                        this.ctx.moveTo(startX, startPoint.y);
                        this.ctx.lineTo(endX, endPoint.y);
                        this.ctx.stroke();
                    }
                });
            }
        }
    }
    
    /**
     * Draw a visual indicator of the current guitar plane angle
     * @param {HTMLCanvasElement} canvas - The canvas element to draw on
     */
    drawGuitarPlaneIndicator(canvas) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const lineLength = Math.min(canvas.width, canvas.height) * 0.8;
        
        // Use the displayed angle for animation, or the actual angle if not animating
        const displayAngle = this.displayedAngle !== undefined ? this.displayedAngle : this.guitarPlaneAngle;
        
        // Convert angle to radians for calculations
        // Note: In our new range, 90° is vertical and 0° is horizontal
        // So we need to convert from our UI angle to the internal angle system
        const internalAngle = displayAngle - 90; // Convert to a system where 0° is horizontal
        const angleRad = this.degreesToRadians(internalAngle);
        
        // Calculate line endpoints based on the angle
        const fullAngleRad = angleRad;
        
        const dx = Math.cos(fullAngleRad) * lineLength / 2;
        const dy = Math.sin(fullAngleRad) * lineLength / 2;
        
        const startX = centerX - dx;
        const startY = centerY - dy; // No longer need to invert Y coordinate
        const endX = centerX + dx;
        const endY = centerY + dy; // No longer need to invert Y coordinate
        
        // Create a gradient for the line
        const gradient = this.ctx.createLinearGradient(startX, startY, endX, endY);
        gradient.addColorStop(0, 'rgba(255, 140, 0, 0.8)'); // Orange at start
        gradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.8)'); // Gold in the middle
        gradient.addColorStop(1, 'rgba(255, 140, 0, 0.8)'); // Orange at end
        
        // Draw the main line representing the guitar plane
        this.ctx.strokeStyle = gradient;
        this.ctx.lineWidth = 6;
        this.ctx.setLineDash([15, 5]); // Dashed line for better visibility
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset to solid line
        
        // Draw angle indicator with current actual value (not animated value)
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`Guitar Plane: ${this.guitarPlaneAngle}°`, canvas.width - 20, canvas.height - 20);
        
        // Draw a guitar icon at the center
        this.drawGuitarIcon(centerX, centerY, fullAngleRad);
        
        // Draw small perpendicular ticks to indicate direction
        const tickLength = 20;
        const perpAngleRad = fullAngleRad + Math.PI / 2; // 90 degrees perpendicular
        const tickDx = Math.cos(perpAngleRad) * tickLength;
        const tickDy = Math.sin(perpAngleRad) * tickLength;
        
        // Draw several ticks along the main line
        const numTicks = 7;
        const tickSpacing = lineLength / (numTicks - 1);
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        this.ctx.lineWidth = 2;
        
        for (let i = 0; i < numTicks; i++) {
            const t = i / (numTicks - 1);
            const tickX = startX + (endX - startX) * t;
            const tickY = startY + (endY - startY) * t;
            
            this.ctx.beginPath();
            this.ctx.moveTo(tickX, tickY);
            this.ctx.lineTo(tickX + tickDx, tickY + tickDy);
            this.ctx.stroke();
        }
    }
    
    /**
     * Draw a simple guitar icon at the specified center point
     * @param {number} x - Center X coordinate
     * @param {number} y - Center Y coordinate
     * @param {number} angleRad - Angle in radians for the guitar orientation
     */
    drawGuitarIcon(x, y, angleRad) {
        const size = 40; // Size of the guitar icon
        
        // Save the current context state
        this.ctx.save();
        
        // Translate to the center point
        this.ctx.translate(x, y);
        
        // Rotate according to the guitar plane angle
        this.ctx.rotate(angleRad - Math.PI/2); // Adjust the rotation to align with the line
        
        // Draw the guitar body (a rounded rectangle)
        this.ctx.fillStyle = 'rgba(222, 184, 135, 0.8)'; // Burlywood color for guitar
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, size/2, size/1.2, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw the guitar neck
        this.ctx.fillStyle = 'rgba(139, 69, 19, 0.8)'; // Brown for neck
        this.ctx.fillRect(-size/10, -size*1.2, size/5, size);
        
        // Draw the guitar strings
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.lineWidth = 1;
        
        const stringSpacing = size/10;
        for (let i = -2; i <= 2; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(i * stringSpacing, -size*1.2);
            this.ctx.lineTo(i * stringSpacing, size/1.2);
            this.ctx.stroke();
        }
        
        // Restore the context state
        this.ctx.restore();
    }
    
    /**
     * Detect if a strumming motion is being performed
     * @returns {Object|null} Information about the strumming motion if detected
     */
    detectStrummingMotion() {
        // Right hand is always used for strumming (appears on left side of mirrored view)
        const strummingHandType = 'left'; // In mirrored view, left hand is user's right hand
        const strummingHand = this.hands[strummingHandType];
        const prevStrummingHand = this.lastFrameHands[strummingHandType];
        
        if (!strummingHand || !prevStrummingHand) return null;
        
        // Get the wrist position
        const wrist = strummingHand.keypoints[FINGER_LANDMARKS.WRIST];
        const prevWrist = prevStrummingHand.keypoints[FINGER_LANDMARKS.WRIST];
        
        // Calculate vertical movement (Y-axis)
        const yMovement = wrist.y - prevWrist.y;
        
        // Detect strumming motion (significant vertical movement)
        const STRUM_THRESHOLD = 12; // Reduced from 25 to make strumming more sensitive
        
        if (Math.abs(yMovement) > STRUM_THRESHOLD) {
            const direction = yMovement > 0 ? 'down' : 'up';
            const strumInfo = {
                direction: direction,
                intensity: Math.abs(yMovement) / 50, // Normalize between 0-1 (approximate)
                position: wrist
            };
            
            // Save the strum direction for visual feedback
            this.lastStrumDirection = direction;
            
            // Clear any existing timeout
            if (this.strumDisplayTimeout) {
                clearTimeout(this.strumDisplayTimeout);
            }
            
            // Set a timeout to clear the strum direction after 1 second
            this.strumDisplayTimeout = setTimeout(() => {
                this.lastStrumDirection = null;
            }, 1000);
            
            return strumInfo;
        }
        
        return null;
    }
    
    /**
     * Detect chord formation based on left hand finger positions
     * @returns {Object|null} Information about the detected chord
     */
    detectChordFormation() {
        // Left hand is always used for chord formation (appears on right side of mirrored view)
        const chordHandType = 'right'; // In mirrored view, right hand is user's left hand
        const chordHand = this.hands[chordHandType];
        
        if (!chordHand) return null;
        
        const landmarks = chordHand.keypoints;
        
        // Basic chord detection logic - this is a simplification
        // Real chord detection would be more complex based on relative finger positions
        
        // Get fingertip positions
        const thumbTip = landmarks[FINGER_LANDMARKS.THUMB.TIP];
        const indexTip = landmarks[FINGER_LANDMARKS.INDEX.TIP];
        const middleTip = landmarks[FINGER_LANDMARKS.MIDDLE.TIP];
        const ringTip = landmarks[FINGER_LANDMARKS.RING.TIP];
        const pinkyTip = landmarks[FINGER_LANDMARKS.PINKY.TIP];
        
        // Calculate distances between fingertips
        const indexToThumb = this.calculateDistance(indexTip, thumbTip);
        const middleToThumb = this.calculateDistance(middleTip, thumbTip);
        const ringToThumb = this.calculateDistance(ringTip, thumbTip);
        const pinkyToThumb = this.calculateDistance(pinkyTip, thumbTip);
        
        // Simple chord detection based on finger patterns
        let chord = { name: 'Unknown', confidence: 0.3 };
        
        // This is just a placeholder - real implementation would be more sophisticated
        if (indexToThumb < 50 && middleToThumb > 80 && ringToThumb > 80) {
            chord = { name: 'C Major', confidence: 0.7 };
        } else if (indexToThumb > 80 && middleToThumb < 50 && ringToThumb > 80) {
            chord = { name: 'G Major', confidence: 0.6 };
        } else if (indexToThumb > 80 && middleToThumb > 80 && ringToThumb < 50) {
            chord = { name: 'E Minor', confidence: 0.65 };
        }
        
        // Save the detected chord for visual feedback
        this.lastDetectedChord = chord;
        
        return chord;
    }
    
    /**
     * Calculate the distance between two 3D points with plane angle adjustment
     */
    calculateDistance(point1, point2) {
        if (!point1 || !point2) return 0;
        
        // Apply angle adjustment to y-coordinate
        // First convert from UI angle (where 90° is vertical) to internal angle (where 0° is horizontal)
        const internalAngle = this.guitarPlaneAngle - 90;
        const angleRadians = this.degreesToRadians(internalAngle);
        
        // Create copies of points to avoid modifying originals
        const p1 = { x: point1.x, y: point1.y, z: point1.z || 0 };
        const p2 = { x: point2.x, y: point2.y, z: point2.z || 0 };
        
        // Adjust y coordinates based on x position and angle
        // This simulates rotating the plane around the z-axis
        p1.y += p1.x * Math.tan(angleRadians);
        p2.y += p2.x * Math.tan(angleRadians);
        
        // Calculate Euclidean distance
        return Math.sqrt(
            Math.pow(p2.x - p1.x, 2) +
            Math.pow(p2.y - p1.y, 2) +
            Math.pow(p2.z - p1.z, 2)
        );
    }
    
    /**
     * Get hand orientation information
     * @returns {Object} Information about hand orientations
     */
    getHandOrientations() {
        const orientations = { left: null, right: null };
        
        // Process left hand (which is user's right hand in the mirror)
        if (this.hands.left) {
            orientations.left = this.calculateHandOrientation(this.hands.left);
        }
        
        // Process right hand (which is user's left hand in the mirror)
        if (this.hands.right) {
            orientations.right = this.calculateHandOrientation(this.hands.right);
        }
        
        return orientations;
    }
    
    /**
     * Calculate hand orientation with angle adjustment
     */
    calculateHandOrientation(hand) {
        if (!hand || !hand.keypoints3D) return { pitch: 0, roll: 0, yaw: 0 };
        
        const landmarks = hand.keypoints3D;
        
        // Get key points
        const wrist = landmarks[FINGER_LANDMARKS.WRIST];
        const indexBase = landmarks[FINGER_LANDMARKS.INDEX.BASE];
        const pinkyBase = landmarks[FINGER_LANDMARKS.PINKY.BASE];
        
        if (!wrist || !indexBase || !pinkyBase) return { pitch: 0, roll: 0, yaw: 0 };
        
        // Apply angle adjustment to y-coordinates
        // Convert from UI angle to internal angle system
        const internalAngle = this.guitarPlaneAngle - 90;
        const angleRadians = this.degreesToRadians(internalAngle);
        
        const adjustedWrist = { ...wrist };
        const adjustedIndexBase = { ...indexBase };
        const adjustedPinkyBase = { ...pinkyBase };
        
        // Adjust y values based on x position and plane angle
        adjustedWrist.y += adjustedWrist.x * Math.tan(angleRadians);
        adjustedIndexBase.y += adjustedIndexBase.x * Math.tan(angleRadians);
        adjustedPinkyBase.y += adjustedPinkyBase.x * Math.tan(angleRadians);
        
        // Calculate vectors
        const wristToIndex = {
            x: adjustedIndexBase.x - adjustedWrist.x,
            y: adjustedIndexBase.y - adjustedWrist.y,
            z: adjustedIndexBase.z - adjustedWrist.z
        };
        
        const wristToPinky = {
            x: adjustedPinkyBase.x - adjustedWrist.x,
            y: adjustedPinkyBase.y - adjustedWrist.y,
            z: adjustedPinkyBase.z - adjustedWrist.z
        };
        
        // Calculate normal vector to the palm plane
        const normal = {
            x: wristToIndex.y * wristToPinky.z - wristToIndex.z * wristToPinky.y,
            y: wristToIndex.z * wristToPinky.x - wristToIndex.x * wristToPinky.z,
            z: wristToIndex.x * wristToPinky.y - wristToIndex.y * wristToPinky.x
        };
        
        // Normalize normal vector
        const magnitude = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
        const normalizedNormal = {
            x: normal.x / magnitude,
            y: normal.y / magnitude,
            z: normal.z / magnitude
        };
        
        // Calculate Euler angles from normalized normal
        // Pitch: rotation around x-axis
        const pitch = Math.atan2(normalizedNormal.y, normalizedNormal.z);
        // Roll: rotation around y-axis
        const roll = Math.atan2(-normalizedNormal.x, Math.sqrt(normalizedNormal.y * normalizedNormal.y + normalizedNormal.z * normalizedNormal.z));
        // Yaw: rotation around z-axis
        const yaw = Math.atan2(wristToIndex.x, wristToIndex.y);
        
        return {
            pitch: pitch * (180 / Math.PI), // Convert to degrees
            roll: roll * (180 / Math.PI),
            yaw: yaw * (180 / Math.PI)
        };
    }

    /**
     * Perform a calibration process to help users verify hand tracking
     */
    async calibrate() {
        // Display calibration instructions on the canvas
        this.drawCalibrationInstructions();
        
        // Mark as not calibrated initially
        this.calibrated = false;
        
        // Start a calibration timer
        console.debug('Starting hand tracking calibration...');
        
        // Set a 5-second timer to check for hands
        const calibrationStart = Date.now();
        const calibrationDuration = 5000; // 5 seconds
        
        // Store hand detection count during calibration
        let leftHandDetections = 0;
        let rightHandDetections = 0;
        
        // Define the calibration check function
        const checkCalibration = async () => {
            if (!this.isRunning) return;
            
            try {
                // Process a frame to detect hands
                const detectedHands = await this.detector.estimateHands(
                    this.videoElement, 
                    this.processingOptions
                );
                
                // Process detected hands
                for (const hand of detectedHands) {
                    // Need to swap hands for detection since we're mirroring
                    const modelHandedness = hand.handedness.toLowerCase();
                    const correctedHandedness = modelHandedness === 'left' ? 'right' : 'left';
                    
                    // Count detections with corrected handedness
                    if (correctedHandedness === 'left') leftHandDetections++;
                    if (correctedHandedness === 'right') rightHandDetections++;
                }
                
                // Calculate calibration progress
                const elapsed = Date.now() - calibrationStart;
                const progress = Math.min(1, elapsed / calibrationDuration);
                
                // Update calibration UI
                this.drawCalibrationProgress(progress, leftHandDetections, rightHandDetections);
                
                // Continue calibration if not complete
                if (elapsed < calibrationDuration) {
                    requestAnimationFrame(checkCalibration);
                } else {
                    // Calibration complete
                    const success = leftHandDetections > 0 && rightHandDetections > 0;
                    this.calibrated = success;
                    
                    // Draw final calibration result
                    this.drawCalibrationResult(success, leftHandDetections, rightHandDetections);
                    
                    console.debug(`Calibration complete: ${success ? 'SUCCESS' : 'FAILED'}`);
                    console.debug(`Left hand detections: ${leftHandDetections}`);
                    console.debug(`Right hand detections: ${rightHandDetections}`);
                    
                    // Return the result
                    return {
                        success,
                        leftHandDetections,
                        rightHandDetections
                    };
                }
            } catch (error) {
                console.error('Error during calibration:', error);
                this.drawCalibrationError(error.message);
                return {
                    success: false,
                    error: error.message
                };
            }
        };
        
        // Start the calibration check
        return checkCalibration();
    }

    /**
     * Draw calibration instructions on the canvas
     */
    drawCalibrationInstructions() {
        const centerX = this.canvasElement.width / 2;
        const centerY = this.canvasElement.height / 2;
        const width = this.canvasElement.width;
        const height = this.canvasElement.height;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // Background for instructions
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // Draw basic guitar layout
        // Neck area (right side)
        this.ctx.fillStyle = 'rgba(139, 69, 19, 0.3)'; // Brown
        this.ctx.fillRect(centerX, 150, width - centerX, height - 300);
        this.ctx.strokeStyle = 'rgba(139, 69, 19, 0.7)';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(centerX, 150, width - centerX, height - 300);
        
        // Body area (left side)
        this.ctx.fillStyle = 'rgba(160, 82, 45, 0.3)'; // Sienna
        this.ctx.fillRect(0, 150, centerX, height - 300);
        this.ctx.strokeStyle = 'rgba(160, 82, 45, 0.7)';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(0, 150, centerX, height - 300);
        
        // Draw a few frets
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 2;
        for (let i = 1; i < 4; i++) {
            const x = centerX + i * ((width - centerX) / 4);
            this.ctx.beginPath();
            this.ctx.moveTo(x, 150);
            this.ctx.lineTo(x, height - 150);
            this.ctx.stroke();
        }
        
        // Draw a few strings
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        for (let i = 0; i < 6; i++) {
            const y = 150 + i * ((height - 300) / 5);
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
        
        // Draw sound hole
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.beginPath();
        this.ctx.arc(centerX * 0.5, centerY, 70, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Title
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Air Guitar - Hand Positioning Guide', centerX, 60);
        
        // Draw instructions with better visual distinction
        this.ctx.font = '18px Arial';
        this.ctx.fillText('Your view is mirrored like a mirror', centerX, 110);
        
        // Left hand instructions (right side of screen)
        this.ctx.font = 'bold 20px Arial';
        this.ctx.fillStyle = 'rgba(255, 220, 120, 0.9)';
        this.ctx.fillText('GUITAR NECK', centerX + (width - centerX) / 2, 130);
        this.ctx.font = '18px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('Left hand forms chord shapes here', centerX + (width - centerX) / 2, height - 130);
        
        // Right hand instructions (left side of screen)
        this.ctx.font = 'bold 20px Arial';
        this.ctx.fillStyle = 'rgba(255, 220, 120, 0.9)';
        this.ctx.fillText('GUITAR BODY', centerX / 2, 130);
        this.ctx.font = '18px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('Right hand strums here', centerX / 2, height - 130);
        
        // Draw hand position guides with clear labels
        // Left hand guide (on right side in mirrored view)
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.canvasElement.width * 0.75, 
            centerY, 
            80, 100, 0, 0, Math.PI * 2
        );
        this.ctx.stroke();
        
        // Add a hand icon or clear indicator
        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
        this.ctx.fill();
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('LEFT HAND', this.canvasElement.width * 0.75, centerY);
        
        // Right hand guide (on left side in mirrored view)
        this.ctx.strokeStyle = 'rgba(0, 150, 255, 0.7)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.canvasElement.width * 0.25, 
            centerY, 
            80, 100, 0, 0, Math.PI * 2
        );
        this.ctx.stroke();
        
        // Add a hand icon or clear indicator
        this.ctx.fillStyle = 'rgba(0, 150, 255, 0.3)';
        this.ctx.fill();
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('RIGHT HAND', this.canvasElement.width * 0.25, centerY);
        
        // Draw distance indicator between hands
        this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]); // Create dashed line
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvasElement.width * 0.25, centerY);
        this.ctx.lineTo(this.canvasElement.width * 0.75, centerY);
        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset to solid line
        
        // Add distance explanation for pitch control
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.fillText('Hand Distance = Pitch Control', centerX, centerY - 80);
        
        // Add explanatory text
        this.ctx.font = '16px Arial';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.fillText('Hands far apart = low pitch (open strings)', centerX, centerY - 50);
        this.ctx.fillText('Hands close together = high pitch (high frets)', centerX, centerY - 25);
        
        // Add example arrows for hand distance
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.6)';
        // Low pitch arrow
        this.ctx.beginPath();
        this.ctx.moveTo(centerX * 0.85, centerY + 30);
        this.ctx.lineTo(centerX * 0.95, centerY + 50);
        this.ctx.lineTo(centerX * 0.75, centerY + 50);
        this.ctx.fill();
        // High pitch arrow
        this.ctx.beginPath();
        this.ctx.moveTo(centerX * 1.15, centerY + 30);
        this.ctx.lineTo(centerX * 1.05, centerY + 50);
        this.ctx.lineTo(centerX * 1.25, centerY + 50);
        this.ctx.fill();
        
        // Arrow labels
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.font = '14px Arial';
        this.ctx.fillText('Move away for', centerX * 0.85, centerY + 70);
        this.ctx.fillText('lower notes', centerX * 0.85, centerY + 90);
        
        this.ctx.fillText('Move closer for', centerX * 1.15, centerY + 70);
        this.ctx.fillText('higher notes', centerX * 1.15, centerY + 90);
    }

    /**
     * Draw calibration progress on the canvas
     */
    drawCalibrationProgress(progress, leftDetections, rightDetections) {
        const centerX = this.canvasElement.width / 2;
        const bottom = this.canvasElement.height - 40;
        
        // Draw progress bar background
        this.ctx.fillStyle = 'rgba(100, 100, 100, 0.7)';
        this.ctx.fillRect(centerX - 150, bottom, 300, 20);
        
        // Draw progress bar
        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
        this.ctx.fillRect(centerX - 150, bottom, 300 * progress, 20);
        
        // Draw progress text
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`Calibrating... ${Math.round(progress * 100)}%`, centerX, bottom - 10);
        
        // Draw detection counts
        this.ctx.fillText(`Left hand detections: ${leftDetections}`, centerX - 150, bottom - 40);
        this.ctx.fillText(`Right hand detections: ${rightDetections}`, centerX + 150, bottom - 40);
    }

    /**
     * Draw calibration result on the canvas
     */
    drawCalibrationResult(success, leftDetections, rightDetections) {
        const centerX = this.canvasElement.width / 2;
        const centerY = this.canvasElement.height / 2;
        
        // Draw result background
        this.ctx.fillStyle = success ? 'rgba(0, 100, 0, 0.7)' : 'rgba(100, 0, 0, 0.7)';
        this.ctx.fillRect(centerX - 200, centerY - 100, 400, 200);
        
        // Draw result text
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            success ? 'Calibration Successful!' : 'Calibration Failed',
            centerX, 
            centerY - 60
        );
        
        // Draw detection counts
        this.ctx.font = '18px Arial';
        this.ctx.fillText(`Left hand detections: ${leftDetections}`, centerX, centerY);
        this.ctx.fillText(`Right hand detections: ${rightDetections}`, centerX, centerY + 40);
        
        // Draw suggestions if calibration failed
        if (!success) {
            this.ctx.font = '16px Arial';
            this.ctx.fillText('Please ensure both hands are visible to the camera', centerX, centerY + 80);
            this.ctx.fillText('and try calibrating again.', centerX, centerY + 110);
        }
    }

    /**
     * Draw calibration error on the canvas
     */
    drawCalibrationError(errorMessage) {
        const centerX = this.canvasElement.width / 2;
        const centerY = this.canvasElement.height / 2;
        
        // Draw error background
        this.ctx.fillStyle = 'rgba(100, 0, 0, 0.7)';
        this.ctx.fillRect(centerX - 200, centerY - 100, 400, 200);
        
        // Draw error text
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Calibration Error', centerX, centerY - 60);
        
        // Draw error message
        this.ctx.font = '16px Arial';
        
        // Split error message into multiple lines if needed
        const words = errorMessage.split(' ');
        let line = '';
        let y = centerY - 20;
        
        for (const word of words) {
            const testLine = line + word + ' ';
            if (testLine.length > 40) {
                this.ctx.fillText(line, centerX, y);
                line = word + ' ';
                y += 25;
            } else {
                line = testLine;
            }
        }
        
        this.ctx.fillText(line, centerX, y);
        
        // Draw suggestions
        this.ctx.fillText('Please check your camera and browser permissions', centerX, centerY + 80);
        this.ctx.fillText('and try again.', centerX, centerY + 110);
    }
} 