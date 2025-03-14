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
            guitarType: document.getElementById('guitar-type'),
            startCameraBtn: document.getElementById('start-camera'),
            enableAudioBtn: document.getElementById('enable-audio'),
            cameraSelect: document.getElementById('camera-select'),
            cameraStatus: document.getElementById('camera-status'),
            audioStatus: document.getElementById('audio-status'),
            planeAngleSlider: document.getElementById('plane-angle-slider'),
            planeAngleValue: document.getElementById('plane-angle-value'),
            // Effects controls
            distortionSlider: document.getElementById('distortion-slider'),
            reverbSlider: document.getElementById('reverb-slider'),
            delaySlider: document.getElementById('delay-slider'),
            volumeSlider: document.getElementById('volume-slider'),
            distortionValue: document.getElementById('distortion-value'),
            reverbValue: document.getElementById('reverb-value'),
            delayValue: document.getElementById('delay-value'),
            volumeValue: document.getElementById('volume-value')
        };
        
        // Will be initialized in setup()
        this.webcamHandler = null;
        this.handTracking = null;
        this.motionAnalysis = null;
        this.soundEngine = null;
        this.uiFeedback = null;
        
        // Animation frame for webcam processing
        this.animationFrameId = null;
        this.processingActive = false;
    }
    
    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('Initializing Air Guitar 4D application...');
            
            // Initialize modules
            this.webcamHandler = new WebcamHandler(this.elements.video);
            this.handTracking = new HandTracking(this.elements.video, this.elements.overlay);
            
            // Ensure mirroring is always enabled (though it should be by default)
            this.webcamHandler.setMirrored(true);
            this.handTracking.setMirrored(true);
            
            this.motionAnalysis = new MotionAnalysis();
            this.soundEngine = new SoundEngine();
            this.uiFeedback = new UIFeedback(this.elements.overlay);
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Note: Sound engine will be initialized on user interaction
            
            // Set up motion analysis callbacks
            this.motionAnalysis.setStrumCallback((strumData) => {
                this.soundEngine.playStrum(strumData);
            });
            
            // Show camera options immediately if possible
            this.initCameraOptions();
            
            // Display welcome message
            this.showWelcomeMessage();
            
            // Make sure the angle display shows the default value
            this.elements.planeAngleSlider.value = this.handTracking.guitarPlaneAngle;
            this.elements.planeAngleValue.textContent = `${this.handTracking.guitarPlaneAngle}°`;
            
            this.initialized = true;
            console.log('Air Guitar 4D initialized successfully!');
        } catch (error) {
            console.error('Failed to initialize Air Guitar 4D:', error);
            this.showErrorMessage('Failed to initialize application. Please refresh and try again.');
        }
    }
    
    /**
     * Initialize camera dropdown with available cameras
     */
    async initCameraOptions() {
        try {
            // Check browser compatibility first
            if (!this.webcamHandler.checkBrowserCompatibility()) {
                this.disableCameraInterface('Your browser does not support webcam access. Please use a modern browser like Chrome, Firefox, or Edge.');
                return;
            }
            
            // Try to get camera list
            const cameras = await this.webcamHandler.enumerateDevices();
            
            // Update camera select options
            this.elements.cameraSelect.innerHTML = '';
            
            if (cameras.length === 0) {
                this.elements.cameraSelect.innerHTML = '<option value="">No cameras found</option>';
                this.disableCameraInterface('No cameras detected on your device.');
                return;
            }
            
            cameras.forEach(camera => {
                const option = document.createElement('option');
                option.value = camera.deviceId;
                option.text = camera.label || `Camera ${this.elements.cameraSelect.options.length + 1}`;
                this.elements.cameraSelect.appendChild(option);
            });
            
            // Enable camera select dropdown
            this.elements.cameraSelect.disabled = false;
            this.elements.startCameraBtn.disabled = false;
            
            // Set initial camera status message
            this.setCameraStatus('Click "Start Camera" to begin');
            
        } catch (error) {
            console.error('Error initializing camera options:', error);
            this.disableCameraInterface('Error accessing camera information.');
        }
    }
    
    /**
     * Start the webcam and processing
     */
    async startCamera() {
        try {
            this.elements.startCameraBtn.disabled = true;
            this.setCameraStatus('Accessing camera...');
            
            // If the button text says "Stop Camera", we're turning off the camera
            if (this.elements.startCameraBtn.textContent === 'Stop Camera') {
                this.stopCamera();
                return;
            }

            console.log('Starting camera setup...');
            const success = await this.webcamHandler.setup();
            
            if (success) {
                this.elements.startCameraBtn.textContent = 'Stop Camera';
                this.elements.startCameraBtn.disabled = false;
                this.elements.cameraSelect.disabled = true;
                this.setCameraStatus('Camera started'); // Show status message
                
                console.log('Camera setup successful, initializing hand tracking...');
                
                // Ensure mirroring is set correctly
                this.webcamHandler.setMirrored(true);
                
                // Initialize hand tracking if needed
                try {
                    await this.handTracking.setup();
                    console.log('Hand tracking initialized successfully');
                } catch (handTrackingError) {
                    console.error('Error setting up hand tracking:', handTrackingError);
                    this.setCameraStatus('Camera started, but hand tracking failed to initialize');
                }
                
                // Start the video processing
                console.log('Starting video processing...');
                this.startProcessing();
            } else {
                throw new Error('Failed to initialize camera');
            }
        } catch (error) {
            console.error('Error starting camera:', error);
            this.setCameraStatus(error.message || 'Failed to access camera');
            this.elements.startCameraBtn.disabled = false;
        }
    }
    
    /**
     * Stop the webcam and processing
     */
    stopCamera() {
        // Stop the video processing
        this.stopProcessing();
        
        // Stop the webcam
        this.webcamHandler.stop();
        
        // Update UI
        this.elements.startCameraBtn.textContent = 'Start Camera';
        this.elements.cameraSelect.disabled = false;
        this.setCameraStatus('Camera stopped');
    }
    
    /**
     * Start video processing loop
     */
    startProcessing() {
        if (this.processingActive) return;
        
        // Activate motion analysis
        if (this.motionAnalysis && !this.motionAnalysis.isActive) {
            console.debug('Activating motion analysis system...');
            this.motionAnalysis.setup();
        }
        
        this.processingActive = true;
        this.processVideoFrame();
    }
    
    /**
     * Stop video processing
     */
    stopProcessing() {
        this.processingActive = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    /**
     * Process each video frame
     */
    async processVideoFrame() {
        if (!this.processingActive) {
            console.debug('Processing not active, stopping frame processing');
            return;
        }
        
        try {
            // Verify that all components are ready
            if (!this.handTracking || !this.handTracking.isRunning) {
                console.debug('Hand tracking not ready, attempting to initialize...');
                if (this.handTracking) {
                    try {
                        await this.handTracking.setup();
                        console.debug('Hand tracking initialized in processVideoFrame');
                    } catch (setupError) {
                        console.error('Failed to initialize hand tracking in processVideoFrame:', setupError);
                    }
                }
            }
            
            // Process the frame with hand tracking
            console.debug('Processing frame...');
            const handData = await this.handTracking.processFrame();
            
            if (handData) {
                console.debug('Hand data received:', Object.keys(handData).filter(k => handData[k]));
                
                // Check for strumming motion
                const strummingMotion = this.handTracking.detectStrummingMotion();
                
                // Check for chord formation
                const chordData = this.handTracking.detectChordFormation();
                
                // Get hand orientations
                const orientations = this.handTracking.getHandOrientations();
                
                // Pass data to motion analysis
                const motionResult = this.motionAnalysis.processHandData(handData, strummingMotion, chordData, orientations);
                
                // Update UI feedback
                this.uiFeedback.updateHandPositionDisplay(handData, strummingMotion, chordData);
                
                // If motion analysis detected a strum, play it
                if (motionResult && motionResult.strumDetected) {
                    this.soundEngine.playStrum(motionResult);
                }
            } else {
                console.debug('No hand data received from processFrame');
            }
        } catch (error) {
            console.error("Error in frame processing:", error);
            
            // Don't stop processing due to errors, just log and continue
            if (this.handTracking) {
                console.debug('Checking hand tracking state:', {
                    isRunning: this.handTracking.isRunning,
                    detector: !!this.handTracking.detector
                });
            }
        }
        
        // Request next frame
        this.animationFrameId = requestAnimationFrame(() => this.processVideoFrame());
    }
    
    /**
     * Set up event listeners for all interactive elements
     */
    setupEventListeners() {
        // Start camera button
        this.elements.startCameraBtn.addEventListener('click', () => {
            this.startCamera();
        });
        
        // Enable audio button
        this.elements.enableAudioBtn.addEventListener('click', () => {
            this.enableAudio();
        });
        
        // Camera select dropdown
        this.elements.cameraSelect.addEventListener('change', (event) => {
            if (event.target.value) {
                this.webcamHandler.switchCamera(event.target.value);
                this.handTracking.resizeCanvas();
            }
        });
        
        // Guitar type selection
        this.elements.guitarType.addEventListener('change', (event) => {
            if (this.soundEngine) {
                this.soundEngine.setGuitarType(event.target.value);
            }
        });
        
        // Guitar plane angle slider
        this.elements.planeAngleSlider.addEventListener('input', (event) => {
            const angle = parseInt(event.target.value);
            if (this.handTracking) {
                this.handTracking.setGuitarPlaneAngle(angle);
                this.elements.planeAngleValue.textContent = `${angle}°`;
            }
        });
        
        // Additional event for smooth transitions when slider is released
        this.elements.planeAngleSlider.addEventListener('change', (event) => {
            const finalAngle = parseInt(event.target.value, 10);
            if (this.handTracking) {
                // This will ensure the final angle is properly set and any animations complete
                this.handTracking.setGuitarPlaneAngle(finalAngle);
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            if (this.handTracking) {
                this.handTracking.resizeCanvas();
            }
        });
        
        // Effect sliders
        const effectSliders = {
            distortion: this.elements.distortionSlider,
            reverb: this.elements.reverbSlider,
            delay: this.elements.delaySlider,
            volume: this.elements.volumeSlider
        };
        
        const effectLabels = {
            distortion: this.elements.distortionValue,
            reverb: this.elements.reverbValue,
            delay: this.elements.delayValue,
            volume: this.elements.volumeValue
        };
        
        // Set up event listeners for all effect sliders
        if (effectSliders.distortion) {
            effectSliders.distortion.addEventListener('input', (event) => {
                const value = parseInt(event.target.value) / 100;
                this.soundEngine.setEffectLevel('distortion', value);
                effectLabels.distortion.textContent = `${event.target.value}%`;
            });
        }
        
        if (effectSliders.reverb) {
            effectSliders.reverb.addEventListener('input', (event) => {
                const value = parseInt(event.target.value) / 100;
                this.soundEngine.setEffectLevel('reverb', value);
                effectLabels.reverb.textContent = `${event.target.value}%`;
            });
        }
        
        if (effectSliders.delay) {
            effectSliders.delay.addEventListener('input', (event) => {
                const value = parseInt(event.target.value) / 100;
                this.soundEngine.setEffectLevel('delay', value);
                effectLabels.delay.textContent = `${event.target.value}%`;
            });
        }
        
        if (effectSliders.volume) {
            effectSliders.volume.addEventListener('input', (event) => {
                const value = parseInt(event.target.value) / 100;
                this.soundEngine.setVolume(value);
                effectLabels.volume.textContent = `${event.target.value}%`;
            });
        }
    }
    
    /**
     * Set camera status message
     */
    setCameraStatus(message) {
        this.elements.cameraStatus.textContent = message;
        this.elements.cameraStatus.style.display = message ? 'block' : 'none';
    }
    
    /**
     * Disable camera interface when not supported
     */
    disableCameraInterface(message) {
        this.elements.startCameraBtn.disabled = true;
        this.elements.cameraSelect.disabled = true;
        this.setCameraStatus(message);
    }
    
    /**
     * Display welcome message
     */
    showWelcomeMessage() {
        // Display welcome message in camera status
        this.setCameraStatus('Welcome to Air Guitar 4D! Start the camera to begin playing.');
        
        // Display audio initialization message
        this.setAudioStatus('Click "Enable Audio" to activate sound after camera is working.');
    }
    
    /**
     * Display error message
     */
    showErrorMessage(message) {
        this.setCameraStatus(message);
        console.error(message);
    }
    
    /**
     * Set audio status message
     */
    setAudioStatus(message) {
        if (!this.elements.audioStatus) return;
        
        this.elements.audioStatus.textContent = message;
        this.elements.audioStatus.style.display = message ? 'block' : 'none';
    }
    
    /**
     * Enable audio with user interaction
     */
    async enableAudio() {
        if (!this.soundEngine) {
            console.error('Sound engine not initialized');
            return;
        }
        
        try {
            // Disable the button during initialization
            this.elements.enableAudioBtn.disabled = true;
            this.setAudioStatus('Starting audio engine...');
            
            // Initialize the audio engine
            await this.soundEngine.setup();
            
            console.debug('Audio engine initialized successfully');
            this.setAudioStatus('Audio engine ready! You can now make sounds.');
            
            // Update the button to show it's active
            this.elements.enableAudioBtn.textContent = 'Audio Enabled';
            this.elements.enableAudioBtn.classList.add('active');
            
            // Test the sound after a short delay
            try {
                setTimeout(() => {
                    console.debug('Testing sound...');
                    this.soundEngine.testSound();
                    
                    // Clear the message after the test sound
                    setTimeout(() => {
                        this.setAudioStatus('');
                    }, 2000);
                }, 500);
            } catch (testError) {
                console.error('Error testing sound:', testError);
                this.setAudioStatus('Audio initialized but test sound failed.');
            }
        } catch (error) {
            console.error('Error enabling audio:', error);
            this.setAudioStatus('⚠️ Audio error: Click Enable Audio to retry');
            this.elements.enableAudioBtn.disabled = false;
        }
    }
}

// Export a function that initializes the application
export default function initApp() {
    console.log('Initializing Air Guitar 4D application...');
    
    // Initialize the application when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            const airGuitarApp = new AirGuitarApp();
            airGuitarApp.init();
        });
    } else {
        // DOM is already loaded
        const airGuitarApp = new AirGuitarApp();
        airGuitarApp.init();
    }
}

// For backwards compatibility, also run the app if this script is loaded directly
if (typeof window !== 'undefined' && !window.isImportedAsModule) {
    window.isImportedAsModule = true;
    document.addEventListener('DOMContentLoaded', () => {
        const airGuitarApp = new AirGuitarApp();
        airGuitarApp.init();
    });
} 