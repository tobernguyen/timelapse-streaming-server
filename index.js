const express = require('express');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = 3000; // Port where the app will be listening
const IMAGE_FOLDER = path.join(__dirname, 'path_to_your_images_folder'); // Update this path
const FRAME_RATE = 1000 / 30; // Adjust frame rate (30 fps here)

app.get('/video', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache'
    });

    let images = fs.readdirSync(IMAGE_FOLDER).filter(file => file.endsWith('.jpg'));
    // Sort images by timestamp
    images.sort();

    let currentIndex = 0;
    const streamInterval = setInterval(() => {
        if (currentIndex >= images.length) {
            currentIndex = 0; // Loop video
            // If you want to stop streaming after the last image, use clearInterval(streamInterval) here
        }

        const imagePath = path.join(IMAGE_FOLDER, images[currentIndex]);
        const imageBuffer = fs.readFileSync(imagePath);

        res.write(`--frame\r\n`);
        res.write(`Content-Type: image/jpeg\r\n\r\n`);
        res.write(imageBuffer, 'binary');
        res.write(`\r\n`);

        currentIndex++;
    }, FRAME_RATE);

    // When the connection is closed.
    res.on('close', () => {
        clearInterval(streamInterval);
        res.end();
        console.log('Stopped streaming');
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

