const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const BASE_FOLDER = path.join(__dirname, 'path_to_your_images_folder'); // Base images folder

// Function to find the largest subfolder
function findLargestSubfolder(baseFolder) {
    const isDirectory = source => fs.lstatSync(source).isDirectory();
    const getDirectories = source =>
        fs.readdirSync(source).map(name => path.join(source, name)).filter(isDirectory);
    const directories = getDirectories(baseFolder);
    if (directories.length === 0) {
        return null; // No directories found
    }
    // Assuming alphanumeric sorting, the 'largest' folder would be the last one
    directories.sort(); // Sorts directories in ascending order, so the 'largest' is the last
    return directories[directories.length - 1];
}

app.get('/video', (req, res) => {
    const largestFolder = findLargestSubfolder(BASE_FOLDER);
    if (!largestFolder) {
        return res.status(404).send('No folders found');
    }

    let images = fs.readdirSync(largestFolder).filter(file => file.endsWith('.jpg'));
    if (images.length === 0) {
        return res.status(404).send('No JPEG images found in the largest folder');
    }
    // Sort images by name (assuming this also sorts them in the desired order)
    images.sort();

    let currentIndex = 0;
    const FRAME_RATE = 1000 / 30; // 30 FPS
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache'
    });

    const streamInterval = setInterval(() => {
        if (currentIndex >= images.length) {
            clearInterval(streamInterval);
            res.end();
            return;
        }

        const imagePath = path.join(largestFolder, images[currentIndex]);
        const imageBuffer = fs.readFileSync(imagePath);
        res.write(`--frame\r\n`);
        res.write(`Content-Type: image/jpeg\r\n\r\n`);
        res.write(imageBuffer, 'binary');
        res.write(`\r\n`);
        currentIndex++;
    }, FRAME_RATE);

    res.on('close', () => {
        clearInterval(streamInterval);
        res.end();
        console.log('Stopped streaming');
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

