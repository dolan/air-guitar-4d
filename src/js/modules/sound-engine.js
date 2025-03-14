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
        this.strumCooldownMs = 60; // Reduced from 150ms to allow for faster strumming
    }
    
    /**
     * Set up the sound engine with Tone.js
     */
    async setup() {
        if (this.initialized) {
            return true;
        }
        
        try {
            // console.debug('Setting up sound engine with Tone.js');
            
            // Start the audio context (requires user interaction)
            await Tone.start();
            // console.debug('Tone.js audio context started successfully');
            
            // Create the audio components
            await this.initAudioChain();
            
            this.initialized = true;
            this.isMuted = false;
            // console.debug('Sound engine initialized successfully');
            
            return true;
        } catch (error) {
            console.error('Failed to initialize sound engine:', error);
            this.initialized = false;
            return false;
        }
    }
    
    /**
     * Initialize the audio processing chain with effects
     */
    async initAudioChain() {
        // console.debug('Initializing audio chain...');
        
        // Create synth
        this.synth = new Tone.PolySynth(Tone.Synth);
        
        // Create effects chain
        this.distortion = new Tone.Distortion(0);
        this.reverb = new Tone.Reverb(1.5);
        this.delay = new Tone.FeedbackDelay(0.25, 0);
        this.volumeNode = new Tone.Volume(0);
        
        // Connect the chain
        this.synth.connect(this.distortion);
        this.distortion.connect(this.reverb);
        this.reverb.connect(this.delay);
        this.delay.connect(this.volumeNode);
        this.volumeNode.toDestination();
        
        // Initialize synthesizer with guitar-like settings
        this.configureGuitarSynth();
        
        // console.debug('Audio chain initialized successfully. Synth ready:', !!this.synth, 'PolySynth ready:', !!this.polySynth);
    }
    
    /**
     * Configure synth with settings for different guitar types
     */
    configureGuitarSynth(type = 'acoustic') {
        if (!this.synth) return;
        
        const guitarSettings = {
            acoustic: {
                envelope: {
                    attack: 0.005,
                    decay: 0.1,
                    sustain: 0.3,
                    release: 1.2
                },
                oscillator: {
                    type: 'fatsawtooth',
                    count: 3,
                    spread: 20
                }
            },
            electric: {
                envelope: {
                    attack: 0.001,
                    decay: 0.2,
                    sustain: 0.5,
                    release: 0.8
                },
                oscillator: {
                    type: 'fmsquare',
                    modulationType: 'sine',
                    harmonicity: 1.2,
                    modulationIndex: 2
                }
            },
            bass: {
                envelope: {
                    attack: 0.02,
                    decay: 0.2,
                    sustain: 0.5,
                    release: 1.5
                },
                oscillator: {
                    type: 'fatsine',
                    count: 3,
                    spread: 40
                }
            }
        };
        
        // Get settings for the specified type
        const settings = guitarSettings[type] || guitarSettings.acoustic;
        
        // Apply settings to the synth
        this.synth.set({
            volume: -10, // Slightly quieter to prevent clipping
            envelope: settings.envelope,
            oscillator: settings.oscillator
        });
        
        // Store the current guitar type
        this.guitarType = type;
        
        // console.debug(`Synth configured for ${type} guitar`);
    }
    
    /**
     * Set the guitar type for sound generation
     */
    setGuitarType(type) {
        if (!this.initialized) {
            console.warn('Sound engine not initialized');
            return false;
        }
        
        this.configureGuitarSynth(type);
        // console.debug(`Guitar type changed to: ${type}`);
        return true;
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
     * Play a strum based on motion data
     */
    playStrum(motionData) {
        if (!this.initialized) {
            console.warn('Cannot play strum: Sound engine not initialized');
            return false;
        }
        
        if (this.isMuted) {
            // console.debug('Skipping strum: sound engine is muted');
            return false;
        }
        
        // Check if we're still in cooldown from the last strum
        const now = Tone.now();
        if (now - this.lastStrumTime < this.strumCooldownMs / 1000) {
            // console.debug(`Strum cooldown active (${this.strumCooldownMs}ms). Time since last strum: ${now - this.lastStrumTime}ms`);
            return false;
        }
        
        // Extract data from the motion data
        const {
            strumDetected,
            strumDirection,
            strumIntensity,
            chordType,
            fretPosition
        } = motionData;
        
        // Only play if a strum was actually detected
        if (!strumDetected) {
            // console.debug('No strum detected in motion data');
            return false;
        }
        
        // console.debug(`Playing strum: ${chordType} at fret ${fretPosition}, intensity: ${strumIntensity}`);
        
        // Get the notes for the chord at the specified fret
        const chordNotes = this.getChordNotes(chordType, fretPosition);
        
        // If no valid chord was found, play a single note
        if (!chordNotes || chordNotes.length === 0) {
            const openString = this.getNoteForString(3, fretPosition); // Use D string as default
            this.playNote(openString, strumIntensity);
            return true;
        }
        
        // console.debug(`Chord notes: ${chordNotes.join(', ')}`);
        
        // Calculate strum parameters
        const strumDuration = 0.1; // Total strum duration in seconds
        const strumVelocity = Math.min(0.9, 0.5 + (strumIntensity || 0.5)); // Volume based on intensity
        const strumDelay = 0.02; // Delay between notes in the strum
        
        // Adjust strum based on direction (up or down)
        if (strumDirection === 'down') {
            // Downstrum: low strings to high strings (bass to treble)
            this.playDownStrum(chordNotes, strumDuration, strumVelocity, strumDelay);
            // console.debug('Played downstrum');
        } else {
            // Upstrum: high strings to low strings (treble to bass)
            this.playUpStrum(chordNotes, strumDuration, strumVelocity, strumDelay);
            // console.debug('Played upstrum');
        }
        
        // Update the last strum time
        this.lastStrumTime = now;
        
        return true;
    }
    
    /**
     * Set master volume level (0-1)
     */
    setVolume(level) {
        if (!this.initialized || !this.volumeNode) {
            console.warn('Cannot set volume: Sound engine not initialized');
            return false;
        }
        
        // Clamp level to valid range
        this.volume = Math.max(0, Math.min(1, level));
        
        // Map 0-1 to dB range (-60 to 0)
        const dbLevel = this.volume === 0 ? -Infinity : (this.volume * 60) - 60;
        this.volumeNode.volume.value = dbLevel;
        
        // console.debug(`Volume set to: ${this.volume}`);
        return true;
    }
    
    /**
     * Mute or unmute the sound engine
     */
    setMuted(muted) {
        this.isMuted = muted;
        
        if (this.volumeNode) {
            this.volumeNode.mute = muted;
        }
        
        // console.debug(`Sound engine ${muted ? 'muted' : 'unmuted'}`);
        return true;
    }
    
    /**
     * Set effect level (0-1)
     */
    setEffectLevel(effectName, level) {
        if (!this.initialized) {
            console.warn('Cannot set effect: Sound engine not initialized');
            return false;
        }
        
        const clampedLevel = Math.max(0, Math.min(1, level));
        
        // Update the corresponding effect
        switch (effectName) {
            case 'distortion':
                this.distortion.distortion = clampedLevel;
                break;
            case 'reverb':
                this.reverb.wet.value = clampedLevel;
                break;
            case 'delay':
                this.delay.wet.value = clampedLevel;
                break;
            default:
                console.warn(`Unknown effect: ${effectName}`);
                return false;
        }
        
        // console.debug(`${effectName} effect set to: ${clampedLevel}`);
        return true;
    }
    
    /**
     * Play a single note
     */
    playNote(note, velocity = 0.8, duration = 0.5) {
        if (!this.initialized || this.isMuted) {
            // console.debug('Skipping note: sound engine not initialized or muted');
            return false;
        }
        
        // Handle note triggering
        if (this.synth) {
            // Calculate velocity value
            const vel = Math.min(1, Math.max(0.1, velocity));
            
            // Play the note
            this.synth.triggerAttackRelease(note, duration, Tone.now(), vel);
            return true;
        }
        
        return false;
    }
    
    /**
     * Play a test sound to verify audio is working
     */
    testSound() {
        if (!this.initialized) {
            console.warn('Cannot play test sound: Sound engine not initialized');
            return false;
        }
        
        // console.debug('Playing test sound...');
        
        const now = Tone.now();
        
        // First try with the poly synth
        try {
            // Play a C major chord
            if (this.synth) {
                const chord = ['C3', 'E3', 'G3'];
                this.synth.triggerAttackRelease(chord, 0.3, now, 0.5);
                // console.debug('PolySynth test sound played');
                return true;
            }
        } catch (polyError) {
            console.error('Error playing with poly synth:', polyError);
        }
        
        // console.debug('Test sound played');
        return true;
    }
} 