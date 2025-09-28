# Use the official Node.js 16 as a parent image
FROM node:21

# Set the working directory inside the container
WORKDIR /usr/src/app

# Install FFmpeg and other system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json (if available) to the container
COPY package*.json ./

# Install any dependencies
RUN npm install

# Copy the rest of your application's code to the container
COPY . .

# Create temp directory for video processing
RUN mkdir -p /usr/src/app/temp

# Make port 3000 available outside of this container
EXPOSE 3000

# Run server.js when the container launches
CMD ["node", "index.js"]

