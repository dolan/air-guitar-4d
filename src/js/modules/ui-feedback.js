/**
 * UI Feedback Module
 * 
 * Provides visual feedback to the user based on their hand movements
 * and guitar playing actions
 */

export class UIFeedback {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.isActive = false;
        this.handPositions = null;
        
        // Visual feedback elements
        this.fretboardHeight = 150;
        this.stringCount = 6;
        this.fretCount = 12;
        
        // Guitar overlay positioning (add additional gutter space)
        this.topGutterPercentage = 0.25;    // 25% gutter at the top
        this.bottomGutterPercentage = 0.25; // 25% gutter at the bottom
        
        // Animation properties
        this.strumAnimationDuration = 500; // ms
        this.strumAnimationStartTime = 0;
        this.isStrumAnimationActive = false;
        this.strumDirection = 'down';
        
        // Feedback messages
        this.feedbackMessage = '';
        this.messageDuration = 2000; // ms
        this.messageStartTime = 0;
        
        // Guitar position guide
        this.showPositionGuide = true;
        
        // Current chord and fret position
        this.currentChord = 'None';
        this.currentFretPosition = 0;
        
        // Colors
        this.colors = {
            fretboard: 'rgba(139, 69, 19, 0.7)',
            strings: 'rgba(255, 255, 255, 0.8)',
            frets: 'rgba(150, 150, 150, 0.9)',
            positions: 'rgba(0, 255, 0, 0.6)',
            strumEffect: 'rgba(0, 255, 255, 0.5)',
            chordText: 'rgba(255, 255, 0, 0.9)',
            positionGuide: 'rgba(255, 100, 100, 0.2)'
        };
    }
    
    /**
     * Initialize the UI feedback system
     */
    setup() {
        // Make sure canvas dimensions match the video
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.isActive = true;
        console.log('UI feedback system initialized');
        return true;
    }
    
    /**
     * Resize the canvas to match its parent container
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        if (container) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        }
    }
    
    /**
     * Show a temporary feedback message
     */
    showMessage(message, duration = 2000) {
        this.feedbackMessage = message;
        this.messageDuration = duration;
        this.messageStartTime = Date.now();
    }
    
    /**
     * Update the visual feedback based on hand tracking and motion analysis
     * @param {Object} handData - The detected hand landmarks from hand tracking
     * @param {Object} motionData - The analysis results from motion analysis
     */
    update(handData, motionData) {
        if (!this.isActive || !this.ctx) return;
        
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Store hand position data
        this.handPositions = handData;
        
        // Draw virtual fretboard
        this.drawVirtualFretboard();
        
        // Draw position guides if enabled
        if (this.showPositionGuide) {
            this.drawPositionGuide();
        }
        
        // Show strum animation if active
        if (this.isStrumAnimationActive) {
            this.updateStrumAnimation();
        }
        
        // Update and display feedback message if active
        this.updateFeedbackMessage();
        
        // Update chord and fret position display
        if (motionData) {
            if (motionData.chordType && motionData.chordType !== 'none') {
                this.currentChord = motionData.chordType;
            }
            this.currentFretPosition = motionData.fretPosition;
        }
        
        // Draw chord and fret position information
        this.drawChordInfo();
    }
    
    /**
     * Update hand position display based on detected hand data
     * @param {Object} handData - The detected hand landmarks
     * @param {Object} strummingMotion - Detected strumming motion
     * @param {Object} chordData - Detected chord information
     */
    updateHandPositionDisplay(handData, strummingMotion, chordData) {
        // Update hand positions
        this.handPositions = handData;
        
        // Start strum animation if strumming detected
        if (strummingMotion) {
            this.startStrumAnimation(strummingMotion.direction);
        }
        
        // Update chord information if available
        if (chordData && chordData.name !== 'Unknown') {
            this.currentChord = chordData.name;
            this.showMessage(`Chord: ${chordData.name}`, 1000);
        }
        
        // Update display
        this.update(handData, {
            chordType: chordData ? chordData.name : 'none',
            fretPosition: this.currentFretPosition
        });
    }
    
    /**
     * Start the strum animation
     */
    startStrumAnimation(direction) {
        this.isStrumAnimationActive = true;
        this.strumAnimationStartTime = Date.now();
        this.strumDirection = direction || 'down';
    }
    
    /**
     * Update the strum animation
     */
    updateStrumAnimation() {
        const now = Date.now();
        const elapsed = now - this.strumAnimationStartTime;
        
        if (elapsed > this.strumAnimationDuration) {
            this.isStrumAnimationActive = false;
            return;
        }
        
        // Animation progress from 0 to 1
        const progress = elapsed / this.strumAnimationDuration;
        
        // Draw strum effect
        this.ctx.fillStyle = this.colors.strumEffect;
        
        if (this.strumDirection === 'down') {
            // Top to bottom animation
            const height = this.canvas.height * progress;
            this.ctx.fillRect(0, 0, this.canvas.width, height);
        } else {
            // Bottom to top animation
            const height = this.canvas.height * progress;
            this.ctx.fillRect(0, this.canvas.height - height, this.canvas.width, height);
        }
    }
    
    /**
     * Update and display the feedback message
     */
    updateFeedbackMessage() {
        if (!this.feedbackMessage) return;
        
        const now = Date.now();
        const elapsed = now - this.messageStartTime;
        
        if (elapsed > this.messageDuration) {
            this.feedbackMessage = '';
            return;
        }
        
        // Calculate opacity based on time remaining
        const opacity = 1 - (elapsed / this.messageDuration);
        
        // Draw message
        this.ctx.font = '24px Arial';
        this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            this.feedbackMessage,
            this.canvas.width / 2,
            this.canvas.height - 50
        );
        this.ctx.textAlign = 'left';
    }
    
    /**
     * Draw the virtual fretboard
     */
    drawVirtualFretboard() {
        const { width, height } = this.canvas;
        
        // Calculate bottom gutter
        const bottomGutter = height * this.bottomGutterPercentage;
        
        // Position fretboard above the bottom gutter
        const fretboardY = height - this.fretboardHeight - bottomGutter;
        
        // Draw fretboard background
        this.ctx.fillStyle = this.colors.fretboard;
        this.ctx.fillRect(0, fretboardY, width, this.fretboardHeight);
        
        // Draw strings
        const stringSpacing = this.fretboardHeight / (this.stringCount + 1);
        this.ctx.strokeStyle = this.colors.strings;
        
        for (let i = 1; i <= this.stringCount; i++) {
            const y = fretboardY + (i * stringSpacing);
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.lineWidth = 3 - (i * 0.4); // Thicker strings at the top
            this.ctx.stroke();
        }
        
        // Draw frets
        const fretSpacing = width / (this.fretCount + 1);
        this.ctx.strokeStyle = this.colors.frets;
        this.ctx.lineWidth = 2;
        
        for (let i = 1; i <= this.fretCount; i++) {
            const x = i * fretSpacing;
            
            this.ctx.beginPath();
            this.ctx.moveTo(x, fretboardY);
            this.ctx.lineTo(x, fretboardY + this.fretboardHeight);
            this.ctx.stroke();
        }
        
        // Highlight the current position on the fretboard
        const fretX = this.currentFretPosition * fretSpacing;
        this.ctx.fillStyle = this.colors.positions;
        this.ctx.fillRect(
            fretX - (fretSpacing / 2),
            fretboardY,
            fretSpacing,
            this.fretboardHeight
        );
    }
    
    /**
     * Draw positioning guides for hands
     */
    drawPositionGuide() {
        const { width, height } = this.canvas;
        
        // Calculate the usable height based on gutter percentages
        const topGutter = height * this.topGutterPercentage;
        const bottomGutter = height * this.bottomGutterPercentage;
        const usableHeight = height - (topGutter + bottomGutter);
        
        // Left hand guide (fretboard area)
        this.ctx.fillStyle = this.colors.positionGuide;
        this.ctx.fillRect(0, topGutter, width * 0.5, usableHeight);
        
        // Right hand guide (strumming area)
        this.ctx.fillStyle = 'rgba(100, 100, 255, 0.2)';
        this.ctx.fillRect(width * 0.5, topGutter, width * 0.5, usableHeight);
        
        // Add text labels
        this.ctx.font = '18px Arial';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.fillText('Left Hand (Chord Position)', 20, topGutter + 30);
        this.ctx.fillText('Right Hand (Strumming)', width * 0.5 + 20, topGutter + 30);
    }
    
    /**
     * Draw chord and fret position information
     */
    drawChordInfo() {
        this.ctx.font = '24px Arial';
        this.ctx.fillStyle = this.colors.chordText;
        this.ctx.fillText(
            `Chord: ${this.currentChord}`,
            20,
            this.canvas.height - 10
        );
        
        this.ctx.fillText(
            `Fret: ${this.currentFretPosition}`,
            this.canvas.width - 150,
            this.canvas.height - 10
        );
    }
    
    /**
     * Toggle position guide visibility
     */
    togglePositionGuide() {
        this.showPositionGuide = !this.showPositionGuide;
        return this.showPositionGuide;
    }
} 