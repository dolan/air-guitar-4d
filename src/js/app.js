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
            cameraSelect: document.getElementById('camera-select'),
            cameraStatus: document.getElementById('camera-status')
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
            this.motionAnalysis = new MotionAnalysis();
            this.soundEngine = new SoundEngine();
            this.uiFeedback = new UIFeedback(this.elements.overlay);
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Show camera options immediately if possible
            this.initCameraOptions();
            
            // Display welcome message
            this.showWelcomeMessage();
            
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
            
            const success = await this.webcamHandler.setup();
            
            if (success) {
                this.elements.startCameraBtn.textContent = 'Stop Camera';
                this.elements.startCameraBtn.disabled = false;
                this.elements.cameraSelect.disabled = true;
                this.setCameraStatus(''); // Clear status message
                
                // Start the video processing
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
    processVideoFrame() {
        if (!this.processingActive) return;
        
        // Get processed frame data from webcam handler
        const imageData = this.webcamHandler.processVideoFrame();
        
        if (imageData) {
            // Pass the frame data to hand tracking module
            // Note: This will be implemented when hand tracking is built
            // this.handTracking.processFrame(imageData);
        }
        
        // Request next frame
        this.animationFrameId = requestAnimationFrame(() => this.processVideoFrame());
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Start/Stop camera button
        this.elements.startCameraBtn.addEventListener('click', () => {
            if (this.webcamHandler.isActive) {
                this.stopCamera();
            } else {
                this.startCamera();
            }
        });
        
        // Camera selection dropdown
        this.elements.cameraSelect.addEventListener('change', async (event) => {
            const selectedDeviceId = event.target.value;
            if (selectedDeviceId && selectedDeviceId !== this.webcamHandler.selectedCameraId) {
                // If camera is already active, restart it with the new device
                const wasActive = this.webcamHandler.isActive;
                
                if (wasActive) {
                    this.stopCamera();
                }
                
                // Set the new camera
                this.webcamHandler.selectedCameraId = selectedDeviceId;
                
                if (wasActive) {
                    // Restart camera with new device
                    await this.startCamera();
                }
            }
        });
        
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
        // Display welcome message in camera status instead of alert
        this.setCameraStatus('Welcome to Air Guitar 4D! Start the camera to begin playing.');
    }
    
    /**
     * Display error message
     */
    showErrorMessage(message) {
        this.setCameraStatus(message);
        console.error(message);
    }
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const airGuitarApp = new AirGuitarApp();
    airGuitarApp.init();
}); 