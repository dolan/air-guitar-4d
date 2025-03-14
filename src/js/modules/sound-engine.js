/**
 * Sound Engine Module
 * 
 * Handles audio synthesis using Tone.js to generate guitar sounds
 * based on motion analysis data
 */

export class SoundEngine {
    constructor() {
        this.initialized = false;
        this.guitarType = 'acoustic'; // Default guitar type
        this.volume = 0.8; // Default volume (0-1)
        
        // These will be initialized after user interaction
        this.synth = null;
        this.polySynth = null;
        this.effects = {
            distortion: null,
            reverb: null,
            tremolo: null,
            delay: null
        };
        this.master = null;
        
        // Guitar tuning (standard tuning: E A D G B E)
        this.strings = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
        
        // Common chord shapes (root position)
        this.chordDefinitions = {
            'E': ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'],
            'Em': ['E2', 'B2', 'E3', 'G3', 'B3', 'E4'],
            'A': ['A2', 'E3', 'A3', 'C#4', 'E4', 'A4'],
            'Am': ['A2', 'E3', 'A3', 'C4', 'E4', 'A4'],
            'D': ['D3', 'A3', 'D4', 'F#4', 'A4', 'D5'],
            'Dm': ['D3', 'A3', 'D4', 'F4', 'A4', 'D5'],
            'G': ['G2', 'B2', 'D3', 'G3', 'B3', 'G4'],
            'Gm': ['G2', 'Bb2', 'D3', 'G3', 'Bb3', 'G4'],
            'C': ['C3', 'E3', 'G3', 'C4', 'E4', 'C5'],
            'Cm': ['C3', 'Eb3', 'G3', 'C4', 'Eb4', 'C5'],
            // Add more chords as needed
        };
        
        // Current state
        this.currentChord = null;
        this.isMuted = false;
        this.lastStrumTime = 0;
        this.strumCooldownMs = 80; // Minimum time between strums
    }
    
    /**
     * Initialize the sound engine with Tone.js
     * Must be called after a user interaction
     */
    async setup() {
        if (this.initialized) {
            return true; // Already initialized
        }
        
        try {
            console.debug('Setting up sound engine with Tone.js');
            
            // This will throw an error if not called from a user gesture
            await Tone.start();
            console.debug('Tone.js audio context started successfully');
            
            // Mark as initialized BEFORE setting up the audio chain
            this.initialized = true;
            
            // Create our audio chain
            this.initializeAudioChain();
            
            console.debug('Sound engine initialized successfully');
            return true;
        } catch (error) {
            console.error('Error setting up sound engine:', error);
            this.initialized = false;
            throw error; // Re-throw to let calling code handle it
        }
    }
    
    /**
     * Initialize the complete audio chain
     */
    initializeAudioChain() {
        console.debug('Initializing audio chain...');
        
        // Create master volume control
        this.master = new Tone.Volume(this.volume * 2 - 2).toDestination(); // Convert 0-1 to dB (-2 to 0)
        
        // Initialize effects
        this.initializeEffects();
        
        // Create synthesizer based on guitar type
        this.configureSynthForGuitarType(this.guitarType);
        
        console.debug('Audio chain initialized successfully. Synth ready:', !!this.synth, 'PolySynth ready:', !!this.polySynth);
    }
    
    /**
     * Initialize audio effects
     */
    initializeEffects() {
        // Distortion effect (for electric guitar)
        this.effects.distortion = new Tone.Distortion({
            distortion: 0.3,
            wet: 0
        }).connect(this.master);
        
        // Reverb (for acoustic and ambient sounds)
        this.effects.reverb = new Tone.Reverb({
            decay: 1.5,
            wet: 0.2
        }).connect(this.master);
        
        // Delay effect
        this.effects.delay = new Tone.FeedbackDelay({
            delayTime: 0.25,
            feedback: 0.25,
            wet: 0
        }).connect(this.master);
        
        // Tremolo effect (for special effects)
        this.effects.tremolo = new Tone.Tremolo({
            frequency: 4,
            depth: 0.5,
            wet: 0
        }).start().connect(this.master);
    }
    
