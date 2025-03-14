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
        this.strumThreshold = 15; // Minimum pixels movement to consider as strumming
        this.strumCooldown = 300; // Milliseconds to wait between strums
        this.lastStrumTime = 0;
        
        // Track detected patterns
        this.lastDetectedChord = null;
        this.lastFretPosition = 0;
        
        // For note positioning on virtual fretboard
        this.fretboardPositions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        
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
            console.debug('Motion analysis is not active, skipping hand data processing');
            return null;
        }
        
        if (!handData) {
            console.debug('No hand data provided, skipping processing');
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
                    console.debug(`Chord changed to: ${chordData.name}`);
                    this.onChordChanged(chordData);
                }
            }
        }
        
        // Analyze left hand position for fret position
        if (handData.left) {
            // Use hand Y position to determine fret position
            // This is a simplified approach - real implementation would be more complex
            const wristY = handData.left.keypoints[0].y; // Wrist landmark
            
            // Map Y position to fret (0-12)
            // Assuming screen coordinate system where top = 0, bottom = canvas height
            const canvasHeight = document.getElementById('overlay').height;
            const relativeY = wristY / canvasHeight;
            
            // Map relative Y position (0-1) to fret positions (0-12)
            // Reverse the mapping so that higher up on screen = higher fret number
            const fretPosition = Math.min(12, Math.max(0, Math.round((1 - relativeY) * 12)));
            
            this.lastFretPosition = fretPosition;
            result.fretPosition = fretPosition;
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
                    console.debug('Calling strum callback with result data');
                    this.onStrumDetected(result);
                } else {
                    console.warn('No strum callback registered!');
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
     * Reset the analysis state
     */
    reset() {
        this.lastHandData = null;
        this.lastDetectedChord = null;
        this.lastFretPosition = 0;
        this.lastStrumTime = 0;
    }
} 