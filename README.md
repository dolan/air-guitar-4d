# Air Guitar 4D

A web-based application that allows users to play virtual air guitar using hand tracking technology. This application uses your webcam to detect hand movements and generates guitar sounds in real-time based on your gestures.

## Features

- Real-time hand tracking using TensorFlow.js/MediaPipe
- Guitar sound synthesis via Tone.js
- Multiple guitar types (acoustic, electric, bass)
- Visual feedback to guide your playing
- Works entirely in the browser - no installation required

## Prerequisites

- Modern web browser with webcam access
- JavaScript enabled
- Recommended: Adequate lighting for better hand tracking

## Getting Started

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/air-guitar-4d.git
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm start
   ```

4. Open your browser and navigate to `http://localhost:5000`

## How to Play

1. Allow camera permissions when prompted
2. Position yourself so your hands are clearly visible
3. Use your left hand to form chord shapes
4. Use your right hand to strum the virtual strings
5. Experiment with different positions and movements

## Project Structure

```
air-guitar-4d/
├── index.html              # Main HTML entry point
├── src/                    # Source code
│   ├── js/                 # JavaScript files
│   │   ├── app.js          # Main application entry point
│   │   └── modules/        # Application modules
│   │       ├── webcam.js            # Webcam handling
│   │       ├── hand-tracking.js     # Hand tracking using TensorFlow.js
│   │       ├── motion-analysis.js   # Gesture analysis
│   │       ├── sound-engine.js      # Sound generation using Tone.js
│   │       └── ui-feedback.js       # Visual feedback system
│   ├── css/                # Stylesheets
│   │   └── styles.css      # Main stylesheet
│   └── assets/             # Images and other assets
├── public/                 # Static files
├── package.json            # Project dependencies
└── README.md               # Project documentation
```

## Technologies Used

- [TensorFlow.js](https://www.tensorflow.org/js) - Machine learning for hand tracking
- [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) - Hand landmark detection
- [Tone.js](https://tonejs.github.io/) - Audio synthesis
- HTML5, CSS3, and JavaScript (ES6+)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Inspiration from real air guitarists everywhere
- TensorFlow.js and MediaPipe teams for their incredible work on hand tracking
- Tone.js team for their amazing audio synthesis library 