    /**
     * Configure the synthesizer based on guitar type
     * @param {string} type - The type of guitar ("acoustic", "electric", "bass")
     */
    configureSynthForGuitarType(type) {
        // Clean up previous synth if exists
        if (this.synth) {
            this.synth.disconnect();
        }
        if (this.polySynth) {
            this.polySynth.disconnect();
        }
        
        // Configure different synth settings based on guitar type
        switch (type) {
            case 'electric':
                // Electric guitar-like synth
                this.synth = new Tone.PluckSynth({
                    attackNoise: 2,
                    dampening: 4000,
                    resonance: 0.95
                });
                
                // Poly synth for chords
                this.polySynth = new Tone.PolySynth({
                    voice: Tone.MonoSynth,
                    options: {
                        oscillator: {
                            type: 'square'
                        },
                        envelope: {
                            attack: 0.005,
                            decay: 0.3,
                            sustain: 0.2,
                            release: 1.2
                        },
                        filter: {
                            Q: 1,
                            type: 'lowpass',
                            rolloff: -12
                        }
                    }
                });
                
                // Connect to effects chain for electric guitar
                this.synth.chain(this.effects.distortion, this.master);
                this.polySynth.chain(this.effects.distortion, this.effects.delay, this.master);
                
                // Set effect levels
                this.effects.distortion.wet.value = 0.4;
                this.effects.reverb.wet.value = 0.2;
                this.effects.delay.wet.value = 0.15;
                break;
                
            case 'bass':
                // Bass guitar-like synth
                this.synth = new Tone.Synth({
                    oscillator: {
                        type: 'triangle'
                    },
                    envelope: {
                        attack: 0.05,
                        decay: 0.2,
                        sustain: 0.4,
                        release: 1.5
                    }
                });
                
                // Poly synth for bass
                this.polySynth = new Tone.PolySynth({
                    voice: Tone.MonoSynth,
                    options: {
                        oscillator: {
                            type: 'triangle'
                        },
                        envelope: {
                            attack: 0.04,
                            decay: 0.2,
                            sustain: 0.5,
                            release: 1.5
                        },
                        filter: {
                            Q: 2,
                            type: 'lowpass',
                            rolloff: -24,
                            frequency: 600
                        }
                    }
                });
                
                // Connect to effects chain for bass
                this.synth.chain(this.effects.distortion, this.master);
                this.polySynth.chain(this.effects.distortion, this.master);
                
                // Set effect levels for bass
                this.effects.distortion.wet.value = 0.1;
                this.effects.reverb.wet.value = 0.05;
                this.effects.delay.wet.value = 0;
                break;
                
            case 'acoustic':
            default:
                // Acoustic guitar-like synth
                this.synth = new Tone.PluckSynth({
                    attackNoise: 1,
                    dampening: 3000,
                    resonance: 0.9
                });
                
                // Poly synth for chords
                this.polySynth = new Tone.PolySynth({
                    voice: Tone.MonoSynth,
                    options: {
                        oscillator: {
                            type: 'triangle'
                        },
                        envelope: {
                            attack: 0.01,
                            decay: 0.3,
                            sustain: 0.5,
                            release: 1.8
                        }
                    }
                });
                
                // Connect to effects chain for acoustic guitar
                this.synth.chain(this.effects.reverb, this.master);
                this.polySynth.chain(this.effects.reverb, this.master);
                
                // Set effect levels for acoustic
                this.effects.distortion.wet.value = 0;
                this.effects.reverb.wet.value = 0.3;
                this.effects.delay.wet.value = 0.1;
                break;
        }
        
        console.debug(`Synth configured for ${type} guitar`);
    }
    
    /**
     * Change the guitar type
     * @param {string} type - The type of guitar ("acoustic", "electric", "bass")
     */
    setGuitarType(type) {
        if (!['acoustic', 'electric', 'bass'].includes(type)) {
            console.error(`Invalid guitar type: ${type}`);
            return;
        }
        
        if (this.guitarType === type) return; // No change needed
        
        this.guitarType = type;
        console.debug(`Guitar type changed to: ${type}`);
        
        // Reconfigure synth for new guitar type
        if (this.initialized) {
            this.configureSynthForGuitarType(type);
        }
    }
    
    /**
     * Get notes for a specific chord
     * @param {string} chordName - Name of the chord (e.g., "Em", "C", "G")
     * @param {number} fretPosition - Position on fretboard (0-12)
     * @returns {Array} Array of note names
     */
    getChordNotes(chordName, fretPosition = 0) {
        // Default to E chord if not found
        const baseChord = this.chordDefinitions[chordName] || this.chordDefinitions['E'];
        
        if (fretPosition === 0) {
            return baseChord;
        }
        
        // Transpose the chord by fret position
        return baseChord.map(note => {
            // Extract note name and octave
            const noteName = note.slice(0, -1);
            const octave = parseInt(note.slice(-1));
            
            // Get semitone value for the note
            const noteValues = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 
                               'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 
                               'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11};
            
            // Calculate new note
            let semitonesFromC = noteValues[noteName];
            semitonesFromC += fretPosition;
            
            // Calculate new octave and adjust semitone value
            let newOctave = octave;
            while (semitonesFromC >= 12) {
                semitonesFromC -= 12;
                newOctave += 1;
            }
            
            // Convert back to note name
            const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const newNoteName = noteNames[semitonesFromC];
            
            return `${newNoteName}${newOctave}`;
        });
    }
    
