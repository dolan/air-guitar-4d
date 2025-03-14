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
        if (!this.isActive) {
            // console.debug('Motion analysis is not active, skipping hand data processing');
            return null;
        }
        
        if (!handData) {
            // console.debug('No hand data provided, skipping processing');
            return null;
        }
        
        // Store current hand data for comparison
        const previousHandData = this.lastHandData;
        this.lastHandData = handData;
        
        // Initialize result object
        const result = {
            strumDetected: false,
            strumDirection: null,
            strumIntensity: 0,
            fretPosition: this.lastFretPosition,
            chordType: this.lastDetectedChord ? this.lastDetectedChord.name : 'none'
        };
        
        // Process chord formation (left hand)
        if (chordData && chordData.name !== 'Unknown') {
            if (!this.lastDetectedChord || this.lastDetectedChord.name !== chordData.name) {
                // Chord has changed
                this.lastDetectedChord = chordData;
                result.chordType = chordData.name;
                
                // Trigger chord change callback
                if (this.onChordChanged) {
                    // console.debug(`Chord changed to: ${chordData.name}`);
                    this.onChordChanged(chordData);
                }
            }
        }
        
        // Determine fret position based on distance between hands
        // When hands are far apart (normal playing position), fret position is low (open strings)
        // When fret hand moves closer to strumming hand, fret position increases (higher up the neck)
        if (handData.left && handData.right) {
            // Get wrist positions for both hands and apply smoothing
            const rawStrumWrist = handData.left.keypoints[0]; // Left hand in the mirrored view (right hand in reality)
            const rawFretWrist = handData.right.keypoints[0]; // Right hand in the mirrored view (left hand in reality)
            
            // Apply smoothing filter for more stable positions
            const strumWrist = this.smoothMotion('left', rawStrumWrist);
            const fretWrist = this.smoothMotion('right', rawFretWrist);
            
            // Calculate distance between hands (using smoothed positions)
            const distance = Math.sqrt(
                Math.pow(strumWrist.x - fretWrist.x, 2) + 
                Math.pow(strumWrist.y - fretWrist.y, 2)
            );
            
            // Get canvas dimensions for normalization
            const canvas = document.getElementById('overlay');
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const maxPossibleDistance = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight);
            
            // Normalize distance to 0-1 range
            const normalizedDistance = Math.min(1, distance / (maxPossibleDistance * 0.7));
            
            // Calculate fret position (0-12) based on normalized distance
            // When hands are close, fret position is high
            // When hands are far apart, fret position is low
            const fretPosition = Math.min(12, Math.max(0, Math.round((1 - normalizedDistance) * 12)));
            
            console.debug(`Hand distance: ${distance.toFixed(2)}px, Normalized: ${normalizedDistance.toFixed(2)}, Fret position: ${fretPosition}`);
            
            this.lastFretPosition = fretPosition;
            result.fretPosition = fretPosition;
        } else if (handData.left) {
            // Only strumming hand visible - keep the last fret position
            // This allows playing while moving the strumming hand without losing fret position
            result.fretPosition = this.lastFretPosition;
        }
        
        // Process strumming motion (right hand)
        if (strummingMotion) {
            const now = Date.now();
            
            // Check if we've passed the cooldown period to prevent multiple strums
            if (now - this.lastStrumTime > this.strumCooldown) {
                console.debug(`Strum detected! Direction: ${strummingMotion.direction}, Time since last strum: ${now - this.lastStrumTime}ms`);
                
                result.strumDetected = true;
                result.strumDirection = strummingMotion.direction;
                result.strumIntensity = strummingMotion.intensity;
                
                this.lastStrumTime = now;
                
                // Trigger strum callback
                if (this.onStrumDetected) {
                    // console.debug('Calling strum callback with result data');
                    this.onStrumDetected(result);
                } else {
                    // console.warn('No strum callback registered!');
                }
            } else {
                console.debug(`Strum cooldown active. Time since last strum: ${now - this.lastStrumTime}ms`);
            }
        }
        
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