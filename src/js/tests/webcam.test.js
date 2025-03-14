/**
 * Webcam Module - Unit Tests
 * 
 * This file contains unit tests for the WebcamHandler class.
 * 
 * Run these tests using a test runner like Jest.
 */

import { WebcamHandler } from '../modules/webcam.js';

describe('WebcamHandler', () => {
    let webcamHandler;
    let mockVideoElement;
    
    beforeEach(() => {
        // Create a mock video element
        mockVideoElement = document.createElement('video');
        
        // Mock required video properties
        Object.defineProperty(mockVideoElement, 'videoWidth', { value: 1280 });
        Object.defineProperty(mockVideoElement, 'videoHeight', { value: 720 });
        
        // Create a new WebcamHandler instance for each test
        webcamHandler = new WebcamHandler(mockVideoElement);
        
        // Mock navigator.mediaDevices for testing
        global.navigator.mediaDevices = {
            enumerateDevices: jest.fn().mockResolvedValue([
                { kind: 'videoinput', deviceId: 'camera1', label: 'Test Camera 1' },
                { kind: 'videoinput', deviceId: 'camera2', label: 'Test Camera 2' },
                { kind: 'audioinput', deviceId: 'mic1', label: 'Test Microphone' }
            ]),
            getUserMedia: jest.fn().mockResolvedValue({
                getTracks: () => [{
                    stop: jest.fn()
                }]
            })
        };
    });
    
    afterEach(() => {
        jest.clearAllMocks();
        
        // Clean up any mocks
        if (webcamHandler.isActive) {
            webcamHandler.stop();
        }
    });
    
    test('should initialize with correct default values', () => {
        expect(webcamHandler.videoElement).toBe(mockVideoElement);
        expect(webcamHandler.stream).toBeNull();
        expect(webcamHandler.isActive).toBe(false);
        expect(webcamHandler.availableCameras).toEqual([]);
        expect(webcamHandler.selectedCameraId).toBeNull();
        expect(webcamHandler.processingCanvas instanceof HTMLCanvasElement).toBe(true);
        expect(webcamHandler.processingContext instanceof CanvasRenderingContext2D).toBe(true);
    });
    
    test('checkBrowserCompatibility should return true when getUserMedia is available', () => {
        expect(webcamHandler.checkBrowserCompatibility()).toBe(true);
    });
    
    test('checkBrowserCompatibility should return false when getUserMedia is not available', () => {
        // Mock navigator.mediaDevices without getUserMedia
        const originalMediaDevices = navigator.mediaDevices;
        delete navigator.mediaDevices.getUserMedia;
        
        expect(webcamHandler.checkBrowserCompatibility()).toBe(false);
        
        // Restore original mediaDevices
        navigator.mediaDevices = originalMediaDevices;
    });
    
    test('enumerateDevices should fetch available cameras', async () => {
        const cameras = await webcamHandler.enumerateDevices();
        
        expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalled();
        expect(cameras.length).toBe(2); // Only video devices
        expect(webcamHandler.availableCameras.length).toBe(2);
        expect(webcamHandler.selectedCameraId).toBe('camera1'); // First camera selected by default
    });
    
    test('setup should initialize the webcam successfully', async () => {
        // Mock successful setup
        const success = await webcamHandler.setup();
        
        expect(success).toBe(true);
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
        expect(webcamHandler.isActive).toBe(true);
    });
    
    test('setup should handle errors properly', async () => {
        // Mock getUserMedia failure
        navigator.mediaDevices.getUserMedia = jest.fn().mockRejectedValue(
            new Error('Permission denied')
        );
        
        // Mock the webcamHandler.handleError method
        webcamHandler.handleError = jest.fn().mockImplementation((error) => {
            throw new Error(`Webcam error: ${error.message}`);
        });
        
        await expect(webcamHandler.setup()).rejects.toThrow('Webcam error: Permission denied');
        expect(webcamHandler.isActive).toBe(false);
    });
    
    test('stop should stop the webcam stream', async () => {
        // First setup the webcam
        await webcamHandler.setup();
        expect(webcamHandler.isActive).toBe(true);
        
        // Then stop it
        webcamHandler.stop();
        
        expect(webcamHandler.isActive).toBe(false);
        expect(webcamHandler.videoElement.srcObject).toBeNull();
    });
    
    test('switchCamera should change the selected camera', async () => {
        // First setup the webcam with default camera
        await webcamHandler.setup();
        expect(webcamHandler.selectedCameraId).toBe('camera1');
        
        // Mock stop and setup for switching
        webcamHandler.stop = jest.fn();
        const originalSetup = webcamHandler.setup;
        webcamHandler.setup = jest.fn().mockResolvedValue(true);
        
        // Switch camera
        await webcamHandler.switchCamera('camera2');
        
        expect(webcamHandler.stop).toHaveBeenCalled();
        expect(webcamHandler.selectedCameraId).toBe('camera2');
        expect(webcamHandler.setup).toHaveBeenCalled();
        
        // Restore original setup
        webcamHandler.setup = originalSetup;
    });
    
    test('processVideoFrame should return null if webcam is not active', () => {
        expect(webcamHandler.processVideoFrame()).toBeNull();
    });
    
    test('getDimensions should return correct video dimensions', async () => {
        await webcamHandler.setup();
        
        const dimensions = webcamHandler.getDimensions();
        
        expect(dimensions.width).toBe(1280);
        expect(dimensions.height).toBe(720);
    });
}); 