# Use the official Node.js 16 as a parent image
FROM node:21

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available) to the container
COPY package*.json ./

# Install any dependencies
RUN npm install

# Copy the rest of your application's code to the container
COPY . .

# Make port 3000 available outside of this container
EXPOSE 3000

# Run server.js when the container launches
CMD ["node", "server.js"]

