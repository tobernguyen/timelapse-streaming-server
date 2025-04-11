const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const TIMELAPSE_FOLDER = process.env.TIMELAPSE_FOLDER || path.join(__dirname, 'timelapse');
const SNAPSHOT_FOLDER = process.env.SNAPSHOT_FOLDER || path.join(__dirname, 'snapshots');

app.use(express.static(path.join(__dirname, 'public')));

// Function to find all camera folders
function findCameras() {
    if (!fs.existsSync(TIMELAPSE_FOLDER)) {
        return [];
    }
    
    const isDirectory = source => fs.lstatSync(source).isDirectory();
    return fs.readdirSync(TIMELAPSE_FOLDER)
        .filter(name => isDirectory(path.join(TIMELAPSE_FOLDER, name)));
}

// Function to find the latest timelapse video for a camera
function findLatestTimelapse(cameraFolder) {
    if (!fs.existsSync(cameraFolder)) {
        return null;
    }
    
    const videos = fs.readdirSync(cameraFolder)
        .filter(file => file.endsWith('.mp4'))
        .sort(); // Sort alphanumerically
    
    return videos.length > 0 ? videos[videos.length - 1] : null;
}

// List all available cameras
app.get('/api/cameras', (req, res) => {
    const cameras = findCameras();
    res.json(cameras);
});

// Stream timelapse for a specific camera
app.get('/api/video/:camera', (req, res) => {
    const camera = req.params.camera;
    const cameraFolder = path.join(TIMELAPSE_FOLDER, camera);
    
    if (!fs.existsSync(cameraFolder)) {
        return res.status(404).json({ error: 'Camera not found' });
    }

    const videoFile = findLatestTimelapse(cameraFolder);
    if (!videoFile) {
        return res.status(404).json({ error: 'No timelapse video found for this camera' });
    }

    const videoPath = path.join(cameraFolder, videoFile);
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        });
        file.pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        });
        fs.createReadStream(videoPath).pipe(res);
    }
});

// Live stream images from a specific camera (if snapshots are available)
app.get('/api/stream/:camera', (req, res) => {
    const camera = req.params.camera;
    const cameraFolder = path.join(SNAPSHOT_FOLDER, camera);
    
    if (!fs.existsSync(cameraFolder)) {
        return res.status(404).json({ error: 'No snapshots available for this camera' });
    }

    // Find all date folders and sort them to get the latest
    const isDirectory = source => fs.lstatSync(source).isDirectory();
    const dateFolders = fs.readdirSync(cameraFolder)
        .filter(name => isDirectory(path.join(cameraFolder, name)))
        .sort(); // Sort alphanumerically - dates in YYYYMMDD format will sort chronologically
    
    if (dateFolders.length === 0) {
        return res.status(404).json({ error: 'No snapshot dates available for this camera' });
    }
    
    // Get the latest date folder
    const latestDate = dateFolders[dateFolders.length - 1];
    const snapshotFolder = path.join(cameraFolder, latestDate);

    let images = fs.readdirSync(snapshotFolder).filter(file => file.endsWith('.jpg'));
    if (images.length === 0) {
        return res.status(404).json({ error: 'No JPEG images found for this camera' });
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
            // Loop back to the beginning
            currentIndex = 0;
            // Refresh the list of images in case new ones have been added
            images = fs.readdirSync(snapshotFolder).filter(file => file.endsWith('.jpg')).sort();
            if (images.length === 0) {
                clearInterval(streamInterval);
                res.end();
                return;
            }
        }

        const imagePath = path.join(snapshotFolder, images[currentIndex]);
        try {
            const imageBuffer = fs.readFileSync(imagePath);
            res.write(`--frame\r\n`);
            res.write(`Content-Type: image/jpeg\r\n\r\n`);
            res.write(imageBuffer, 'binary');
            res.write(`\r\n`);
            currentIndex++;
        } catch (error) {
            console.error(`Error reading image: ${imagePath}`, error);
            currentIndex++;
        }
    }, FRAME_RATE);

    res.on('close', () => {
        clearInterval(streamInterval);
        res.end();
        console.log('Stopped streaming');
    });
});

// Create a simple HTML interface
app.get('/', (req, res) => {
    const cameras = findCameras();
    
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Multi-Camera Timelapse Viewer</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            .camera-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
            .camera-card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .camera-card h2 { padding: 10px; margin: 0; background: #f5f5f5; }
            .camera-card video { width: 100%; display: block; }
        </style>
    </head>
    <body>
        <h1>Multi-Camera Timelapse Viewer</h1>
        <div class="camera-grid">
    `;
    
    if (cameras.length === 0) {
        html += '<p>No cameras found. Please check your configuration.</p>';
    } else {
        cameras.forEach(camera => {
            html += `
            <div class="camera-card">
                <h2>${camera}</h2>
                <video controls>
                    <source src="/api/video/${camera}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
            `;
        });
    }
    
    html += `
        </div>
    </body>
    </html>
    `;
    
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

