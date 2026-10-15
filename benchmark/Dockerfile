# Optional: --build-arg BASE_IMAGE=rl-tracker-bot compares using the current deployed Chromium.
ARG BASE_IMAGE=oven/bun:1.3.8
FROM ${BASE_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && (command -v chromium || apt-get install -y --no-install-recommends chromium) && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/crawler && /opt/crawler/bin/pip install --no-cache-dir 'scrapling[fetchers]==0.4.15' crawl4ai==0.9.5 psutil==7.2.2
ENV CRAWL4AI_NO_CLOUD_NOTICE=1
WORKDIR /work
ENTRYPOINT ["/opt/crawler/bin/python"]
