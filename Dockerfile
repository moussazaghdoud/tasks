# How the server is built and run in production.
#
# A Dockerfile rather than a detected build, because detection is what went
# wrong: the host inferred a static site, served `dist/` as plain files and
# never started this server — so /api/voice answered 405 and every voice memo
# silently fell back to on-device parsing. This says exactly what to do, and
# pins the Node version the rest of the project is built with.

FROM node:22-slim

WORKDIR /app

# Dependencies first: this layer is reused whenever only source files change.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

# Produces dist/ (the web app) and dist-server/ (this server).
RUN npm run build

ENV NODE_ENV=production
# The server reads PORT, which the host provides; 8080 is only the fallback.
ENV PORT=8080
EXPOSE 8080

# `server/index.ts` resolves dist/ from the working directory, so start here.
CMD ["node", "dist-server/index.js"]