    /**
     * Play a guitar strum based on motion analysis
     * @param {Object} motionData - Data from motion analysis
     */
    playStrum(motionData) {
        try {
            if (!this.initialized) {
                console.warn('Skipping strum: sound engine not initialized');
                return;
            }
            
            if (this.isMuted) {
                console.debug('Skipping strum: sound engine is muted');
                return;
            }
            
            if (!this.polySynth) {
                console.error('Cannot play strum: polySynth not initialized');
                return;
            }
            
            const now = Date.now();
            if (now - this.lastStrumTime < this.strumCooldownMs) {
                console.debug(`Strum cooldown active (${this.strumCooldownMs}ms). Time since last strum: ${now - this.lastStrumTime}ms`);
                return; // Prevent strumming too frequently
            }
            this.lastStrumTime = now;
            
            // Extract data from motion analysis
            const {
                strumDetected,
                strumDirection,
                strumIntensity,
                fretPosition,
                chordType
            } = motionData;
            
            if (!strumDetected) {
                console.debug('No strum detected in motion data');
                return;
            }
            
            console.debug(`Playing strum: ${chordType} at fret ${fretPosition}, intensity: ${strumIntensity}`);
            
            // Get chord notes
            const chordNotes = this.getChordNotes(chordType, fretPosition);
            
            if (!chordNotes || chordNotes.length === 0) {
                console.error(`No notes found for chord: ${chordType} at fret ${fretPosition}`);
                return;
            }
            
            console.debug(`Chord notes: ${chordNotes.join(', ')}`);
            
            // Calculate velocity based on strum intensity (0.5-1.0 range)
            const velocity = 0.5 + (strumIntensity * 0.5);
            
            // Play the chord
            if (strumDirection === 'down') {
                // Downstrum - play from low string to high string with slight delay
                const now = Tone.now();
                const staggerTime = 0.01; // 10ms between string hits
                
                chordNotes.forEach((note, index) => {
                    this.polySynth.triggerAttackRelease(note, "8n", now + (index * staggerTime), velocity);
                });
                console.debug('Played downstrum');
            } else {
                // Upstrum - play from high string to low string with slight delay
                const now = Tone.now();
                const staggerTime = 0.01; // 10ms between string hits
                
                [...chordNotes].reverse().forEach((note, index) => {
                    this.polySynth.triggerAttackRelease(note, "8n", now + (index * staggerTime), velocity);
                });
                console.debug('Played upstrum');
            }
        } catch (error) {
            console.error('Error playing strum:', error);
        }
    }
    
    /**
     * Set the volume of the sound engine
     * @param {number} level - Volume level (0-1)
     */
    setVolume(level) {
        this.volume = Math.max(0, Math.min(1, level));
        console.debug(`Volume set to: ${this.volume}`);
        
        if (this.master) {
            // Convert 0-1 range to dB range (-infinity to 0)
            this.master.volume.value = this.volume * 2 - 2; // -2dB to 0dB
        }
    }
    
    /**
     * Mute/unmute the sound engine
     * @param {boolean} muted - True to mute, false to unmute
     */
    setMuted(muted) {
        this.isMuted = muted;
        console.debug(`Sound engine ${muted ? 'muted' : 'unmuted'}`);
    }
    
    /**
     * Set effect level
     * @param {string} effectName - Name of the effect ('distortion', 'reverb', 'delay', 'tremolo')
     * @param {number} level - Effect level (0-1)
     */
    setEffectLevel(effectName, level) {
        if (!this.initialized) {
            console.warn('Tried to set effect level before initialization');
            return;
        }
        
        if (!this.effects[effectName]) {
            console.error(`Effect not found: ${effectName}`);
            return;
        }
        
        const clampedLevel = Math.max(0, Math.min(1, level));
        this.effects[effectName].wet.value = clampedLevel;
        console.debug(`${effectName} effect set to: ${clampedLevel}`);
    }
    
    /**
     * Play a single note
     * @param {string} note - Note to play (e.g., "C4", "E3")
     * @param {number} duration - Note duration in seconds
     * @param {number} velocity - Note velocity (0-1)
     */
    playNote(note, duration = 0.5, velocity = 0.8) {
        if (!this.initialized || this.isMuted) {
            console.debug('Skipping note: sound engine not initialized or muted');
            return;
        }
        
        try {
            this.synth.triggerAttackRelease(note, duration, Tone.now(), velocity);
        } catch (error) {
            console.error('Error playing note:', error);
        }
    }
    
    /**
     * Test the sound engine - plays a simple chord
     */
    testSound() {
        if (!this.initialized) {
            console.warn('Cannot test sound: engine not initialized');
            return;
        }
        
        try {
            // Check if synth is available
            if (!this.synth) {
                console.error('Cannot play test sound: synth not initialized');
                return;
            }
            
            console.debug('Playing test sound...');
            
            // Play a simple E chord
            const chord = this.getChordNotes('E', 0);
            const now = Tone.now();
            
            // Play each note with a slight delay
            chord.forEach((note, index) => {
                this.synth.triggerAttackRelease(note, "8n", now + (index * 0.1), 0.7);
            });
            
            console.debug('Test sound played');
        } catch (error) {
            console.error('Error testing sound:', error);
        }
    }
} 