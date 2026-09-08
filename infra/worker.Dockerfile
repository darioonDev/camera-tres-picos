FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --chown=node:node infra/stream-worker.mjs infra/overlay-text.mjs ./infra/
USER node
ENV TZ=America/Sao_Paulo
CMD ["node", "infra/stream-worker.mjs"]
