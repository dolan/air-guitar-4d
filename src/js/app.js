/**
 * Air Guitar 4D - Main Application
 * 
 * This is the entry point for the Air Guitar 4D application.
 * It handles the initialization and coordination of the different modules.
 */

// Import modules
import { WebcamHandler } from './modules/webcam.js';
import { HandTracking } from './modules/hand-tracking.js';
import { MotionAnalysis } from './modules/motion-analysis.js';
import { SoundEngine } from './modules/sound-engine.js';
import { UIFeedback } from './modules/ui-feedback.js';

class AirGuitarApp {
    constructor() {
        this.initialized = false;
        this.elements = {
            video: document.getElementById('webcam'),
            overlay: document.getElementById('overlay'),
            guitarType: document.getElementById('guitar-type')
        };
        
        // Will be initialized in setup()
        this.webcamHandler = null;
        this.handTracking = null;
        this.motionAnalysis = null;
        this.soundEngine = null;
        this.uiFeedback = null;
    }
    
    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('Initializing Air Guitar 4D application...');
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize modules
            this.webcamHandler = new WebcamHandler(this.elements.video);
            this.handTracking = new HandTracking(this.elements.video, this.elements.overlay);
            this.motionAnalysis = new MotionAnalysis();
            this.soundEngine = new SoundEngine();
            this.uiFeedback = new UIFeedback(this.elements.overlay);
            
            // Display welcome message and startup instructions
            this.showWelcomeMessage();
            
            this.initialized = true;
            console.log('Air Guitar 4D initialized successfully!');
        } catch (error) {
            console.error('Failed to initialize Air Guitar 4D:', error);
            this.showErrorMessage('Failed to initialize application. Please refresh and try again.');
        }
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Guitar type selection
        this.elements.guitarType.addEventListener('change', (event) => {
            const selectedGuitar = event.target.value;
            console.log(`Guitar type changed to: ${selectedGuitar}`);
            if (this.soundEngine) {
                this.soundEngine.setGuitarType(selectedGuitar);
            }
        });
    }
    
    /**
     * Display welcome message
     */
    showWelcomeMessage() {
        // Simple welcome alert for now - will be replaced with a proper UI component later
        alert('Welcome to Air Guitar 4D!\nClick OK to continue.');
    }
    
    /**
     * Display error message
     */
    showErrorMessage(message) {
        alert(`Error: ${message}`);
    }
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const airGuitarApp = new AirGuitarApp();
    airGuitarApp.init();
}); 