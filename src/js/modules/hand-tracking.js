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
        
        // Configuration options
        this.modelConfig = {
            runtime: 'mediapipe', // Use mediapipe runtime which works better in browser
            modelType: 'full', // 'lite' for better performance but less accuracy
            maxHands: 2,
            solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915', // Specify exact version
            scoreThreshold: 0.5
        };
        
        // Frame processing options
        this.processingOptions = {
            flipHorizontal: true  // Mirror image for more intuitive interaction
        };
        
        // Guitar plane angle adjustment (in degrees)
        this.guitarPlaneAngle = 0;
        
        // Initialize TensorFlow.js when constructed
        this.tfReady = false;
        this._initTensorFlow();
    }
    
    /**
     * Set the guitar plane angle
     * @param {number} angle - Angle in degrees to adjust the guitar plane (-10 to 10)
     */
    setGuitarPlaneAngle(angle) {
        // Clamp angle to valid range
        this.guitarPlaneAngle = Math.max(-10, Math.min(10, angle));
        console.debug(`Guitar plane angle set to ${this.guitarPlaneAngle}°`);
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
            console.debug('Initializing TensorFlow.js...');
            // Wait for TensorFlow to be ready
            if (window.tf) {
                await window.tf.ready();
                this.tfReady = true;
                console.debug('TensorFlow.js initialized successfully');
            } else {
                console.error('TensorFlow.js not found in global scope');
            }
        } catch (error) {
            console.error('Error initializing TensorFlow:', error);
        }
    }
    
    /**
     * Initialize the hand tracking model
     */
    async setup() {
        try {
            console.log('Setting up hand tracking with MediaPipe Hands...');
            
            // Make sure TensorFlow is ready
            if (!this.tfReady && window.tf) {
                console.debug('Waiting for TensorFlow.js to be ready...');
                await window.tf.ready();
                this.tfReady = true;
                console.debug('TensorFlow.js now ready');
            }

            // Force backend to WebGL for better performance
            if (window.tf && window.tf.setBackend) {
                try {
                    await window.tf.setBackend('webgl');
                    console.debug('Set TensorFlow backend to WebGL');
                } catch (backendError) {
                    console.warn('Could not set backend to WebGL:', backendError.message);
                }
            }
            
            // Detailed diagnostics for libraries
            console.debug('Library availability check:');
            console.debug('- TensorFlow:', typeof window.tf !== 'undefined');
            console.debug('- tf.ready function:', typeof window.tf?.ready === 'function');
            console.debug('- tf.getBackend:', typeof window.tf?.getBackend === 'function');
            if (typeof window.tf?.getBackend === 'function') {
                console.debug('- Current backend:', window.tf.getBackend());
            }
            console.debug('- handPoseDetection:', typeof window.handPoseDetection !== 'undefined');
            
            // Wait for the handPoseDetection library to be loaded in the global scope
            if (!window.handPoseDetection) {
                console.error('Hand pose detection library not found');
                throw new Error('Hand pose detection library not loaded');
            }
            
            console.debug('Hand pose detection library is available');
            console.debug('- MediaPipe Hands model:', typeof window.handPoseDetection.SupportedModels?.MediaPipeHands);
            console.debug('- createDetector function:', typeof window.handPoseDetection.createDetector);
            
            // Use a more compatible configuration
            const updatedConfig = {
                runtime: 'mediapipe',
                modelType: 'lite', // Change to lite for better compatibility
                maxHands: 2,
                solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915',
                scoreThreshold: 0.5
            };

            console.debug('Using updated model configuration:', updatedConfig);
            this.modelConfig = updatedConfig;

            // Attempt to create detector with timeout and retry
            console.debug('Creating hand pose detector...');

            // Create a promise with timeout
            const createDetectorWithTimeout = async (timeout = 10000) => {
                return Promise.race([
                    window.handPoseDetection.createDetector(
                        window.handPoseDetection.SupportedModels.MediaPipeHands,
                        this.modelConfig
                    ),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Detector creation timed out')), timeout)
                    )
                ]);
            };

            // Try up to 3 times to create the detector
            let attempts = 0;
            let detectorCreated = false;

            while (attempts < 3 && !detectorCreated) {
                attempts++;
                try {
                    console.debug(`Detector creation attempt ${attempts}...`);
                    this.detector = await createDetectorWithTimeout();
                    if (this.detector) {
                        detectorCreated = true;
                        console.debug('Detector created successfully:', !!this.detector);
                    } else {
                        console.warn('Detector creation returned null or undefined');
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
                throw new Error('Hand pose detector was not created properly');
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
                    window.handPoseDetection.SupportedModels.MediaPipeHands,
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
     * @param {boolean} isMirrored - Whether the view should be mirrored
     */
    setMirrored(isMirrored) {
        this.processingOptions.flipHorizontal = isMirrored;
        console.debug(`Hand tracking mirror mode ${isMirrored ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Process a single video frame to detect and track hands
     * @returns {Object} Detected hand data
     */
    async processFrame() {
        // More detailed check for why processing might be skipped
        if (!this.detector) {
            console.warn('Processing skipped: detector not initialized yet');
            
            // If setup has been called but detector is still null, try to create it again
            if (this.tfReady) {
                console.debug('TensorFlow is ready but detector is null, attempting to initialize detector again...');
                try {
                    await this.setup();
                    if (this.detector) {
                        console.debug('Detector successfully initialized on retry!');
                    }
                } catch (error) {
                    console.error('Failed to initialize detector on retry:', error.message);
                }
            }
            
            return null;
        }
        
        if (!this.isRunning) {
            console.debug('Processing skipped: tracking not running (isRunning=false)');
            return null;
        }
        
        try {
            // Draw a visual indicator that the frame processing is active
            this.drawDebugInfo();
            
            // Store previous frame data
            this.lastFrameHands = { ...this.hands };
            
            console.debug('===== FRAME PROCESSING START =====');
            console.debug('Video element ready state:', this.videoElement.readyState);
            console.debug('Video dimensions:', this.videoElement.videoWidth, 'x', this.videoElement.videoHeight);
            
            // Check if video is actually ready
            if (this.videoElement.readyState < 2) { // HAVE_CURRENT_DATA
                console.debug('Video not ready yet, skipping hand detection');
                return null;
            }
            
            // Detect hands in the current frame
            console.debug('Calling hand pose detector...');
            const detectedHands = await this.detector.estimateHands(
                this.videoElement, 
                this.processingOptions
            );
            
            console.debug(`Detected ${detectedHands.length} hands:`, detectedHands);
            
            // Reset current hands
            this.hands = { left: null, right: null };
            
            // Process detected hands
            for (const hand of detectedHands) {
                // Swap hands based on mirroring setting
                const modelHandedness = hand.handedness.toLowerCase();
                let correctedHandedness;
                
                if (this.processingOptions.flipHorizontal) {
                    // If mirrored, swap left/right as the user sees their hands mirrored
                    correctedHandedness = modelHandedness === 'left' ? 'right' : 'left';
                } else {
                    // If not mirrored, use the model's handedness directly
                    correctedHandedness = modelHandedness;
                }
                
                // Store the hand with the corrected handedness
                this.hands[correctedHandedness] = hand;
                
                console.debug(`Detected ${modelHandedness} hand (displayed as ${correctedHandedness}) with score: ${hand.score}`);
                console.debug(`Hand has ${hand.keypoints.length} keypoints`);
                
                // Log a few keypoints for verification
                if (hand.keypoints.length > 0) {
                    console.debug('Wrist position:', hand.keypoints[0]);
                    console.debug('Index fingertip:', hand.keypoints[8]);
                }
            }
            
            // Draw landmarks on canvas
            if (detectedHands.length > 0) {
                console.debug('Drawing hand landmarks on canvas');
                this.drawHandLandmarks();
            } else {
                console.debug('No hands to draw');
            }
            
            console.debug('===== FRAME PROCESSING END =====');
            
            return this.hands;
        } catch (error) {
            console.error('Error processing hand tracking frame:', error);
            return null;
        }
    }
    
    /**
     * Draw debug information on the canvas
     */
    drawDebugInfo() {
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // Draw a border to show the canvas is active
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // Draw crosshairs in the center
        const centerX = this.canvasElement.width / 2;
        const centerY = this.canvasElement.height / 2;
        
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - 50, centerY);
        this.ctx.lineTo(centerX + 50, centerY);
        this.ctx.moveTo(centerX, centerY - 50);
        this.ctx.lineTo(centerX, centerY + 50);
        this.ctx.stroke();
        
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
     * Draw the detected hand landmarks on the canvas
     */
    drawHandLandmarks() {
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
        
        // Draw a diagonal line across the entire canvas
        this.ctx.strokeStyle = 'yellow';
        this.ctx.lineWidth = 5;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(canvas.width, canvas.height);
        this.ctx.stroke();
        
        // Now draw the hands
        // Process both hands
        for (const handType of ['left', 'right']) {
            const hand = this.hands[handType];
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
                
                // Coordinate adjustments based on flip setting are now handled in CSS
                // The canvas transformation is already applied via CSS transform
                const x = wrist.x;
                const y = this.canvasElement.height - wrist.y; // Flip Y coordinate
                
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
                
                // The canvas transform handles horizontal flipping via CSS
                // We only need to handle the Y flip here
                const adjustedY = this.canvasElement.height - y;
                
                // Draw dot
                this.ctx.fillStyle = handColor;
                this.ctx.beginPath();
                this.ctx.arc(x, adjustedY, 8, 0, 2 * Math.PI);
                this.ctx.fill();
                
                // Draw keypoint index for debugging
                this.ctx.fillStyle = 'white';
                this.ctx.font = '12px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(index.toString(), x, adjustedY + 5);
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
                        
                        // Apply the Y-flip but let CSS handle X-flip
                        const startY = this.canvasElement.height - startPoint.y;
                        const endY = this.canvasElement.height - endPoint.y;
                        
                        this.ctx.beginPath();
                        this.ctx.moveTo(startPoint.x, startY);
                        this.ctx.lineTo(endPoint.x, endY);
                        this.ctx.stroke();
                    }
                });
            }
        }
    }
    
    /**
     * Detect if a strumming motion is being performed
     * @returns {Object|null} Information about the strumming motion if detected
     */
    detectStrummingMotion() {
        // Determine which hand to use for strumming based on mirror setting
        const strummingHandType = this.processingOptions.flipHorizontal ? 'left' : 'right';
        const strummingHand = this.hands[strummingHandType];
        const prevStrummingHand = this.lastFrameHands[strummingHandType];
        
        if (!strummingHand || !prevStrummingHand) return null;
        
        // Get the wrist position
        const wrist = strummingHand.keypoints[FINGER_LANDMARKS.WRIST];
        const prevWrist = prevStrummingHand.keypoints[FINGER_LANDMARKS.WRIST];
        
        // Calculate vertical movement (Y-axis)
        const yMovement = wrist.y - prevWrist.y;
        
        // Detect strumming motion (significant vertical movement)
        const STRUM_THRESHOLD = 15; // Minimum pixels to consider as strumming
        
        if (Math.abs(yMovement) > STRUM_THRESHOLD) {
            return {
                direction: yMovement > 0 ? 'down' : 'up',
                intensity: Math.abs(yMovement) / 50, // Normalize between 0-1 (approximate)
                position: wrist
            };
        }
        
        return null;
    }
    
    /**
     * Detect chord formation based on left hand finger positions
     * @returns {Object|null} Information about the detected chord
     */
    detectChordFormation() {
        // Determine which hand to use for chord formation based on mirror setting
        const chordHandType = this.processingOptions.flipHorizontal ? 'right' : 'left';
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
        // This is just a placeholder - real implementation would be more sophisticated
        if (indexToThumb < 50 && middleToThumb > 80 && ringToThumb > 80) {
            return { name: 'C Major', confidence: 0.7 };
        } else if (indexToThumb > 80 && middleToThumb < 50 && ringToThumb > 80) {
            return { name: 'G Major', confidence: 0.6 };
        } else if (indexToThumb > 80 && middleToThumb > 80 && ringToThumb < 50) {
            return { name: 'E Minor', confidence: 0.65 };
        }
        
        return { name: 'Unknown', confidence: 0.3 };
    }
    
    /**
     * Calculate the distance between two 3D points with plane angle adjustment
     */
    calculateDistance(point1, point2) {
        if (!point1 || !point2) return 0;
        
        // Apply angle adjustment to y-coordinate
        // For a positive angle, we lower the effective y position of points higher up
        // (smaller y values) and raise the effective position of points lower down
        const angleRadians = this.degreesToRadians(this.guitarPlaneAngle);
        
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
        const angleRadians = this.degreesToRadians(this.guitarPlaneAngle);
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
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        const centerX = this.canvasElement.width / 2;
        const centerY = this.canvasElement.height / 2;
        
        // Draw semi-transparent background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // Draw title
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Hand Tracking Calibration', centerX, 60);
        
        // Draw instructions
        this.ctx.font = '18px Arial';
        this.ctx.fillText('Please position both hands in front of the camera', centerX, centerY - 40);
        this.ctx.fillText('Left hand: form chord shapes', centerX, centerY);
        this.ctx.fillText('Right hand: perform strumming motions', centerX, centerY + 40);
        
        // Draw hand position guides
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
        this.ctx.lineWidth = 2;
        
        // Left hand guide
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.canvasElement.width * 0.25, 
            centerY, 
            80, 100, 0, 0, Math.PI * 2
        );
        this.ctx.stroke();
        this.ctx.fillText('Left', this.canvasElement.width * 0.25, centerY - 120);
        
        // Right hand guide
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.canvasElement.width * 0.75, 
            centerY, 
            80, 100, 0, 0, Math.PI * 2
        );
        this.ctx.stroke();
        this.ctx.fillText('Right', this.canvasElement.width * 0.75, centerY - 120);
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