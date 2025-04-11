#!/bin/bash

apt update && DEBIAN_FRONTEND=noninteractive apt install -y tzdata

# Configuration variables
RTSP_STREAM_BASE_URL="${RTSP_STREAM_BASE_URL}"
CAMERA_PATHS="${CAMERA_PATHS}" # Comma-separated list of camera paths
SNAPSHOT_INTERVAL="${SNAPSHOT_INTERVAL:-60}" # In seconds, default to 60 if not specified
START_TIME="${START_TIME}" # Format HH:MM
END_TIME="${END_TIME}" # Format HH:MM
SNAPSHOT_FOLDER="${SNAPSHOT_FOLDER:-/snapshots}" # Folder for snapshots
TIMELAPSE_FOLDER="${TIMELAPSE_FOLDER:-/timelapse}" # Folder for timelapse videos, separate from snapshots
TIME_ZONE="${TIME_ZONE:-UTC}" # Default time zone to UTC, can be overridden

# Set the time zone
export TZ="${TIME_ZONE}"

# Convert comma-separated CAMERA_PATHS to array
IFS=',' read -ra CAMERAS <<< "$CAMERA_PATHS"

# Ensure the script keeps running every day
while true; do
    # Setup daily variables
    DATE=$(date +%Y%m%d)
    
    # Convert START_TIME and END_TIME for comparison
    START_TIME_COMP=$(echo $START_TIME | tr -d ':' | sed 's/^0*//')
    END_TIME_COMP=$(echo $END_TIME | tr -d ':' | sed 's/^0*//')

    # Wait until the start time if necessary
    while true; do
        CURRENT_TIME=$(date +%H%M | sed 's/^0*//')
        if [[ $((10#$CURRENT_TIME)) -ge $((10#$START_TIME_COMP)) ]]; then
            break
        fi
        echo "Waiting for start time ${START_TIME}..."
        sleep 60 # Check every minute
    done

    # Function to check if current time is within the start and end time
    function is_time_to_capture() {
        local current_time=$(date +%H%M | sed 's/^0*//')
        [[ $((10#$current_time)) -ge $((10#$START_TIME_COMP)) && $((10#$current_time)) -le $((10#$END_TIME_COMP)) ]]
    }

    # Create array to store PIDs of background processes
    declare -a PIDS=()

    # Start a capture process for each camera
    for camera in "${CAMERAS[@]}"; do
        # Create camera-specific folders
        CAMERA_SNAPSHOT_FOLDER="${SNAPSHOT_FOLDER}/${camera}/${DATE}"
        CAMERA_TIMELAPSE_FOLDER="${TIMELAPSE_FOLDER}/${camera}"
        
        mkdir -p "${CAMERA_SNAPSHOT_FOLDER}"
        mkdir -p "${CAMERA_TIMELAPSE_FOLDER}"
        
        # Full RTSP URL for this camera
        RTSP_STREAM_URL="${RTSP_STREAM_BASE_URL}/${camera}"
        
        # Start capture process for this camera in background
        (
            # Capture snapshots within the time range
            while is_time_to_capture; do
                timestamp=$(date +%Y%m%d%H%M%S)
                snapshot_filename="${CAMERA_SNAPSHOT_FOLDER}/snapshot_${timestamp}.jpg"

                # Capture snapshot
                ffmpeg -hide_banner -loglevel error -rtsp_transport tcp -i "${RTSP_STREAM_URL}" -frames:v 1 "${snapshot_filename}"

                # Wait for the next interval
                sleep "${SNAPSHOT_INTERVAL}"
            done

            # Create timelapse video
            TIMELAPSE_FILENAME="timelapse_${camera}_${DATE}.mp4"
            ffmpeg -framerate 24 -pattern_type glob -i "${CAMERA_SNAPSHOT_FOLDER}/snapshot_*.jpg" \
                -c:v libx264 -pix_fmt yuv420p "${CAMERA_TIMELAPSE_FOLDER}/${TIMELAPSE_FILENAME}"

            echo "Timelapse for camera ${camera} on ${DATE} created in ${CAMERA_TIMELAPSE_FOLDER}."

            # Clean up snapshots if desired
            rm -rf ${CAMERA_SNAPSHOT_FOLDER}
        ) &
        
        # Store PID of background process
        PIDS+=($!)
    done

    # Wait for all capture processes to complete
    for pid in "${PIDS[@]}"; do
        wait $pid
    done

    # Wait until the next day if script ends before midnight to avoid immediate restart
    sleep 60
done