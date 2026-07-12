# Server image: builds the Angular dashboard and runs the Node backend (which
# serves the built dashboard + API). No native deps — pg and bcryptjs are pure JS.
FROM node:26-slim

WORKDIR /app

# Install workspace deps first for better layer caching.
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY client/package.json client/
COPY frontend/package.json frontend/
RUN npm ci

# App source, then build the dashboard.
COPY . .
RUN npm run build -w frontend

ENV ED_HOST=0.0.0.0 ED_PORT=3400
EXPOSE 3400
CMD ["npm", "run", "start", "-w", "backend"]
