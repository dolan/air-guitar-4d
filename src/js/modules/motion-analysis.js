/**
 * Motion Analysis Module
 * 
 * Analyzes hand tracking data to determine gesture types, strumming motions,
 * fretboard positioning, and other guitar-playing movements
 */

export class MotionAnalysis {
    constructor() {
        this.isActive = false;
        this.lastHandData = null;
        
        // Calibration thresholds
        this.strumThreshold = 25; // Minimum pixels movement to consider as strumming
        this.strumCooldown = 120; // Milliseconds to wait between strums (reduced from 400ms)
        this.lastStrumTime = 0;
        
        // Track detected patterns
        this.lastDetectedChord = null;
        this.lastFretPosition = 0;
        
        // For note positioning on virtual fretboard
        this.fretboardPositions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        
        // Motion smoothing filters
        this.handPositions = {
            left: { x: [], y: [] },
            right: { x: [], y: [] }
        };
        this.smoothingWindow = 3; // Number of frames to average for smoothing
        
        // Callbacks
        this.onStrumDetected = null;
        this.onChordChanged = null;
    }
    
    /**
     * Initialize the motion analysis system
     */
    setup() {
        this.isActive = true;
        console.log('Motion analysis system initialized');
        return true;
    }
    
    /**
     * Set callback for strum detection
     */
    setStrumCallback(callback) {
        this.onStrumDetected = callback;
    }
    
    /**
     * Set callback for chord changes
     */
    setChordCallback(callback) {
        this.onChordChanged = callback;
    }
    
    /**
     * Process new hand tracking data to detect guitar-playing motions
     * @param {Object} handData - The detected hand landmarks from hand tracking
     * @param {Object} strummingMotion - Strumming motion data from hand tracking
     * @param {Object} chordData - Chord formation data from hand tracking
     * @param {Object} orientations - Hand orientation data
     * @returns {Object} Analysis results including strum events, fret positions, etc.
     */
    processHandData(handData, strummingMotion, chordData, orientations) {
        // Skip if not active
        if (!this.isActive) {
            // console.debug('Motion analysis is not active, skipping hand data processing');
            return null;
        }
        
        // Skip if no hand data
        if (!handData) {
            // console.debug('No hand data provided, skipping processing');
            return null;
        }
        
        // Store current timestamp
        const now = Date.now();
        
        // Store context data for later processing
        const motionContext = {
            timestamp: now,
            timeSinceLastProcess: now - this.lastProcessTime,
            hands: handData,
            strummingMotion,
            chordData,
            orientations
        };
        
        // Update the motion history with new data
        this.updateMotionHistory(motionContext);
        
        // Create results object for this frame
        const result = {
            timestamp: now,
            strumDetected: false,
            chordType: 'none',
            fretPosition: 0,
            strumDirection: null,
            strumIntensity: 0
        };
        
        // Update chord detection
        if (chordData && chordData.name && chordData.name !== 'Unknown') {
            // Track chord changes
            if (this.currentChord !== chordData.name) {
                // console.debug(`Chord changed to: ${chordData.name}`);
                this.currentChord = chordData.name;
            }
            
            result.chordType = chordData.name;
        }
        
        // Detect fret position from left hand (need to be more sophisticated in the future)
        if (handData.leftHand) {
            // Just a simple mapping of x position to fret for now
            // We can make this much more sophisticated later
            const wristX = handData.leftHand.keypoints[0].x;
            const screenWidth = window.innerWidth;
            
            // Calculate distance from left edge as percentage of screen width
            const distance = wristX;
            const normalizedDistance = distance / screenWidth;
            
            // Map to fret positions (0-12)
            // Lower fret numbers are on the right side of the screen (because video is mirrored)
            const fretPosition = Math.round(normalizedDistance * 12);
            
            // Store result
            result.fretPosition = fretPosition;
            
            // console.debug(`Hand distance: ${distance.toFixed(2)}px, Normalized: ${normalizedDistance.toFixed(2)}, Fret position: ${fretPosition}`);
        }
        
        // Process strumming motion
        if (strummingMotion && now - this.lastStrumTime > this.strumCooldownMs) {
            result.strumDetected = true;
            result.strumDirection = strummingMotion.direction;
            result.strumIntensity = strummingMotion.intensity || 0.8; // Default to medium-high intensity
            
            // Calculate actual intensity based on motion speed
            if (strummingMotion.speed) {
                result.strumIntensity = Math.min(1.0, strummingMotion.speed / 100);
            }
            
            // console.debug(`Strum detected! Direction: ${strummingMotion.direction}, Time since last strum: ${now - this.lastStrumTime}ms`);
            
            // Call registered callback if available
            if (typeof this.strumCallback === 'function') {
                // console.debug('Calling strum callback with result data');
                this.strumCallback(result);
            }
            
            // Update last strum time
            this.lastStrumTime = now;
        } else if (strummingMotion) {
            // console.debug(`Strum cooldown active. Time since last strum: ${now - this.lastStrumTime}ms`);
        }
        
        // Update last process time
        this.lastProcessTime = now;
        
        return result;
    }
    
    /**
     * Analyze hand orientation for technique detection
     * (e.g., palm muting, finger picking, etc.)
     */
    analyzeTechnique(orientations) {
        if (!orientations || !orientations.right) return 'normal';
        
        // Determine technique based on hand orientation
        // This is a simplified approach
        const rightOrientation = orientations.right;
        
        if (rightOrientation.isPalmFacingCamera) {
            return 'palm_mute';
        } else if (Math.abs(rightOrientation.angle) > 45) {
            return 'finger_pick';
        }
        
        return 'normal';
    }
    
    /**
     * Apply smoothing filter to hand motion data
     * @param {string} hand - 'left' or 'right' hand
     * @param {Object} position - Position with x and y coordinates
     * @returns {Object} Smoothed position
     */
    smoothMotion(hand, position) {
        if (!position) return null;
        
        // Add current position to the history
        this.handPositions[hand].x.push(position.x);
        this.handPositions[hand].y.push(position.y);
        
        // Keep only the most recent positions within the smoothing window
        if (this.handPositions[hand].x.length > this.smoothingWindow) {
            this.handPositions[hand].x.shift();
            this.handPositions[hand].y.shift();
        }
        
        // Calculate the average position
        const smoothedX = this.handPositions[hand].x.reduce((sum, val) => sum + val, 0) / 
                         this.handPositions[hand].x.length;
        const smoothedY = this.handPositions[hand].y.reduce((sum, val) => sum + val, 0) / 
                         this.handPositions[hand].y.length;
        
        return { x: smoothedX, y: smoothedY };
    }
    
    /**
     * Reset the analysis state
     */
    reset() {
        this.lastHandData = null;
        this.lastDetectedChord = null;
        this.lastFretPosition = 0;
        this.lastStrumTime = 0;
        
        // Clear smoothing buffers
        this.handPositions = {
            left: { x: [], y: [] },
            right: { x: [], y: [] }
        };
    }
} 