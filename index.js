const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

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

// Live stream current timelapse images for a specific camera
app.get('/api/live/:camera', (req, res) => {
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
    const FRAME_RATE = 1000 / 10; // 10 FPS for live preview
    
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
        console.log('Stopped live streaming');
    });
});

// Download current timelapse as video
app.get('/api/download/:camera', (req, res) => {
    const camera = req.params.camera;
    const cameraFolder = path.join(SNAPSHOT_FOLDER, camera);
    
    if (!fs.existsSync(cameraFolder)) {
        return res.status(404).json({ error: 'No snapshots available for this camera' });
    }

    // Find all date folders and sort them to get the latest
    const isDirectory = source => fs.lstatSync(source).isDirectory();
    const dateFolders = fs.readdirSync(cameraFolder)
        .filter(name => isDirectory(path.join(cameraFolder, name)))
        .sort();
    
    if (dateFolders.length === 0) {
        return res.status(404).json({ error: 'No snapshot dates available for this camera' });
    }
    
    // Get the latest date folder
    const latestDate = dateFolders[dateFolders.length - 1];
    const snapshotFolder = path.join(cameraFolder, latestDate);

    const images = fs.readdirSync(snapshotFolder).filter(file => file.endsWith('.jpg'));
    if (images.length === 0) {
        return res.status(404).json({ error: 'No JPEG images found for this camera' });
    }

    // Create output video path with fixed filename (will be overwritten each time)
    const outputPath = path.join(__dirname, 'temp', `${camera}_current.mp4`);
    const tempDir = path.dirname(outputPath);
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Use ffmpeg to create video from images (overwrites existing file with -y flag)
    const ffmpegCommand = `ffmpeg -y -framerate 30 -pattern_type glob -i "${snapshotFolder}/*.jpg" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`;
    
    exec(ffmpegCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('FFmpeg error:', error);
            return res.status(500).json({ error: 'Failed to create video' });
        }

        // Send the video file with a descriptive filename
        res.download(outputPath, `${camera}_${latestDate}.mp4`, (err) => {
            if (err) {
                console.error('Download error:', err);
            }
            // No need to clean up - file will be overwritten on next download
        });
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
            body { font-family: Arial, sans-serif; max-width: 1400px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            .camera-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 20px; }
            .camera-card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .camera-card h2 { padding: 10px; margin: 0; background: #f5f5f5; }
            .camera-card video { width: 100%; display: block; }
            .camera-card img { width: 100%; display: block; }
            .controls { padding: 10px; background: #f9f9f9; border-top: 1px solid #ddd; }
            .controls button { 
                margin: 5px; 
                padding: 8px 16px; 
                border: none; 
                border-radius: 4px; 
                cursor: pointer; 
                font-size: 14px;
            }
            .btn-primary { background: #007bff; color: white; }
            .btn-primary:hover { background: #0056b3; }
            .btn-success { background: #28a745; color: white; }
            .btn-success:hover { background: #1e7e34; }
            .btn-secondary { background: #6c757d; color: white; }
            .btn-secondary:hover { background: #545b62; }
            .stream-container { position: relative; }
            .stream-overlay { 
                position: absolute; 
                top: 10px; 
                left: 10px; 
                background: rgba(0,0,0,0.7); 
                color: white; 
                padding: 5px 10px; 
                border-radius: 4px; 
                font-size: 12px;
            }
            .tab-container { margin-bottom: 10px; }
            .tab-button { 
                padding: 8px 16px; 
                border: 1px solid #ddd; 
                background: #f8f9fa; 
                cursor: pointer; 
                border-radius: 4px 4px 0 0;
                margin-right: 2px;
            }
            .tab-button.active { background: white; border-bottom: 1px solid white; }
            .tab-content { display: none; }
            .tab-content.active { display: block; }
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
                <div class="tab-container">
                    <button class="tab-button active" onclick="switchTab('${camera}', 'completed')">Completed Timelapse</button>
                    <button class="tab-button" onclick="switchTab('${camera}', 'live')">Live Stream</button>
                </div>
                <div id="${camera}-completed" class="tab-content active">
                    <video controls>
                        <source src="/api/video/${camera}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                </div>
                <div id="${camera}-live" class="tab-content">
                    <div class="stream-container">
                        <img id="${camera}-stream" src="/api/live/${camera}" alt="Live Stream">
                        <div class="stream-overlay">LIVE</div>
                    </div>
                </div>
                <div class="controls">
                    <button class="btn-primary" onclick="downloadTimelapse('${camera}')">Download Current Timelapse</button>
                    <button class="btn-secondary" onclick="refreshStream('${camera}')">Refresh Live Stream</button>
                </div>
            </div>
            `;
        });
    }
    
    html += `
        </div>
        <script>
            function switchTab(camera, tab) {
                // Hide all tab contents for this camera
                document.getElementById(camera + '-completed').classList.remove('active');
                document.getElementById(camera + '-live').classList.remove('active');
                
                // Remove active class from all tab buttons for this camera
                const buttons = document.querySelectorAll(\`[onclick*="\${camera}"]\`);
                buttons.forEach(btn => {
                    if (btn.classList.contains('tab-button')) {
                        btn.classList.remove('active');
                    }
                });
                
                // Show selected tab content
                document.getElementById(camera + '-' + tab).classList.add('active');
                
                // Add active class to clicked button
                event.target.classList.add('active');
            }
            
            function downloadTimelapse(camera) {
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = 'Creating Video...';
                button.disabled = true;
                
                fetch(\`/api/download/\${camera}\`)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Failed to create video');
                        }
                        return response.blob();
                    })
                    .then(blob => {
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = \`\${camera}_timelapse.mp4\`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                    })
                    .catch(error => {
                        alert('Error creating video: ' + error.message);
                    })
                    .finally(() => {
                        button.textContent = originalText;
                        button.disabled = false;
                    });
            }
            
            function refreshStream(camera) {
                const img = document.getElementById(camera + '-stream');
                const src = img.src;
                img.src = '';
                setTimeout(() => {
                    img.src = src + '?t=' + new Date().getTime();
                }, 100);
            }
        </script>
    </body>
    </html>
    `;
    
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

