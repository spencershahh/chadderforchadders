FROM node:18-slim

WORKDIR /app

# Copy the entire chadder-ai directory
COPY . .

# Install dependencies
RUN npm install

EXPOSE 3000

CMD ["npm", "run", "server"] 